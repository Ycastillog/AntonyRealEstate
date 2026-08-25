"use strict";

const LOCAL_META_KEY = "antony-evidence-items";
const LOCAL_PROPERTY_KEY = "antony-property-items";
const DB_NAME = "antony-media-store";
const DB_STORE = "files";
const IMAGE_MAX_BYTES = 12 * 1024 * 1024;
const VIDEO_MAX_BYTES = 150 * 1024 * 1024;
const MAX_PROPERTY_IMAGES = 20;
const MAX_ITEMS = 500;

const IMAGE_TYPES = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif"
});
const VIDEO_TYPES = Object.freeze({
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov"
});
const EVIDENCE_CATEGORIES = new Set(["Entrega", "Cierre", "Feria", "Recorrido", "Testimonio", "Cliente", "Llaves", "Firma"]);
const PROPERTY_TYPES = new Set(["apartamento", "proyecto", "villa", "penthouse", "inversion"]);
const PROPERTY_CATEGORIES = new Set(["santo-domingo", "turisticas"]);
const PROPERTY_STATUSES = new Set(["disponible", "reservada", "vendida"]);
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const BUCKET_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;
const UUID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const PATH_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;
const RECORD_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;

class PublicError extends Error {
  constructor(message) {
    super(message);
    this.name = "PublicError";
  }
}

function cleanText(value, max = 3000) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
}

function cleanLine(value, max = 200) {
  return cleanText(value, max).replace(/\s+/g, " ");
}

function isLoopback(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

const DEMO_ALLOWED = isLoopback(window.location.hostname);
const DEMO_REQUESTED = DEMO_ALLOWED && new URLSearchParams(window.location.search).get("demo") === "1";
const rawConfig = window.ANTONY_MEDIA_CONFIG && typeof window.ANTONY_MEDIA_CONFIG === "object"
  ? window.ANTONY_MEDIA_CONFIG
  : {};

function normalizedBackendUrl(value) {
  try {
    const url = new URL(cleanLine(value, 2048));
    if (url.username || url.password) return "";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname))) return "";
    return url.origin;
  } catch {
    return "";
  }
}

function normalizedPublishableKey(value) {
  const key = cleanLine(value, 4096);
  return /^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key) ? key : "";
}

function normalizedIdentifier(value, fallback = "") {
  const result = cleanLine(value || fallback, 63);
  return IDENTIFIER_RE.test(result) ? result : "";
}

const SUPABASE_URL = normalizedBackendUrl(rawConfig.supabaseUrl);
const SUPABASE_KEY = normalizedPublishableKey(rawConfig.supabasePublishableKey || rawConfig.supabaseAnonKey);
const EVIDENCE_TABLE = normalizedIdentifier(rawConfig.supabaseTable);
const PROPERTY_TABLE = normalizedIdentifier(rawConfig.supabasePropertiesTable, "property_items");
const STORAGE_BUCKET = (() => {
  const bucket = cleanLine(rawConfig.supabaseStorageBucket, 63);
  return BUCKET_RE.test(bucket) ? bucket : "";
})();
const AUTH_CONFIG_READY = Boolean(
  SUPABASE_URL && SUPABASE_KEY && window.supabase && typeof window.supabase.createClient === "function"
);
const DATA_CONFIG_READY = Boolean(AUTH_CONFIG_READY && EVIDENCE_TABLE && PROPERTY_TABLE && STORAGE_BUCKET);

