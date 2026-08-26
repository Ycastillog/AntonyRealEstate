/**
 * Antony CRM backend adapter (Supabase JS v2, classic/deferred script).
 *
 * Public contract:
 * - Auth methods return Supabase session/user data and throw AntonyCrmError on failure.
 * - loadWorkspace() returns camelCase rows ordered for UI consumption. auditLog is
 *   deeply frozen, newest first, and capped at 300 entries.
 * - Mutations await a server response and return the confirmed row/RPC payload in
 *   camelCase. Audit rows have no public write path in this adapter.
 * - humanizeError(error) returns a safe Spanish message. Thrown errors also retain
 *   non-sensitive code, status, and details fields for programmatic handling.
 *
 * Supabase may use browser storage for the auth session. This adapter never uses
 * localStorage (or any browser storage) for CRM business data.
 */
(function (root) {
  'use strict';

  var AUTH_STORAGE_KEY = 'antony-real-estate-crm-auth-v1';
  var MAX_AUDIT_ROWS = 300;
  var OMIT = {};
  var BLOCKED_KEYS = {
    '__proto__': true,
    'prototype': true,
    'constructor': true
  };

  function isPlainObject(value) {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]') {
      return false;
    }

    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function snakeToCamel(key) {
    return String(key).replace(/_([a-z0-9])/g, function (_match, letter) {
      return letter.toUpperCase();
    });
  }

  function camelToSnake(key) {
    return String(key)
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[\s-]+/g, '_')
      .toLowerCase();
  }

  function mapFromDatabase(value, depth) {
    var currentDepth = depth || 0;
    if (currentDepth > 40) {
      return null;
    }

    if (Array.isArray(value)) {
      return value.map(function (item) {
        return mapFromDatabase(item, currentDepth + 1);
      });
    }

    if (!isPlainObject(value)) {
      return value;
    }

    var mapped = {};
    Object.keys(value).forEach(function (key) {
      var mappedKey;
      if (BLOCKED_KEYS[key]) {
        return;
      }

      mappedKey = snakeToCamel(key);
      if (!BLOCKED_KEYS[mappedKey]) {
        mapped[mappedKey] = mapFromDatabase(value[key], currentDepth + 1);
      }
    });
    return mapped;
  }

  function mapToDatabase(value, depth) {
    var currentDepth = depth || 0;
    if (currentDepth > 40) {
      throw validationError('Los datos contienen demasiados niveles.', 'payload');
    }

    if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
      return OMIT;
    }

    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      if (!isFinite(value)) {
        throw validationError('Los datos contienen un número no válido.', 'payload');
      }
      return value;
    }

    if (Object.prototype.toString.call(value) === '[object Date]') {
      if (isNaN(value.getTime())) {
        throw validationError('Los datos contienen una fecha no válida.', 'payload');
      }
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      return value.map(function (item) {
        var mappedItem = mapToDatabase(item, currentDepth + 1);
        return mappedItem === OMIT ? null : mappedItem;
      });
    }

    if (!isPlainObject(value)) {
      throw validationError('Los datos contienen un valor no compatible.', 'payload');
    }

    var mapped = {};
    Object.keys(value).forEach(function (key) {
      var mappedKey;
      var mappedValue;
      if (BLOCKED_KEYS[key]) {
        return;
      }

      mappedKey = camelToSnake(key);
      if (BLOCKED_KEYS[mappedKey]) {
        return;
      }

      mappedValue = mapToDatabase(value[key], currentDepth + 1);
      if (mappedValue !== OMIT) {
        mapped[mappedKey] = mappedValue;
      }
    });
    return mapped;
  }

  function normalizeSaleRecord(record) {
    var normalized;
    if (!isPlainObject(record)) {
      return record;
    }

    normalized = Object.assign({}, record);
    if (!normalized.saleStatus && normalized.status) {
      normalized.saleStatus = normalized.status;
    }
    delete normalized.status;
    return normalized;
  }

  function mapSaleToDatabase(record) {
    var mapped = mapToDatabase(record);
    if (mapped.sale_status !== undefined && mapped.status === undefined) {
      mapped.status = mapped.sale_status;
    }
    delete mapped.sale_status;
    // This is a UI-derived value; the canonical dates live in the installment plan.
    delete mapped.commission_due_date;
    return mapped;
  }

  function deepFreeze(value) {
    if (!value || (typeof value !== 'object' && typeof value !== 'function') || Object.isFrozen(value)) {
      return value;
    }

    Object.keys(value).forEach(function (key) {
      deepFreeze(value[key]);
    });
    return Object.freeze(value);
  }

  function safeDiagnostic(value) {
    var text;
    if (typeof value !== 'string' || !value) {
      return null;
    }

    text = value
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[correo oculto]')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[id oculto]')
      .replace(/\b(?:sb_secret_|sb_publishable_)[A-Za-z0-9_-]+\b/gi, '[clave oculta]')
      .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g, '[token oculto]')
      .replace(/https?:\/\/[^\s]+/gi, '[url oculta]')
      .replace(/(=\s*)\([^)]*\)/g, '$1([valor oculto])');

    if (text.length > 240) {
      text = text.slice(0, 237) + '...';
    }
    return text;
  }

  function makeAdapterError(message, code, status, kind, details) {
    var error = new Error(message);
    var publicDetails = {
      kind: kind || 'unknown',
      retryable: !!(details && details.retryable)
    };

    error.name = 'AntonyCrmError';
    error.code = code || 'CRM_ERROR';
    error.status = status || 0;
    error.isAntonyCrmError = true;

    if (details && details.operation) {
      publicDetails.operation = details.operation;
    }
    if (details && details.field) {
      publicDetails.field = details.field;
    }
    if (details && details.databaseCode) {
      publicDetails.databaseCode = details.databaseCode;
    }
    if (details && typeof details.originalStatus === 'number') {
      publicDetails.originalStatus = details.originalStatus;
    }
    if (details && details.summary) {
      publicDetails.summary = details.summary;
    }

    error.details = Object.freeze(publicDetails);
    return error;
  }

  function validationError(message, field) {
    return makeAdapterError(message, 'VALIDATION_ERROR', 422, 'validation', {
      field: field || 'payload',
      retryable: false
    });
  }

  function normalizeError(error, operation) {
    var rawCode;
    var rawStatus;
    var code;
    var status;
    var lowerCode;
    var lowerMessage;
    var kind = 'unknown';
    var message = 'No se pudo completar la operación. Inténtalo de nuevo.';
    var retryable = false;
    var summary;

    if (error && error.isAntonyCrmError) {
      return error;
    }

    rawCode = error && error.code !== undefined && error.code !== null
      ? String(error.code)
      : '';
    rawStatus = error && (error.status !== undefined ? error.status : error.statusCode);
    rawStatus = Number(rawStatus);
    if (!isFinite(rawStatus)) {
      rawStatus = 0;
    }

    lowerCode = rawCode.toLowerCase();
    lowerMessage = error && typeof error.message === 'string'
      ? error.message.toLowerCase()
      : '';

    if (
      rawStatus === 401 ||
      lowerCode === '401' ||
      lowerCode === 'invalid_credentials' ||
      lowerCode === 'bad_jwt' ||
      lowerCode === 'jwt_expired' ||
      lowerMessage.indexOf('invalid login credentials') !== -1 ||
      lowerMessage.indexOf('jwt expired') !== -1
    ) {
      kind = 'unauthorized';
      status = 401;
      message = lowerCode === 'invalid_credentials' || lowerMessage.indexOf('invalid login credentials') !== -1
        ? 'El correo o la contraseña no son correctos.'
        : 'Tu sesión no es válida o ha vencido. Inicia sesión de nuevo.';
    } else if (rawStatus === 403 || lowerCode === '42501' || lowerCode === 'insufficient_privilege') {
      kind = 'forbidden';
      status = 403;
      message = 'No tienes permiso para realizar esta acción.';
    } else if (rawStatus === 409 || lowerCode === '409' || lowerCode === '23505' || lowerCode === 'unique_violation') {
      kind = 'conflict';
      status = 409;
      message = 'Ya existe un registro con esos datos.';
    } else if (lowerCode === '23503' || lowerCode === 'foreign_key_violation') {
      kind = 'conflict';
      status = 409;
      message = 'La operación entra en conflicto con otros registros relacionados.';
    } else if (
      rawStatus === 400 ||
      rawStatus === 422 ||
      lowerCode === '23502' ||
      lowerCode === '23514' ||
      lowerCode === '22p02' ||
      lowerCode === '22023' ||
      lowerCode === 'p0001' ||
      lowerCode.indexOf('validation') !== -1
    ) {
      kind = 'validation';
      status = 422;
      message = 'Revisa los datos enviados e inténtalo de nuevo.';
    } else if (rawStatus === 404 || lowerCode === 'pgrst116' || lowerCode === 'not_found') {
      kind = 'not_found';
      status = 404;
      message = 'No se encontró el registro solicitado.';
    } else if (rawStatus === 429 || lowerCode === 'over_request_rate_limit' || lowerCode === 'rate_limit_exceeded') {
      kind = 'rate_limit';
      status = 429;
      retryable = true;
      message = 'Hay demasiadas solicitudes en este momento. Espera un poco y vuelve a intentar.';
    } else if (
      lowerMessage.indexOf('failed to fetch') !== -1 ||
      lowerMessage.indexOf('network') !== -1 ||
      lowerCode === 'network_error'
    ) {
      kind = 'network';
      status = 0;
      retryable = true;
      message = 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
    } else if (rawStatus >= 500) {
      kind = 'server';
      status = rawStatus;
      retryable = true;
      message = 'El servidor no pudo completar la operación. Inténtalo de nuevo.';
    } else {
      status = rawStatus || 0;
    }

    code = rawCode || (status ? 'HTTP_' + status : 'CRM_ERROR');
    summary = safeDiagnostic(error && error.details);

    return makeAdapterError(message, code, status, kind, {
      operation: operation || null,
      databaseCode: /^\d{5}$/.test(rawCode) ? rawCode : null,
      originalStatus: rawStatus,
      retryable: retryable,
      summary: summary
    });
  }

  function humanizeError(error) {
    return normalizeError(error, null).message;
  }

  function decodeJwtRole(key) {
    var parts;
    var encoded;
    var json;
    if (typeof key !== 'string') {
      return null;
    }

    parts = key.split('.');
    if (parts.length !== 3 || !root.atob) {
      return null;
    }

    try {
      encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (encoded.length % 4) {
        encoded += '=';
      }
      json = JSON.parse(root.atob(encoded));
      return json && typeof json.role === 'string' ? json.role : null;
    } catch (_error) {
      return null;
    }
  }

  function readConfiguration() {
    var raw = root.ANTONY_MEDIA_CONFIG;
    var urlText;
    var key;
    var parsed;
    var jwtRole;

    if (!isPlainObject(raw)) {
      return { valid: false, reason: 'missing_config' };
    }

    urlText = typeof raw.supabaseUrl === 'string' ? raw.supabaseUrl.trim() : '';
    key = typeof raw.supabaseAnonKey === 'string' ? raw.supabaseAnonKey.trim() : '';

    if (!urlText || !key) {
      return { valid: false, reason: 'missing_values' };
    }

    try {
      parsed = new root.URL(urlText);
    } catch (_error) {
      return { valid: false, reason: 'invalid_url' };
    }

    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
      return { valid: false, reason: 'invalid_url' };
    }

    if (/^sb_secret_/i.test(key)) {
      return { valid: false, reason: 'private_key_rejected' };
    }

    jwtRole = decodeJwtRole(key);
    if (jwtRole === 'service_role') {
      return { valid: false, reason: 'private_key_rejected' };
    }

    return {
      valid: true,
      url: parsed.toString().replace(/\/$/, ''),
      key: key,
      reason: null
    };
  }

  var configuration = readConfiguration();
  var client = null;
  var initializationReason = configuration.reason;

  if (configuration.valid) {
    if (!root.supabase || typeof root.supabase.createClient !== 'function') {
      initializationReason = 'supabase_umd_missing';
    } else {
      try {
        client = root.supabase.createClient(configuration.url, configuration.key, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: AUTH_STORAGE_KEY
          }
        });
      } catch (_error) {
        client = null;
        initializationReason = 'client_initialization_failed';
      }
    }
  }

  function requireClient() {
    var message;
    if (client) {
      return client;
    }

    message = initializationReason === 'supabase_umd_missing'
      ? 'No se pudo cargar el servicio de datos del CRM.'
      : 'El CRM no tiene una configuración válida de Supabase.';

    throw makeAdapterError(message, 'CONFIGURATION_ERROR', 0, 'configuration', {
      retryable: initializationReason === 'supabase_umd_missing'
    });
  }

  async function executeRequest(request, operation, requireData) {
    var response;
    try {
      response = await request;
    } catch (error) {
      throw normalizeError(error, operation);
    }

    if (!response || typeof response !== 'object') {
      throw makeAdapterError(
        'El servidor devolvió una respuesta no válida.',
        'INVALID_RESPONSE',
        502,
        'server',
        { operation: operation, retryable: true }
      );
    }

    if (response.error) {
      throw normalizeError(response.error, operation);
    }

    if (requireData && (response.data === null || response.data === undefined || (Array.isArray(response.data) && !response.data.length))) {
      throw makeAdapterError(
        'El servidor no confirmó la operación con datos.',
        'EMPTY_RESPONSE',
        502,
        'server',
        { operation: operation, retryable: false }
      );
    }

    return response.data;
  }

  function requireRecord(record, label) {
    if (!isPlainObject(record)) {
      throw validationError(label + ' debe ser un objeto válido.', 'payload');
    }
    return record;
  }

  function requireId(id) {
    if (typeof id === 'string') {
      id = id.trim();
      if (id) {
        return id;
      }
    } else if (typeof id === 'number' && isFinite(id)) {
      return id;
    }

    throw validationError('Debes indicar un identificador válido.', 'id');
  }

  function requireArray(value, field) {
    if (!Array.isArray(value)) {
      throw validationError('El campo ' + field + ' debe ser una lista.', field);
    }
    return value;
  }

  function rowValue(row, candidates) {
    var index;
    var value;
    for (index = 0; index < candidates.length; index += 1) {
      value = row && row[candidates[index]];
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }
    return null;
  }

  function comparePrimitive(left, right) {
    if (left === right) {
      return 0;
    }
    if (left === null || left === undefined || left === '') {
      return 1;
    }
    if (right === null || right === undefined || right === '') {
      return -1;
    }
    if (typeof left === 'number' && typeof right === 'number') {
      return left - right;
    }
    return String(left).localeCompare(String(right), 'es', {
      numeric: true,
      sensitivity: 'base'
    });
  }

  function orderedRows(rows, candidates, ascending) {
    return rows.slice().sort(function (left, right) {
      var result = comparePrimitive(rowValue(left, candidates), rowValue(right, candidates));
      return ascending ? result : -result;
    });
  }

  async function fetchTable(table, ascending, limit, operation, orderColumn) {
    var db = requireClient();
    var query;
    var data;

    try {
      query = db
        .from(table)
        .select('*')
        .order(orderColumn || 'created_at', { ascending: ascending, nullsFirst: false });
      if (limit) {
        query = query.limit(limit);
      }
    } catch (error) {
      throw normalizeError(error, operation);
    }

    data = await executeRequest(query, operation, false);
    if (!Array.isArray(data)) {
      throw makeAdapterError(
        'El servidor devolvió una colección no válida.',
        'INVALID_RESPONSE',
        502,
        'server',
        { operation: operation, retryable: true }
      );
    }
    return mapFromDatabase(data);
  }

  async function getSession() {
    var db = requireClient();
    var response;
    try {
      response = await db.auth.getSession();
    } catch (error) {
      throw normalizeError(error, 'getSession');
    }
    if (response && response.error) {
      throw normalizeError(response.error, 'getSession');
    }
    return response && response.data ? response.data.session || null : null;
  }

  async function getCurrentUser() {
    var db = requireClient();
    var response;
    try {
      response = await db.auth.getUser();
    } catch (error) {
      throw normalizeError(error, 'getCurrentUser');
    }
    if (response && response.error) {
      throw normalizeError(response.error, 'getCurrentUser');
    }
    return response && response.data ? response.data.user || null : null;
  }

  async function signIn(email, password) {
    var db = requireClient();
    var response;
    var normalizedEmail = typeof email === 'string' ? email.trim() : '';

    if (!normalizedEmail || normalizedEmail.indexOf('@') <= 0) {
      throw validationError('Escribe un correo electrónico válido.', 'email');
    }
    if (typeof password !== 'string' || !password) {
      throw validationError('Escribe tu contraseña.', 'password');
    }

    try {
      response = await db.auth.signInWithPassword({
        email: normalizedEmail,
        password: password
      });
    } catch (error) {
      throw normalizeError(error, 'signIn');
    }
    if (response && response.error) {
      throw normalizeError(response.error, 'signIn');
    }
    if (!response || !response.data || !response.data.session || !response.data.user) {
      throw makeAdapterError(
        'El servidor no confirmó el inicio de sesión.',
        'EMPTY_RESPONSE',
        502,
        'server',
        { operation: 'signIn', retryable: false }
      );
    }
    return response.data;
  }

  async function requestPasswordReset(email, redirectTo) {
    var db = requireClient();
    var response;
    var normalizedEmail = typeof email === 'string' ? email.trim() : '';
    var normalizedRedirect = typeof redirectTo === 'string' ? redirectTo.trim() : '';
    var parsedRedirect;

    if (!normalizedEmail || normalizedEmail.indexOf('@') <= 0) {
      throw validationError('Escribe un correo electrónico válido.', 'email');
    }

    try {
      parsedRedirect = new root.URL(normalizedRedirect);
    } catch (_error) {
      throw validationError('La URL de recuperación no es válida.', 'redirectTo');
    }

    if (parsedRedirect.protocol !== 'https:' || parsedRedirect.username || parsedRedirect.password) {
      throw validationError('La recuperación requiere una URL HTTPS válida.', 'redirectTo');
    }

    try {
      response = await db.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: parsedRedirect.href
      });
    } catch (error) {
      throw normalizeError(error, 'requestPasswordReset');
    }
    if (response && response.error) {
      throw normalizeError(response.error, 'requestPasswordReset');
    }
    return true;
  }

  async function updatePassword(password) {
    var db = requireClient();
    var response;

    if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
      throw validationError(
        'La contraseña debe tener entre 12 y 128 caracteres.',
        'password'
      );
    }

    try {
      response = await db.auth.updateUser({ password: password });
    } catch (error) {
      throw normalizeError(error, 'updatePassword');
    }
    if (response && response.error) {
      throw normalizeError(response.error, 'updatePassword');
    }
    if (!response || !response.data || !response.data.user) {
      throw makeAdapterError(
        'El servidor no confirmó la actualización de la contraseña.',
        'EMPTY_RESPONSE',
        502,
        'server',
        { operation: 'updatePassword', retryable: false }
      );
    }
    return response.data.user;
  }

  async function signOut() {
    var db = requireClient();
    var response;
    try {
      response = await db.auth.signOut();
    } catch (error) {
      throw normalizeError(error, 'signOut');
    }
    if (response && response.error) {
      throw normalizeError(response.error, 'signOut');
    }
    return true;
  }

  function onAuthStateChange(callback) {
    var db = requireClient();
    if (typeof callback !== 'function') {
      throw validationError('Debes indicar una función para observar la sesión.', 'callback');
    }
    return db.auth.onAuthStateChange(callback);
  }

  async function loadWorkspace() {
    var results = await Promise.all([
      fetchTable('crm_clients', false, null, 'loadClients'),
      fetchTable('crm_sales', false, null, 'loadSales'),
      fetchTable('crm_commission_installments', true, null, 'loadInstallments'),
      fetchTable('crm_payments', false, null, 'loadPayments'),
      fetchTable('crm_audit_log', false, MAX_AUDIT_ROWS, 'loadAuditLog', 'changed_at')
    ]);
    var clients = orderedRows(results[0], ['name', 'fullName', 'companyName', 'createdAt'], true);
    var sales = orderedRows(
      results[1].map(normalizeSaleRecord),
      ['saleDate', 'soldAt', 'createdAt'],
      false
    );
    var installments = orderedRows(results[2], ['dueDate', 'installmentNumber', 'createdAt'], true);
    var payments = orderedRows(results[3], ['paymentDate', 'paidAt', 'createdAt'], false);
    var auditLog = orderedRows(results[4], ['changedAt'], false).slice(0, MAX_AUDIT_ROWS);

    deepFreeze(auditLog);
    return {
      clients: clients,
      sales: sales,
      installments: installments,
      payments: payments,
      auditLog: auditLog
    };
  }

  async function saveRow(table, record, operation, label) {
    var db = requireClient();
    var payload = mapToDatabase(requireRecord(record, label));
    var query;
    var data;

    if (!Object.keys(payload).length) {
      throw validationError(label + ' no contiene datos para guardar.', 'payload');
    }

    try {
      query = db
        .from(table)
        .upsert(payload, { onConflict: 'owner_id,id' })
        .select('*')
        .single();
    } catch (error) {
      throw normalizeError(error, operation);
    }

    data = await executeRequest(query, operation, true);
    return mapFromDatabase(data);
  }

  function saveClient(record) {
    var source = requireRecord(record, 'El cliente');
    var client = {};

    // An allowlist also prevents __proto__/constructor assignment while keeping
    // ownership and timestamps entirely server-controlled.
    [
      'id', 'name', 'phone', 'email', 'source', 'stage', 'desiredZone', 'propertyStage',
      'budget', 'budgetCurrency', 'capturedAt', 'notes'
    ].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        client[key] = source[key];
      }
    });

    // Empty text fields use NULL so PostgreSQL constraints can distinguish
    // "not provided" from an actual text value. Phone and email are rejected
    // by the database when absent, even if a caller bypasses the form.
    ['phone', 'email', 'source', 'desiredZone', 'notes'].forEach(function (key) {
      if (typeof client[key] === 'string' && !client[key].trim()) {
        client[key] = null;
      }
    });

    return saveRow('crm_clients', client, 'saveClient', 'El cliente');
  }

  async function deleteRow(table, id, operation) {
    var db = requireClient();
    var safeId = requireId(id);
    var query;
    var data;

    try {
      query = db
        .from(table)
        .delete()
        .eq('id', safeId)
        .select('*')
        .single();
    } catch (error) {
      throw normalizeError(error, operation);
    }

    data = await executeRequest(query, operation, true);
    return mapFromDatabase(data);
  }

  function deleteClient(id) {
    return deleteRow('crm_clients', id, 'deleteClient');
  }

  async function saveSale(sale, installments) {
    var db = requireClient();
    var payload = {
      p_sale: mapSaleToDatabase(requireRecord(sale, 'La venta')),
      p_installments: mapToDatabase(requireArray(installments, 'installments'))
    };
    var request;
    var data;

    try {
      // Supabase serializes these plain objects/arrays as JSON/JSONB RPC arguments.
      request = db.rpc('crm_save_sale', payload);
    } catch (error) {
      throw normalizeError(error, 'saveSale');
    }

    data = mapFromDatabase(await executeRequest(request, 'saveSale', true));
    if (data && data.sale) {
      data.sale = normalizeSaleRecord(data.sale);
    }
    return data;
  }

  function deleteSale(id) {
    return deleteRow('crm_sales', id, 'deleteSale');
  }

  async function savePayment(payment) {
    var db = requireClient();
    var request;
    var data;

    try {
      request = db.rpc('crm_record_payment', {
        p_payment: mapToDatabase(requireRecord(payment, 'El cobro'))
      });
    } catch (error) {
      throw normalizeError(error, 'savePayment');
    }

    data = await executeRequest(request, 'savePayment', true);
    return mapFromDatabase(data);
  }

  async function voidPayment(id, reason) {
    var db = requireClient();
    var safeId = requireId(id);
    var safeReason = typeof reason === 'string' ? reason.trim() : '';
    var request;
    var data;

    if (!safeReason) {
      throw validationError('Debes indicar el motivo de la anulación.', 'reason');
    }
    if (safeReason.length > 1000) {
      throw validationError('El motivo de la anulación es demasiado largo.', 'reason');
    }

    try {
      request = db.rpc('crm_void_payment', {
        p_payment_id: safeId,
        p_reason: safeReason
      });
    } catch (error) {
      throw normalizeError(error, 'voidPayment');
    }

    data = await executeRequest(request, 'voidPayment', true);
    return mapFromDatabase(data);
  }

  async function importWorkspace(state) {
    var db = requireClient();
    var source = requireRecord(state, 'El espacio de trabajo');
    var importableState = {
      clients: requireArray(source.clients, 'clients'),
      sales: requireArray(source.sales, 'sales'),
      installments: requireArray(source.installments, 'installments'),
      payments: requireArray(source.payments, 'payments')
    };
    var request;
    var data;

    // auditLog is deliberately excluded: only database-side code may append audit events.
    // The database column is named status; the UI uses saleStatus to avoid confusing
    // an operation's lifecycle with a payment's accounting status.
    importableState.sales = importableState.sales.map(mapSaleToDatabase);
    try {
      request = db.rpc('crm_import_workspace', {
        p_state: {
          clients: mapToDatabase(importableState.clients),
          sales: importableState.sales,
          installments: mapToDatabase(importableState.installments),
          payments: mapToDatabase(importableState.payments)
        }
      });
    } catch (error) {
      throw normalizeError(error, 'importWorkspace');
    }

    data = await executeRequest(request, 'importWorkspace', true);
    return mapFromDatabase(data);
  }

  var api = {
    configured: !!client,
    client: client,
    getSession: getSession,
    getCurrentUser: getCurrentUser,
    signIn: signIn,
    requestPasswordReset: requestPasswordReset,
    updatePassword: updatePassword,
    signOut: signOut,
    onAuthStateChange: onAuthStateChange,
    loadWorkspace: loadWorkspace,
    saveClient: saveClient,
    deleteClient: deleteClient,
    saveSale: saveSale,
    deleteSale: deleteSale,
    savePayment: savePayment,
    voidPayment: voidPayment,
    importWorkspace: importWorkspace,
    humanizeError: humanizeError
  };

  root.AntonyCrmBackend = Object.freeze(api);
}(window));