function required(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const loginPanel = required("#loginPanel");
const adminWorkspace = required("#adminWorkspace");
const loginForm = required("#loginForm");
const loginStatus = required("#loginStatus");
const evidenceForm = required("#evidenceForm");
const propertyForm = required("#propertyForm");
const evidenceGrid = required("#adminEvidenceGrid");
const propertyGrid = required("#adminPropertyGrid");
const emptyState = required("#adminEmptyState");
const propertyEmptyState = required("#adminPropertyEmptyState");
const storageMode = required("#storageMode");
const logoutButton = required("#logoutButton");
const refreshButton = required("#refreshEvidence");
const refreshPropertiesButton = required("#refreshProperties");
const toggleEvidenceForm = required("#toggleEvidenceForm");
const togglePropertyForm = required("#togglePropertyForm");
const publishedCount = required("#publishedCount");
const videoCount = required("#videoCount");
const photoCount = required("#photoCount");
const testimonialCount = required("#testimonialCount");
const propertyCount = required("#propertyCount");
const toast = required("#adminToast");

let supabaseClient = null;
let authSubscription = null;
let currentSession = null;
let currentUser = null;
let authEpoch = 0;
let sessionValidationToken = "";
let sessionValidationPromise = null;
let dataMode = "blocked";
let evidenceItemsById = new Map();
let propertyItemsById = new Map();
const evidenceObjectUrls = new Set();
const propertyObjectUrls = new Set();

function showToast(message) {
  toast.textContent = cleanLine(message, 240) || "Ocurrió un error.";
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function publicMessage(error, fallback) {
  return error instanceof PublicError ? error.message : fallback;
}

function reportPortalDiagnostic(scope, error, reason = "unknown") {
  const payload = {
    scope,
    reason: cleanLine(reason, 80) || "unknown",
    name: cleanLine(error?.name || "Error", 80),
    code: cleanLine(error?.code || "PORTAL_ERROR", 80),
    status: Number(error?.status) || 0
  };
  console.error(`Antony portal authentication failure ${JSON.stringify(payload)}`);
}

function renderIcons() {
  try {
    if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons();
  } catch {
    // Decorative icons must never affect authentication or data access.
  }
}

function appendIcon(parent, name) {
  const icon = document.createElement("i");
  icon.setAttribute("data-lucide", name);
  parent.append(icon);
}

function setLoginEnabled(enabled) {
  for (const control of loginForm.elements) control.disabled = !enabled;
}

function setLoginButtonText(text) {
  const label = loginForm.querySelector("button[type='submit'] span");
  if (label) label.textContent = text;
}

function resetToggleLabels() {
  const evidenceLabel = toggleEvidenceForm.querySelector("span");
  const propertyLabel = togglePropertyForm.querySelector("span");
  if (evidenceLabel) evidenceLabel.textContent = "Nueva evidencia";
  if (propertyLabel) propertyLabel.textContent = "Nueva propiedad";
}

function revokeObjectUrls(urls) {
  for (const url of urls) URL.revokeObjectURL(url);
  urls.clear();
}

function clearContent() {
  revokeObjectUrls(evidenceObjectUrls);
  revokeObjectUrls(propertyObjectUrls);
  evidenceItemsById = new Map();
  propertyItemsById = new Map();
  evidenceGrid.replaceChildren();
  propertyGrid.replaceChildren();
  for (const counter of [publishedCount, videoCount, photoCount, testimonialCount, propertyCount]) counter.textContent = "0";
  emptyState.hidden = false;
  propertyEmptyState.hidden = false;
  evidenceForm.hidden = true;
  propertyForm.hidden = true;
  evidenceForm.reset();
  propertyForm.reset();
  resetToggleLabels();
}

function sessionLooksValid(session) {
  const expiresAt = Number(session && session.expires_at);
  return Boolean(
    session
    && typeof session.access_token === "string"
    && session.access_token
    && session.user
    && UUID_RE.test(String(session.user.id || ""))
    && Number.isFinite(expiresAt)
    && expiresAt * 1000 > Date.now() + 1000
  );
}

function isPortalAdmin(user) {
  return Boolean(
    user
    && user.app_metadata
    && cleanLine(user.app_metadata.role, 40).toLowerCase() === "admin"
  );
}

function hasValidSession() {
  return Boolean(
    currentUser
    && isPortalAdmin(currentUser)
    && sessionLooksValid(currentSession)
    && String(currentSession.user.id) === String(currentUser.id)
  );
}

function showSignedOut(message = "Usa una cuenta autorizada de Supabase para continuar.") {
  dataMode = "blocked";
  adminWorkspace.hidden = true;
  loginPanel.hidden = false;
  logoutButton.hidden = true;
  setLoginEnabled(AUTH_CONFIG_READY && (DATA_CONFIG_READY || DEMO_ALLOWED));
  setLoginButtonText("Entrar");
  loginStatus.textContent = message;
  storageMode.textContent = AUTH_CONFIG_READY
    ? "Panel bloqueado hasta validar la sesión."
    : "Panel bloqueado: falta la configuración segura de Supabase.";
  clearContent();
  renderIcons();
}

function showAuthPending(message) {
  dataMode = "blocked";
  adminWorkspace.hidden = true;
  loginPanel.hidden = false;
  logoutButton.hidden = true;
  setLoginEnabled(false);
  setLoginButtonText("Validando...");
  loginStatus.textContent = message;
  storageMode.textContent = "Validando sesión y permisos...";
  clearContent();
  renderIcons();
}

function blockAuthenticatedPanel(message) {
  dataMode = "blocked";
  adminWorkspace.hidden = true;
  loginPanel.hidden = false;
  logoutButton.hidden = false;
  setLoginEnabled(AUTH_CONFIG_READY);
  setLoginButtonText("Volver a intentar");
  loginStatus.textContent = message;
  storageMode.textContent = "Panel bloqueado: backend no disponible o sin permisos.";
  clearContent();
  renderIcons();
}

function clearSession(message) {
  authEpoch += 1;
  currentSession = null;
  currentUser = null;
  showSignedOut(message);
}

function discardInvalidSession(message) {
  clearSession(message);
  if (supabaseClient) setTimeout(() => void supabaseClient.auth.signOut({ scope: "local" }).catch(() => {}), 0);
}

function expireSession() {
  discardInvalidSession("La sesión venció. Inicia sesión nuevamente.");
}

function showWorkspace() {
  if (!hasValidSession()) {
    clearSession("La sesión no es válida. Inicia sesión nuevamente.");
    return;
  }
  loginPanel.hidden = true;
  adminWorkspace.hidden = false;
  logoutButton.hidden = false;
  setLoginEnabled(true);
  setLoginButtonText("Entrar");
  storageMode.textContent = dataMode === "demo"
    ? "MODO DEMO — datos locales de este navegador; no es producción."
    : "Supabase autenticado — contenido permanente activo.";
  renderIcons();
}

function userId() {
  const id = cleanLine(currentUser && currentUser.id, 64).toLowerCase();
  if (!UUID_RE.test(id)) throw new PublicError("La sesión no contiene un usuario válido.");
  return id;
}

function createUuid() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  if (!window.crypto || typeof window.crypto.getRandomValues !== "function") {
    throw new PublicError("Este navegador no ofrece identificadores seguros.");
  }
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function plainSlug(value) {
  return cleanLine(value || "opcion", 160)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "opcion";
}

function statusLabel(status) {
  return { disponible: "Disponible", reservada: "Reservada", vendida: "Vendida" }[status] || "Disponible";
}

function safeBoolean(value) {
  return value === true || value === 1 || value === "true";
}

function safeNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function safeDate(value) {
  const date = cleanLine(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : "";
}

function safeMediaUrl(value) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  const maxDataLength = Math.ceil(IMAGE_MAX_BYTES * 4 / 3) + 128;
  if (!raw || raw.length > maxDataLength) return "";
  if (raw.startsWith("blob:")) {
    return evidenceObjectUrls.has(raw) || propertyObjectUrls.has(raw) ? raw : "";
  }
  if (dataMode === "demo" && /^data:image\/(?:jpeg|png|webp|avif|gif);base64,/i.test(raw)) return raw;
  if (raw.length > 4096 || /[\u0000-\u001f\u007f]/.test(raw)) return "";
  try {
    const url = new URL(raw);
    if (url.username || url.password) return "";
    if (url.protocol === "https:") return url.href;
    return url.protocol === "http:" && isLoopback(url.hostname) ? url.href : "";
  } catch {
    return "";
  }
}

function ownedStoragePath(value) {
  if (!currentUser || typeof value !== "string") return "";
  const path = value.trim().replace(/^\/+/, "");
  if (!path || path.length > 1024 || path.includes("\\")) return "";
  const parts = path.split("/");
  if (parts.length < 3 || parts[0].toLowerCase() !== userId()) return "";
  return parts.every((part) => part && part !== "." && part !== ".." && PATH_SEGMENT_RE.test(part)) ? parts.join("/") : "";
}

function ownedLocalKey(value) {
  if (!currentUser || typeof value !== "string") return "";
  const key = value.trim();
  if (!key.startsWith(`demo/${userId()}/`) || key.length > 1024 || key.includes("\\")) return "";
  return key.split("/").every((part) => part && part !== "." && part !== ".." && PATH_SEGMENT_RE.test(part)) ? key : "";
}

function storagePathFromUrl(value) {
  const mediaUrl = safeMediaUrl(value);
  if (!mediaUrl || !SUPABASE_URL || !STORAGE_BUCKET) return "";
  try {
    const url = new URL(mediaUrl);
    if (url.origin !== new URL(SUPABASE_URL).origin) return "";
    const marker = `/storage/v1/object/public/${encodeURIComponent(STORAGE_BUCKET)}/`;
    if (!url.pathname.startsWith(marker)) return "";
    const parts = url.pathname.slice(marker.length).split("/").map((part) => decodeURIComponent(part));
    if (parts.some((part) => part.includes("/") || part.includes("\\"))) return "";
    return ownedStoragePath(parts.join("/"));
  } catch {
    return "";
  }
}

function normalizeEvidence(item) {
  if (!item || typeof item !== "object") return null;
  const id = cleanLine(item.id, 128);
  if (!RECORD_ID_RE.test(id)) return null;
  return {
    id,
    title: cleanLine(item.title, 160),
    category: cleanLine(item.category, 60) || "Evidencia",
    city: cleanLine(item.city, 120),
    eventDate: safeDate(item.eventDate || item.event_date),
    description: cleanText(item.description, 3000),
    mediaType: (item.mediaType || item.media_type) === "video" ? "video" : "image",
    mediaUrl: safeMediaUrl(item.mediaUrl || item.media_url),
    posterUrl: safeMediaUrl(item.posterUrl || item.poster_url),
    storagePath: ownedStoragePath(item.storagePath || item.storage_path || ""),
    localKey: ownedLocalKey(item.localKey || item.local_key || ""),
    isFeatured: safeBoolean(item.isFeatured ?? item.is_featured),
    isPublished: safeBoolean(item.isPublished ?? item.is_published)
  };
}

function normalizeProperty(item) {
  if (!item || typeof item !== "object") return null;
  const id = cleanLine(item.id, 160);
  if (!RECORD_ID_RE.test(id)) return null;
  const rawTags = Array.isArray(item.tags) ? item.tags : String(item.tags || "").split(",");
  const rawUrls = Array.isArray(item.mediaUrls)
    ? item.mediaUrls
    : Array.isArray(item.media_urls) ? item.media_urls : [];
  const rawPaths = Array.isArray(item.storagePaths)
    ? item.storagePaths
    : Array.isArray(item.storage_paths) ? item.storage_paths : [];
  const rawLocalKeys = Array.isArray(item.localKeys)
    ? item.localKeys
    : Array.isArray(item.local_keys) ? item.local_keys : [];
  const urls = Array.from(new Set([
    item.imageUrl || item.image_url || "",
    ...rawUrls
  ].map(safeMediaUrl).filter(Boolean))).slice(0, MAX_PROPERTY_IMAGES);
  const status = PROPERTY_STATUSES.has(item.status) ? item.status : "disponible";
  return {
    id,
    title: cleanLine(item.title, 160),
    subtitle: cleanLine(item.subtitle, 200),
    priceLabel: cleanLine(item.priceLabel || item.price_label, 80) || "Precio a consultar",
    priceUsd: safeNumber(item.priceUsd ?? item.price_usd, 0, 1_000_000_000),
    type: PROPERTY_TYPES.has(item.type) ? item.type : "apartamento",
    category: PROPERTY_CATEGORIES.has(item.category) ? item.category : "santo-domingo",
    city: plainSlug(item.city || item.cityLabel || item.city_label),
    cityLabel: cleanLine(item.cityLabel || item.city_label, 100),
    zone: plainSlug(item.zone || item.zoneLabel || item.zone_label),
    zoneLabel: cleanLine(item.zoneLabel || item.zone_label, 100),
    beds: safeNumber(item.beds, 0, 100),
    meters: safeNumber(item.meters, 0, 10_000_000),
    status,
    statusLabel: cleanLine(item.statusLabel || item.status_label, 40) || statusLabel(status),
    notes: cleanText(item.notes, 3000),
    tags: rawTags.map((tag) => cleanLine(tag, 40)).filter(Boolean).slice(0, 12),
    imageUrl: urls[0] || "",
    mediaUrls: urls,
    storagePaths: Array.from(new Set(rawPaths.map(ownedStoragePath).filter(Boolean))).slice(0, MAX_PROPERTY_IMAGES),
    localKeys: Array.from(new Set(rawLocalKeys.map(ownedLocalKey).filter(Boolean))).slice(0, MAX_PROPERTY_IMAGES),
    isFeatured: safeBoolean(item.isFeatured ?? item.is_featured),
    isPublished: safeBoolean(item.isPublished ?? item.is_published)
  };
}

function deduplicate(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function requireDemoStorage() {
  if (!DEMO_ALLOWED || dataMode !== "demo" || !hasValidSession()) {
    throw new PublicError("El almacenamiento local solo está disponible en el modo demo autenticado.");
  }
}

function readLocalArray(key) {
  requireDemoStorage();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ITEMS * 2) : [];
  } catch {
    return [];
  }
}

function writeLocalArray(key, items) {
  requireDemoStorage();
  try {
    window.localStorage.setItem(key, JSON.stringify(items.slice(0, MAX_ITEMS * 2)));
  } catch {
    throw new PublicError("No hay espacio local suficiente para guardar el modo demo.");
  }
}

function openDb() {
  requireDemoStorage();
  if (!window.indexedDB) return Promise.reject(new PublicError("IndexedDB no está disponible en este navegador."));
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new PublicError("No se pudo abrir el almacenamiento local de demo."));
    request.onblocked = () => reject(new PublicError("El almacenamiento local de demo está bloqueado por otra pestaña."));
  });
}

async function putBlob(key, blob) {
  const safeKey = ownedLocalKey(key);
  if (!safeKey) throw new PublicError("La ruta local del archivo no es válida.");
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(blob, safeKey);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(new PublicError("No se pudo guardar el archivo local de demo.")); };
    tx.onabort = tx.onerror;
  });
}

async function getBlob(key) {
  const safeKey = ownedLocalKey(key);
  if (!safeKey) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const request = tx.objectStore(DB_STORE).get(safeKey);
    let result = null;
    request.onsuccess = () => { result = request.result || null; };
    request.onerror = () => reject(new PublicError("No se pudo leer un archivo local de demo."));
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = () => { db.close(); reject(new PublicError("No se pudo leer un archivo local de demo.")); };
  });
}

async function deleteBlob(key) {
  const safeKey = ownedLocalKey(key);
  if (!safeKey) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(safeKey);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(new PublicError("No se pudo eliminar un archivo local de demo.")); };
    tx.onabort = tx.onerror;
  });
}

function safeStoredBlob(blob, kind) {
  if (!(blob instanceof Blob) || blob.size <= 0) return false;
  return kind === "video"
    ? Boolean(VIDEO_TYPES[blob.type] && blob.size <= VIDEO_MAX_BYTES)
    : Boolean(IMAGE_TYPES[blob.type] && blob.size <= IMAGE_MAX_BYTES);
}

async function loadLocalEvidence() {
  requireDemoStorage();
  revokeObjectUrls(evidenceObjectUrls);
  const owner = userId();
  const items = readLocalArray(LOCAL_META_KEY)
    .filter((item) => item && String(item.ownerId || "").toLowerCase() === owner)
    .map(normalizeEvidence)
    .filter(Boolean);
  const previews = await Promise.all(items.map(async (item) => {
    if (item.mediaUrl || !item.localKey) return item;
    const blob = await getBlob(item.localKey);
    if (!safeStoredBlob(blob, item.mediaType)) return item;
    const url = URL.createObjectURL(blob);
    evidenceObjectUrls.add(url);
    return { ...item, mediaUrl: url };
  }));
  return deduplicate(previews).slice(0, MAX_ITEMS);
}

async function loadLocalProperties() {
  requireDemoStorage();
  revokeObjectUrls(propertyObjectUrls);
  const owner = userId();
  const items = readLocalArray(LOCAL_PROPERTY_KEY)
    .filter((item) => item && String(item.ownerId || "").toLowerCase() === owner)
    .map(normalizeProperty)
    .filter(Boolean);
  const previews = await Promise.all(items.map(async (item) => {
    if (item.mediaUrls.length || !item.localKeys.length) return item;
    const urls = [];
    for (const key of item.localKeys) {
      const blob = await getBlob(key);
      if (!safeStoredBlob(blob, "image")) continue;
      const url = URL.createObjectURL(blob);
      propertyObjectUrls.add(url);
      urls.push(url);
    }
    return { ...item, imageUrl: urls[0] || "", mediaUrls: urls };
  }));
  return deduplicate(previews).slice(0, MAX_ITEMS);
}

async function requireFreshSession() {
  if (!supabaseClient || !hasValidSession()) {
    expireSession();
    throw new PublicError("La sesión venció. Inicia sesión nuevamente.");
  }
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    const session = data && data.session;
    if (error || !sessionLooksValid(session) || String(session.user.id) !== String(currentUser.id)) throw new Error("invalid session");
    currentSession = session;
    return session;
  } catch {
    expireSession();
    throw new PublicError("La sesión venció. Inicia sesión nuevamente.");
  }
}

function checkedEndpoint(value) {
  const url = value instanceof URL ? value : new URL(value);
  const validPath = url.pathname.startsWith("/rest/v1/") || url.pathname.startsWith("/storage/v1/");
  if (url.origin !== new URL(SUPABASE_URL).origin || !validPath || url.username || url.password) {
    throw new PublicError("La dirección del backend no es válida.");
  }
  return url;
}

async function authorizedFetch(url, options = {}) {
  const endpoint = checkedEndpoint(url);
  const session = await requireFreshSession();
  const headers = new Headers(options.headers || {});
  headers.set("apikey", SUPABASE_KEY);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  const response = await fetch(endpoint.href, {
    ...options,
    headers,
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer"
  });
  if (response.status === 401) {
    expireSession();
    throw new PublicError("La sesión venció. Inicia sesión nuevamente.");
  }
  return response;
}

function tableUrl(table) {
  if (!IDENTIFIER_RE.test(table)) throw new PublicError("La tabla configurada no es válida.");
  return new URL(`/rest/v1/${table}`, SUPABASE_URL);
}

async function loadRows(table, failureMessage) {
  const url = tableUrl(table);
  url.searchParams.set("select", "*");
  url.searchParams.set("order", "is_featured.desc,created_at.desc");
  url.searchParams.set("limit", String(MAX_ITEMS));
  const response = await authorizedFetch(url, { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new PublicError(failureMessage);
  try {
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("invalid response");
    return rows;
  } catch {
    throw new PublicError(failureMessage);
  }
}

async function loadRemoteEvidence() {
  return deduplicate((await loadRows(EVIDENCE_TABLE, "No se pudieron cargar las evidencias remotas."))
    .map(normalizeEvidence).filter(Boolean));
}

async function loadRemoteProperties() {
  return deduplicate((await loadRows(PROPERTY_TABLE, "No se pudieron cargar las propiedades remotas."))
    .map(normalizeProperty).filter(Boolean));
}

async function insertRow(table, payload, failureMessage) {
  const response = await authorizedFetch(tableUrl(table), {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new PublicError(failureMessage);
}

async function deleteRow(table, id, failureMessage) {
  const safeId = cleanLine(id, 160);
  if (!RECORD_ID_RE.test(safeId)) throw new PublicError("El identificador del registro no es válido.");
  const url = tableUrl(table);
  url.searchParams.set("id", `eq.${safeId}`);
  const response = await authorizedFetch(url, {
    method: "DELETE",
    headers: { Accept: "application/json", Prefer: "return=representation" }
  });
  if (!response.ok) throw new PublicError(failureMessage);
  if (response.status !== 204) {
    try {
      const rows = await response.json();
      if (Array.isArray(rows) && rows.length === 0) throw new PublicError(failureMessage);
    } catch (error) {
      if (error instanceof PublicError) throw error;
    }
  }
}

function validateFile(file, allowVideo) {
  if (!(file instanceof File) || file.size <= 0) throw new PublicError("Selecciona un archivo válido.");
  const mime = cleanLine(file.type, 100).toLowerCase();
  if (IMAGE_TYPES[mime]) {
    if (file.size > IMAGE_MAX_BYTES) throw new PublicError("Cada imagen debe pesar 12 MB o menos.");
    return { mediaType: "image", mime, extension: IMAGE_TYPES[mime] };
  }
  if (allowVideo && VIDEO_TYPES[mime]) {
    if (file.size > VIDEO_MAX_BYTES) throw new PublicError("Cada video debe pesar 150 MB o menos.");
    return { mediaType: "video", mime, extension: VIDEO_TYPES[mime] };
  }
  throw new PublicError(allowVideo
    ? "Formato no permitido. Usa JPEG, PNG, WebP, AVIF, GIF, MP4, WebM o MOV."
    : "Formato no permitido. Usa JPEG, PNG, WebP, AVIF o GIF.");
}

function safePathSegment(value) {
  const part = cleanLine(value, 160);
  if (!part || part === "." || part === ".." || !PATH_SEGMENT_RE.test(part)) {
    throw new PublicError("No se pudo crear una ruta segura para el archivo.");
  }
  return part;
}

function storagePath(namespace, itemId, extension) {
  return [userId(), safePathSegment(namespace), safePathSegment(itemId), `${createUuid()}.${safePathSegment(extension)}`].join("/");
}

function encodedPath(path) {
  const safePath = ownedStoragePath(path);
  if (!safePath) throw new PublicError("La ruta del archivo no es válida.");
  return safePath.split("/").map(encodeURIComponent).join("/");
}

function publicStorageUrl(path) {
  return new URL(`/storage/v1/object/public/${encodeURIComponent(STORAGE_BUCKET)}/${encodedPath(path)}`, SUPABASE_URL).href;
}

async function uploadFile(file, fileInfo, namespace, itemId) {
  const path = storagePath(namespace, itemId, fileInfo.extension);
  const url = new URL(`/storage/v1/object/${encodeURIComponent(STORAGE_BUCKET)}/${encodedPath(path)}`, SUPABASE_URL);
  const response = await authorizedFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": fileInfo.mime,
      "x-upsert": "false",
      "cache-control": "3600"
    },
    body: file
  });
  if (!response.ok) throw new PublicError("Supabase Storage no aceptó el archivo.");
  return { url: publicStorageUrl(path), path };
}

async function removeStorage(paths) {
  const owned = Array.from(new Set(paths.map(ownedStoragePath).filter(Boolean))).slice(0, MAX_PROPERTY_IMAGES + 2);
  if (!owned.length) return;
  const url = new URL(`/storage/v1/object/${encodeURIComponent(STORAGE_BUCKET)}`, SUPABASE_URL);
  const response = await authorizedFetch(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: owned })
  });
  if (!response.ok) throw new PublicError("No se pudieron eliminar todos los archivos del bucket.");
}

async function tryRemoveStorage(paths) {
  try {
    await removeStorage(paths);
    return true;
  } catch {
    return false;
  }
}

function evidencePaths(item) {
  return Array.from(new Set([
    ownedStoragePath(item.storagePath || ""),
    storagePathFromUrl(item.mediaUrl || ""),
    storagePathFromUrl(item.posterUrl || "")
  ].filter(Boolean)));
}

function propertyPaths(item) {
  return Array.from(new Set([
    ...(item.storagePaths || []).map(ownedStoragePath),
    storagePathFromUrl(item.imageUrl || ""),
    ...(item.mediaUrls || []).map(storagePathFromUrl)
  ].filter(Boolean)));
}

function mediaPreview(item) {
  const container = document.createElement("div");
  container.className = "admin-media-preview";
  const url = safeMediaUrl(item.mediaUrl);
  if (!url) {
    const unavailable = document.createElement("span");
    unavailable.textContent = "Archivo no disponible";
    container.append(unavailable);
    return container;
  }
  if (item.mediaType === "video") {
    const video = document.createElement("video");
    video.src = url;
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    container.append(video);
  } else {
    const image = document.createElement("img");
    image.src = url;
    image.alt = item.title || "Evidencia";
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    container.append(image);
  }
  return container;
}

function deleteButton(datasetName, id, label) {
  const button = document.createElement("button");
  button.className = "ghost-button";
  button.type = "button";
  button.dataset[datasetName] = id;
  button.setAttribute("aria-label", label);
  appendIcon(button, "trash-2");
  const text = document.createElement("span");
  text.textContent = "Eliminar";
  button.append(text);
  return button;
}

function renderEvidence(items) {
  evidenceItemsById = new Map();
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    evidenceItemsById.set(item.id, item);
    const card = document.createElement("article");
    card.className = "admin-evidence-card";
    const details = document.createElement("div");
    const category = document.createElement("span");
    category.textContent = item.category || "Evidencia";
    const title = document.createElement("strong");
    title.textContent = item.title || "Sin título";
    const metadata = document.createElement("p");
    metadata.textContent = [item.city, item.eventDate].filter(Boolean).join(" - ");
    const description = document.createElement("p");
    description.textContent = item.description || "";
    details.append(category, title, metadata, description);
    card.append(mediaPreview(item), details, deleteButton("delete", item.id, `Eliminar ${item.title || "evidencia"}`));
    fragment.append(card);
  }
  evidenceGrid.replaceChildren(fragment);
  const published = items.filter((item) => item.isPublished);
  publishedCount.textContent = String(published.length);
  videoCount.textContent = String(published.filter((item) => item.mediaType === "video").length);
  photoCount.textContent = String(published.filter((item) => item.mediaType === "image").length);
  testimonialCount.textContent = String(published.filter((item) => item.category === "Testimonio").length);
  emptyState.hidden = items.length !== 0;
  emptyState.textContent = "Todavía no hay evidencias cargadas.";
  renderIcons();
}

function renderProperties(items) {
  propertyItemsById = new Map();
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    propertyItemsById.set(item.id, item);
    const card = document.createElement("article");
    card.className = "admin-evidence-card";
    const preview = document.createElement("div");
    preview.className = "admin-media-preview";
    const imageUrl = safeMediaUrl(item.imageUrl);
    if (imageUrl) {
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = item.title || "Propiedad";
      image.loading = "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      preview.append(image);
    } else {
      const unavailable = document.createElement("span");
      unavailable.textContent = "Imagen no disponible";
      preview.append(unavailable);
    }
    const details = document.createElement("div");
    const status = document.createElement("span");
    status.textContent = [item.statusLabel, item.zoneLabel].filter(Boolean).join(" · ");
    const title = document.createElement("strong");
    title.textContent = item.title || "Sin título";
    const metadata = document.createElement("p");
    metadata.textContent = [
      item.priceLabel,
      item.cityLabel,
      item.beds !== null ? `${item.beds} hab.` : ""
    ].filter(Boolean).join(" · ");
    const notes = document.createElement("p");
    notes.textContent = item.notes || "";
    details.append(status, title, metadata, notes);
    card.append(preview, details, deleteButton("deleteProperty", item.id, `Eliminar ${item.title || "propiedad"}`));
    fragment.append(card);
  }
  propertyGrid.replaceChildren(fragment);
  propertyCount.textContent = String(items.filter((item) => item.isPublished).length);
  propertyEmptyState.hidden = items.length !== 0;
  propertyEmptyState.textContent = "Todavía no hay propiedades cargadas.";
  renderIcons();
}

async function activateDemo(epoch, reason = "") {
  if (!DEMO_ALLOWED || epoch !== authEpoch || !hasValidSession()) return;
  dataMode = "demo";
  try {
    const [items, properties] = await Promise.all([loadLocalEvidence(), loadLocalProperties()]);
    if (epoch !== authEpoch || !hasValidSession()) return;
    renderEvidence(items);
    renderProperties(properties);
    showWorkspace();
    if (reason) showToast(reason);
  } catch {
    blockAuthenticatedPanel("El modo demo está permitido, pero el almacenamiento local no está disponible.");
  }
}

async function prepareWorkspace(epoch) {
  if (epoch !== authEpoch || !hasValidSession()) return;
  if (DEMO_REQUESTED) {
    await activateDemo(epoch, "MODO DEMO activo: los cambios no se publican.");
    return;
  }
  if (!DATA_CONFIG_READY) {
    if (DEMO_ALLOWED) await activateDemo(epoch, "Configuración incompleta; MODO DEMO activo.");
    else blockAuthenticatedPanel("Panel bloqueado: falta la configuración de tablas o bucket de Supabase.");
    return;
  }
  try {
    const [items, properties] = await Promise.all([loadRemoteEvidence(), loadRemoteProperties()]);
    if (epoch !== authEpoch || !hasValidSession()) return;
    dataMode = "remote";
    renderEvidence(items);
    renderProperties(properties);
    showWorkspace();
  } catch (error) {
    reportPortalDiagnostic("prepareWorkspace", error, "content_load_failed");
    if (epoch !== authEpoch || !hasValidSession()) return;
    if (DEMO_ALLOWED) await activateDemo(epoch, "Backend no disponible; MODO DEMO local activo.");
    else blockAuthenticatedPanel("Panel bloqueado: Supabase no está disponible o la cuenta no tiene permisos sobre tablas y storage.");
  }
}

async function validateSessionAndPrepare(session) {
  const epoch = ++authEpoch;
  showAuthPending("Validando la sesión con Supabase...");
  let verifiedUser = null;
  let verificationError = null;
  for (let attempt = 0; attempt < 2 && !verifiedUser; attempt += 1) {
    try {
      const { data, error } = await supabaseClient.auth.getUser(session.access_token);
      verificationError = error || null;
      if (!error && data && data.user && String(data.user.id) === String(session.user.id)) {
        verifiedUser = data.user;
      }
    } catch (error) {
      verificationError = error;
    }
    if (!verifiedUser && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
  }
  if (epoch !== authEpoch) return;
  if (!verifiedUser || !UUID_RE.test(String(verifiedUser.id || ""))) {
    reportPortalDiagnostic(
      "acceptSession",
      verificationError,
      verificationError ? "get_user_failed" : "verified_user_invalid"
    );
    discardInvalidSession("No se pudo validar la sesión. Inicia sesión nuevamente.");
    return;
  }
  if (!isPortalAdmin(verifiedUser)) {
    reportPortalDiagnostic("acceptSession", null, "admin_role_missing");
    discardInvalidSession("Esta cuenta no tiene autorización para administrar contenido.");
    return;
  }
  currentSession = { ...session, user: verifiedUser };
  currentUser = verifiedUser;
  await prepareWorkspace(epoch);
}

async function acceptSession(session, force = false) {
  if (!sessionLooksValid(session)) {
    reportPortalDiagnostic("acceptSession", null, "invalid_session_shape");
    discardInvalidSession("No hay una sesión válida. Inicia sesión para continuar.");
    return;
  }
  if (!force && currentSession && currentUser && currentSession.access_token === session.access_token) return;

  const token = session.access_token;
  if (sessionValidationPromise && sessionValidationToken === token) {
    await sessionValidationPromise;
    return;
  }

  sessionValidationToken = token;
  sessionValidationPromise = validateSessionAndPrepare(session);
  try {
    await sessionValidationPromise;
  } finally {
    if (sessionValidationToken === token) {
      sessionValidationToken = "";
      sessionValidationPromise = null;
    }
  }
}

async function handleAuthChange(event, session) {
  if (event === "SIGNED_OUT" || !session) {
    clearSession("Sesión cerrada. Usa una cuenta autorizada para continuar.");
    return;
  }
  if (
    event === "TOKEN_REFRESHED"
    && currentUser
    && sessionLooksValid(session)
    && String(session.user.id) === String(currentUser.id)
  ) {
    currentSession = session;
    return;
  }
  await acceptSession(session, event === "USER_UPDATED");
}

async function initializeAuth() {
  clearContent();
  renderIcons();
  setLoginEnabled(false);
  if (!AUTH_CONFIG_READY) {
    showSignedOut("Panel bloqueado: falta una URL HTTPS, una clave publicable válida o la librería de Supabase.");
    return;
  }
  if (!DATA_CONFIG_READY && !DEMO_ALLOWED) {
    showSignedOut("Panel bloqueado: la configuración de tablas o bucket de Supabase está incompleta.");
    return;
  }
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
  } catch {
    showSignedOut("Panel bloqueado: no se pudo inicializar Supabase Auth.");
    return;
  }

  let bootstrapping = true;
  const listener = supabaseClient.auth.onAuthStateChange((event, session) => {
    if (bootstrapping && event === "INITIAL_SESSION") return;
    setTimeout(() => void handleAuthChange(event, session).catch(() => {
      clearSession("No se pudo validar el estado de autenticación.");
    }), 0);
  });
  authSubscription = listener && listener.data ? listener.data.subscription : null;

  try {
    const { data, error } = await supabaseClient.auth.getSession();
    bootstrapping = false;
    if (error) throw error;
    if (data && data.session) await acceptSession(data.session);
    else showSignedOut();
  } catch {
    bootstrapping = false;
    showSignedOut("No se pudo recuperar una sesión válida. Inicia sesión nuevamente.");
  }
}

async function refreshEvidenceView() {
  if (!hasValidSession() || !["remote", "demo"].includes(dataMode)) return;
  try {
    renderEvidence(dataMode === "remote" ? await loadRemoteEvidence() : await loadLocalEvidence());
  } catch (error) {
    if (!hasValidSession()) return;
    if (dataMode === "remote") {
      if (DEMO_ALLOWED) await activateDemo(authEpoch, "Backend no disponible; MODO DEMO local activo.");
      else blockAuthenticatedPanel("Panel bloqueado: no se pudieron leer las evidencias con los permisos de esta sesión.");
    } else showToast(publicMessage(error, "No se pudieron cargar las evidencias de demo."));
  }
}

async function refreshPropertyView() {
  if (!hasValidSession() || !["remote", "demo"].includes(dataMode)) return;
  try {
    renderProperties(dataMode === "remote" ? await loadRemoteProperties() : await loadLocalProperties());
  } catch (error) {
    if (!hasValidSession()) return;
    if (dataMode === "remote") {
      if (DEMO_ALLOWED) await activateDemo(authEpoch, "Backend no disponible; MODO DEMO local activo.");
      else blockAuthenticatedPanel("Panel bloqueado: no se pudieron leer las propiedades con los permisos de esta sesión.");
    } else showToast(publicMessage(error, "No se pudieron cargar las propiedades de demo."));
  }
}

function formValue(formData, name) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function requiredLine(formData, name, max, label) {
  const value = cleanLine(formValue(formData, name), max);
  if (!value) throw new PublicError(`${label} es obligatorio.`);
  return value;
}

function selectedValue(formData, name, allowed, label) {
  const value = cleanLine(formValue(formData, name), 80);
  if (!allowed.has(value)) throw new PublicError(`${label} no es válido.`);
  return value;
}

function optionalNumber(formData, name, min, max, label) {
  const raw = cleanLine(formValue(formData, name), 40);
  if (!raw) return null;
  const number = Number(raw);
  if (!Number.isFinite(number) || number < min || number > max) throw new PublicError(`${label} no es válido.`);
  return number;
}

async function requireMutationAccess() {
  if (adminWorkspace.hidden || !hasValidSession()) {
    throw new PublicError("Necesitas una sesión válida para modificar contenido.");
  }
  if (!["remote", "demo"].includes(dataMode)) throw new PublicError("El panel está bloqueado hasta validar el backend.");
  if (dataMode === "demo" && !DEMO_ALLOWED) throw new PublicError("El modo demo no está permitido en este entorno.");
  await requireFreshSession();
}

function localFileKey(namespace, itemId) {
  return `demo/${userId()}/${safePathSegment(namespace)}/${safePathSegment(itemId)}/${createUuid()}`;
}

async function saveEvidenceDraft(draft, file, fileInfo) {
  if (dataMode === "remote") {
    let upload = null;
    try {
      upload = await uploadFile(file, fileInfo, "evidence", draft.id);
      await insertRow(EVIDENCE_TABLE, {
        id: draft.id,
        title: draft.title,
        category: draft.category,
        city: draft.city,
        event_date: draft.eventDate || null,
        description: draft.description,
        media_type: draft.mediaType,
        media_url: upload.url,
        poster_url: null,
        is_featured: draft.isFeatured,
        is_published: draft.isPublished,
        created_at: draft.createdAt
      }, "Supabase no pudo guardar la evidencia.");
      return;
    } catch (error) {
      if (upload) await tryRemoveStorage([upload.path]);
      throw error;
    }
  }

  requireDemoStorage();
  const localKey = localFileKey("evidence", draft.id);
  await putBlob(localKey, file);
  try {
    writeLocalArray(LOCAL_META_KEY, [{ ...draft, ownerId: userId(), localKey }, ...readLocalArray(LOCAL_META_KEY)]);
  } catch (error) {
    await deleteBlob(localKey).catch(() => {});
    throw error;
  }
}

async function savePropertyDraft(property, files, fileInfos) {
  if (dataMode === "remote") {
    const uploads = [];
    try {
      for (let index = 0; index < files.length; index += 1) {
        uploads.push(await uploadFile(files[index], fileInfos[index], "properties", property.id));
      }
      const urls = uploads.map((upload) => upload.url);
      await insertRow(PROPERTY_TABLE, {
        id: property.id,
        title: property.title,
        subtitle: property.subtitle,
        price_label: property.priceLabel,
        price_usd: property.priceUsd,
        type: property.type,
        category: property.category,
        city: property.city,
        city_label: property.cityLabel,
        zone: property.zone,
        zone_label: property.zoneLabel,
        beds: property.beds,
        meters: property.meters,
        status: property.status,
        status_label: property.statusLabel,
        notes: property.notes,
        tags: property.tags,
        image_url: urls[0] || "",
        media_urls: urls,
        is_featured: property.isFeatured,
        is_published: property.isPublished,
        created_at: property.createdAt
      }, "Supabase no pudo guardar la propiedad.");
      return;
    } catch (error) {
      await tryRemoveStorage(uploads.map((upload) => upload.path));
      throw error;
    }
  }

  requireDemoStorage();
  const localKeys = [];
  try {
    for (const file of files) {
      const key = localFileKey("properties", property.id);
      await putBlob(key, file);
      localKeys.push(key);
    }
    writeLocalArray(LOCAL_PROPERTY_KEY, [{
      ...property,
      ownerId: userId(),
      imageUrl: "",
      mediaUrls: [],
      localKeys
    }, ...readLocalArray(LOCAL_PROPERTY_KEY)]);
  } catch (error) {
    await Promise.allSettled(localKeys.map(deleteBlob));
    throw error;
  }
}

function removeLocalRecord(key, id) {
  const owner = userId();
  writeLocalArray(key, readLocalArray(key).filter((item) => !(
    item
    && String(item.ownerId || "").toLowerCase() === owner
    && cleanLine(item.id, 160) === id
  )));
}

function setFormPending(form, pending, pendingText, idleText) {
  const button = form.querySelector("button[type='submit']");
  if (!button) return;
  button.disabled = pending;
  const label = button.querySelector("span");
  if (label) label.textContent = pending ? pendingText : idleText;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabaseClient || !AUTH_CONFIG_READY) {
    showToast("El panel está bloqueado por configuración incompleta.");
    return;
  }
  const formData = new FormData(loginForm);
  const email = cleanLine(formValue(formData, "email"), 254).toLowerCase();
  const password = formValue(formData, "password");
  const emailInput = loginForm.elements.namedItem("email");
  if (!(emailInput instanceof HTMLInputElement) || !emailInput.validity.valid || !email || !password || password.length > 1024) {
    showToast("Escribe un correo y una contraseña válidos.");
    return;
  }
  showAuthPending("Validando credenciales con Supabase...");
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error || !data || !data.session) throw new Error("sign in rejected");
    await acceptSession(data.session, true);
  } catch (error) {
    reportPortalDiagnostic("signIn", error, "sign_in_or_accept_failed");
    if (hasValidSession()) blockAuthenticatedPanel("No se pudo revalidar el acceso al backend.");
    else showSignedOut("No se pudo iniciar sesión. Verifica el correo, la contraseña y la conexión.");
    showToast("No se pudo iniciar sesión con esas credenciales.");
  } finally {
    const passwordInput = loginForm.elements.namedItem("password");
    if (passwordInput instanceof HTMLInputElement) passwordInput.value = "";
    if (!loginPanel.hidden) setLoginEnabled(true);
  }
});

logoutButton.addEventListener("click", async () => {
  if (!supabaseClient) return;
  logoutButton.disabled = true;
  try {
    const { error } = await supabaseClient.auth.signOut({ scope: "local" });
    if (error) throw error;
    clearSession("Sesión cerrada. Usa una cuenta autorizada para continuar.");
    showToast("Sesión cerrada.");
  } catch {
    showToast("No se pudo cerrar la sesión. Intenta nuevamente.");
  } finally {
    logoutButton.disabled = false;
  }
});

refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;
  try {
    await refreshEvidenceView();
  } finally {
    refreshButton.disabled = false;
  }
});

refreshPropertiesButton.addEventListener("click", async () => {
  refreshPropertiesButton.disabled = true;
  try {
    await refreshPropertyView();
  } finally {
    refreshPropertiesButton.disabled = false;
  }
});

toggleEvidenceForm.addEventListener("click", () => {
  if (!hasValidSession() || adminWorkspace.hidden) return;
  evidenceForm.hidden = !evidenceForm.hidden;
  const evidenceLabel = toggleEvidenceForm.querySelector("span");
  if (evidenceLabel) evidenceLabel.textContent = evidenceForm.hidden ? "Nueva evidencia" : "Cerrar formulario";
  if (!evidenceForm.hidden) {
    propertyForm.hidden = true;
    const propertyLabel = togglePropertyForm.querySelector("span");
    if (propertyLabel) propertyLabel.textContent = "Nueva propiedad";
  }
});

togglePropertyForm.addEventListener("click", () => {
  if (!hasValidSession() || adminWorkspace.hidden) return;
  propertyForm.hidden = !propertyForm.hidden;
  const propertyLabel = togglePropertyForm.querySelector("span");
  if (propertyLabel) propertyLabel.textContent = propertyForm.hidden ? "Nueva propiedad" : "Cerrar formulario";
  if (!propertyForm.hidden) {
    evidenceForm.hidden = true;
    const evidenceLabel = toggleEvidenceForm.querySelector("span");
    if (evidenceLabel) evidenceLabel.textContent = "Nueva evidencia";
  }
});

evidenceGrid.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("[data-delete]");
  if (!(button instanceof HTMLButtonElement)) return;
  const id = cleanLine(button.dataset.delete, 128);
  const item = evidenceItemsById.get(id);
  if (!item || !window.confirm(`¿Eliminar ${item.title || "esta evidencia"}?`)) return;
  button.disabled = true;
  try {
    await requireMutationAccess();
    let cleanupComplete = true;
    if (dataMode === "remote") {
      await deleteRow(EVIDENCE_TABLE, item.id, "No se pudo eliminar la evidencia en Supabase.");
      cleanupComplete = await tryRemoveStorage(evidencePaths(item));
    } else {
      removeLocalRecord(LOCAL_META_KEY, item.id);
      if (item.localKey) {
        try { await deleteBlob(item.localKey); } catch { cleanupComplete = false; }
      }
    }
    await refreshEvidenceView();
    showToast(cleanupComplete
      ? "Evidencia y archivo eliminados."
      : "Evidencia eliminada; no se pudo limpiar un archivo asociado.");
  } catch (error) {
    showToast(publicMessage(error, "No se pudo eliminar la evidencia."));
  } finally {
    button.disabled = false;
  }
});

propertyGrid.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("[data-delete-property]");
  if (!(button instanceof HTMLButtonElement)) return;
  const id = cleanLine(button.dataset.deleteProperty, 160);
  const item = propertyItemsById.get(id);
  if (!item || !window.confirm(`¿Eliminar ${item.title || "esta propiedad"}?`)) return;
  button.disabled = true;
  try {
    await requireMutationAccess();
    let cleanupComplete = true;
    if (dataMode === "remote") {
      await deleteRow(PROPERTY_TABLE, item.id, "No se pudo eliminar la propiedad en Supabase.");
      cleanupComplete = await tryRemoveStorage(propertyPaths(item));
    } else {
      removeLocalRecord(LOCAL_PROPERTY_KEY, item.id);
      const results = await Promise.allSettled(item.localKeys.map(deleteBlob));
      cleanupComplete = results.every((result) => result.status === "fulfilled");
    }
    await refreshPropertyView();
    showToast(cleanupComplete
      ? "Propiedad y archivos eliminados."
      : "Propiedad eliminada; no se pudieron limpiar todos los archivos asociados.");
  } catch (error) {
    showToast(publicMessage(error, "No se pudo eliminar la propiedad."));
  } finally {
    button.disabled = false;
  }
});

evidenceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFormPending(evidenceForm, true, "Guardando...", "Publicar evidencia");
  try {
    await requireMutationAccess();
    const formData = new FormData(evidenceForm);
    const file = formData.get("media");
    const fileInfo = validateFile(file, true);
    const rawDate = cleanLine(formValue(formData, "eventDate"), 10);
    if (rawDate && !safeDate(rawDate)) throw new PublicError("La fecha del evento no es válida.");
    const draft = {
      id: createUuid(),
      title: requiredLine(formData, "title", 160, "El título"),
      category: selectedValue(formData, "category", EVIDENCE_CATEGORIES, "El tipo"),
      city: cleanLine(formValue(formData, "city"), 120),
      eventDate: safeDate(rawDate),
      description: cleanText(formValue(formData, "description"), 3000),
      mediaType: fileInfo.mediaType,
      isFeatured: formData.get("isFeatured") === "on",
      isPublished: formData.get("isPublished") === "on",
      createdAt: new Date().toISOString()
    };
    await saveEvidenceDraft(draft, file, fileInfo);
    evidenceForm.reset();
    evidenceForm.hidden = true;
    resetToggleLabels();
    await refreshEvidenceView();
    showToast(dataMode === "demo" ? "Evidencia guardada en MODO DEMO." : "Evidencia guardada.");
  } catch (error) {
    showToast(publicMessage(error, "No se pudo guardar la evidencia."));
  } finally {
    setFormPending(evidenceForm, false, "Guardando...", "Publicar evidencia");
  }
});

propertyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFormPending(propertyForm, true, "Guardando...", "Guardar propiedad");
  try {
    await requireMutationAccess();
    const formData = new FormData(propertyForm);
    const files = formData.getAll("media").filter((file) => file instanceof File && file.size > 0);
    if (!files.length) throw new PublicError("Sube al menos una imagen.");
    if (files.length > MAX_PROPERTY_IMAGES) throw new PublicError(`Puedes subir un máximo de ${MAX_PROPERTY_IMAGES} imágenes.`);
    const fileInfos = files.map((file) => validateFile(file, false));
    const title = requiredLine(formData, "title", 160, "El nombre");
    const cityLabel = requiredLine(formData, "cityLabel", 100, "La ciudad");
    const zoneLabel = requiredLine(formData, "zoneLabel", 100, "La zona");
    const status = selectedValue(formData, "status", PROPERTY_STATUSES, "El estado");
    const property = {
      id: createUuid(),
      title,
      subtitle: requiredLine(formData, "subtitle", 200, "La frase corta"),
      priceLabel: requiredLine(formData, "priceLabel", 80, "El precio visible"),
      priceUsd: optionalNumber(formData, "priceUsd", 0, 1_000_000_000, "El precio en US$"),
      type: selectedValue(formData, "type", PROPERTY_TYPES, "El tipo"),
      category: selectedValue(formData, "category", PROPERTY_CATEGORIES, "La categoría"),
      city: plainSlug(cityLabel),
      cityLabel,
      zone: plainSlug(zoneLabel),
      zoneLabel,
      beds: optionalNumber(formData, "beds", 0, 100, "La cantidad de habitaciones"),
      meters: optionalNumber(formData, "meters", 0, 10_000_000, "Los metros"),
      status,
      statusLabel: statusLabel(status),
      notes: cleanText(formValue(formData, "notes"), 3000),
      tags: cleanLine(formValue(formData, "tags"), 500).split(",").map((tag) => cleanLine(tag, 40)).filter(Boolean).slice(0, 12),
      isFeatured: formData.get("isFeatured") === "on",
      isPublished: formData.get("isPublished") === "on",
      createdAt: new Date().toISOString()
    };
    await savePropertyDraft(property, files, fileInfos);
    propertyForm.reset();
    propertyForm.hidden = true;
    resetToggleLabels();
    await refreshPropertyView();
    showToast(dataMode === "demo" ? "Propiedad guardada en MODO DEMO." : "Propiedad guardada.");
  } catch (error) {
    showToast(publicMessage(error, "No se pudo guardar la propiedad."));
  } finally {
    setFormPending(propertyForm, false, "Guardando...", "Guardar propiedad");
  }
});

window.addEventListener("beforeunload", () => {
  revokeObjectUrls(evidenceObjectUrls);
  revokeObjectUrls(propertyObjectUrls);
  if (authSubscription && typeof authSubscription.unsubscribe === "function") authSubscription.unsubscribe();
});

void initializeAuth().catch(() => {
  clearSession("Panel bloqueado: no se pudo inicializar el centro de contenido.");
});
