const STORAGE_KEY = "antony-crm-local-v1";
const APP_VERSION = 5;
const MAX_AUDIT_ENTRIES = 500;
const VALID_CURRENCIES = ["USD", "DOP"];
const VALID_CLIENT_STAGES = ["Nuevo", "Calificado", "En seguimiento", "Comprador", "Inactivo"];
const VALID_PROPERTY_STAGES = ["Sin definir", "Listo", "En planos", "En construcción", "Indiferente"];
const VALID_SALE_STATUSES = ["Reservada", "Contratada", "Entregada", "Cancelada"];
const CLOSED_SALE_STATUSES = ["Contratada", "Entregada"];
const VALID_PAYMENT_METHODS = ["Transferencia", "Efectivo", "Cheque", "Otro"];
const VALID_PAYMENT_STATUSES = ["Contabilizado", "Anulado", "Revertido"];
const DEVELOPER_PROJECTS = Object.freeze({
  "Constructora LVP": Object.freeze([
    "Altos del Este",
    "Riviera 1",
    "Riviera 2",
    "Riviera 3",
    "Riviera 4",
    "Vistas del Limonal",
    "Epic Moon",
    "Epic River",
    "Doña Carmen",
    "Las Margaritas",
    "LP12",
    "LP11",
    "LP11 ABEY",
    "East Town"
  ])
});
const EMPTY_STATE = {
  clients: [],
  sales: [],
  installments: [],
  payments: [],
  auditLog: []
};
const QUERY = new URLSearchParams(window.location.search);
const IS_LOCAL_HOST = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
const DEMO_MODE = IS_LOCAL_HOST && QUERY.get("cloud") !== "1";
const cloudBackend = window.AntonyCrmBackend || null;
const INITIAL_AUTH_LINK_TYPE = (() => {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return hash.get("type") || QUERY.get("type") || "";
})();
let passwordSetupRequired = ["invite", "recovery"].includes(INITIAL_AUTH_LINK_TYPE);

const DEMO_DATA = {
  clients: [
    {
      id: "client-1",
      name: "María Rodríguez",
      phone: "809-555-0101",
      email: "maria.demo@example.com",
      source: "WhatsApp",
      stage: "En seguimiento",
      desiredZone: "Punta Cana",
      propertyStage: "En planos",
      budget: 200000,
      budgetCurrency: "USD",
      notes: "Interesada en una propiedad para inversión.",
      capturedAt: "2026-07-14",
      createdAt: "2026-07-14",
      updatedAt: "2026-07-14"
    },
    {
      id: "client-2",
      name: "Carlos Peña",
      phone: "829-555-0112",
      email: "carlos.demo@example.com",
      source: "Referido",
      stage: "Comprador",
      desiredZone: "Santo Domingo",
      propertyStage: "Listo",
      budget: 10000000,
      budgetCurrency: "DOP",
      notes: "Busca apartamento familiar en Santo Domingo.",
      capturedAt: "2026-08-02",
      createdAt: "2026-08-02",
      updatedAt: "2026-08-02"
    }
  ],
  sales: [
    {
      id: "sale-1",
      clientId: "client-1",
      project: "Mirador Sur",
      unit: "A-302",
      developer: "Caribe Development",
      saleStatus: "Contratada",
      salePrice: 185000,
      saleCurrency: "USD",
      saleDate: "2026-07-18",
      deliveryDate: "2027-03-30",
      sharedSale: true,
      externalAgent: "Laura Méndez",
      commissionRate: 3,
      commissionAmount: 5550,
      commissionCurrency: "USD",
      commissionDueDate: "2026-08-20",
      cancelReason: "",
      cancelledAt: "",
      notes: "Primera cuota de comisión pendiente.",
      createdAt: "2026-07-18",
      updatedAt: "2026-07-18"
    },
    {
      id: "sale-2",
      clientId: "client-2",
      project: "Colinas de los Ríos",
      unit: "B-204",
      developer: "Grupo Horizonte",
      saleStatus: "Contratada",
      salePrice: 9500000,
      saleCurrency: "DOP",
      saleDate: "2026-08-03",
      deliveryDate: "2026-12-15",
      sharedSale: false,
      externalAgent: "",
      commissionRate: 3,
      commissionAmount: 285000,
      commissionCurrency: "DOP",
      commissionDueDate: "2026-08-30",
      cancelReason: "",
      cancelledAt: "",
      notes: "Comisión acordada en dos pagos.",
      createdAt: "2026-08-03",
      updatedAt: "2026-08-03"
    }
  ],
  installments: [
    {
      id: "installment-1",
      saleId: "sale-1",
      sequence: 1,
      label: "Cuota única",
      amount: 5550,
      dueDate: "2026-08-20",
      notes: "",
      createdAt: "2026-07-18",
      updatedAt: "2026-07-18"
    },
    {
      id: "installment-2a",
      saleId: "sale-2",
      sequence: 1,
      label: "Avance",
      amount: 142500,
      dueDate: "2026-08-30",
      notes: "",
      createdAt: "2026-08-03",
      updatedAt: "2026-08-03"
    },
    {
      id: "installment-2b",
      saleId: "sale-2",
      sequence: 2,
      label: "Saldo",
      amount: 142500,
      dueDate: "2026-09-30",
      notes: "",
      createdAt: "2026-08-03",
      updatedAt: "2026-08-03"
    }
  ],
  payments: [
    {
      id: "payment-1",
      saleId: "sale-1",
      amount: 3000,
      currency: "USD",
      paymentDate: "2026-08-01",
      method: "Transferencia",
      reference: "DEMO-001",
      notes: "Primer abono.",
      status: "Contabilizado",
      createdAt: "2026-08-01",
      updatedAt: "2026-08-01"
    },
    {
      id: "payment-2",
      saleId: "sale-2",
      amount: 100000,
      currency: "DOP",
      paymentDate: "2026-08-12",
      method: "Transferencia",
      reference: "DEMO-002",
      notes: "Primer abono de la comisión.",
      status: "Contabilizado",
      createdAt: "2026-08-12",
      updatedAt: "2026-08-12"
    }
  ],
  auditLog: []
};

let storageHealthy = true;
let storageIssue = "";
let state = DEMO_MODE ? loadState() : clone(EMPTY_STATE);
let currentSession = null;
let cloudReady = false;
let appBusy = false;
let collectionFilter = "all";
let activeDrawer = null;
let drawerReturnFocus = null;
let detailRecord = null;
let inertedElements = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix) {
  return prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function today() {
  const now = new Date();
  return (
    now.getFullYear() +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(now.getDate()).padStart(2, "0")
  );
}

function numberValue(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function toCents(value) {
  return Math.round((numberValue(value) + Number.EPSILON) * 100);
}

function fromCents(value) {
  return numberValue(value) / 100;
}

function normalizeCurrency(value, fallback) {
  const candidate = String(value || "").toUpperCase();
  if (VALID_CURRENCIES.includes(candidate)) return candidate;
  return VALID_CURRENCIES.includes(fallback) ? fallback : "USD";
}

function assertUniqueIds(items, label) {
  const ids = items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Hay identificadores duplicados en " + label + ".");
  }
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const parsed = new Date(String(value) + "T12:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function dateOnly(value, fallback) {
  const candidate = String(value || "").slice(0, 10);
  return isValidIsoDate(candidate) ? candidate : fallback || today();
}

function assertImportDates(value) {
  const groups = [
    ["clients", ["capturedAt", "createdAt", "updatedAt"]],
    ["sales", ["saleDate", "deliveryDate", "commissionDueDate", "cancelledAt", "createdAt", "updatedAt"]],
    ["installments", ["dueDate", "createdAt", "updatedAt"]],
    ["payments", ["paymentDate", "voidedAt", "createdAt", "updatedAt"]]
  ];
  groups.forEach(([collection, fields]) => {
    const rows = Array.isArray(value?.[collection]) ? value[collection] : [];
    rows.forEach((row, index) => {
      fields.forEach((field) => {
        if (row?.[field] == null || row[field] === "") return;
        if (!isValidIsoDate(String(row[field]).slice(0, 10))) {
          throw new Error(
            "Fecha inválida en " + collection + "[" + index + "]." + field
          );
        }
      });
    });
  });
}

function normalizeState(value) {
  if (
    !value ||
    !Array.isArray(value.clients) ||
    !Array.isArray(value.sales) ||
    !Array.isArray(value.payments)
  ) {
    throw new Error("El archivo no contiene la estructura esperada.");
  }

  const clients = value.clients.map((client, index) => ({
    id: String(client.id || "client-import-" + index),
    name: String(client.name || "").trim(),
    phone: String(client.phone || "").trim(),
    email: String(client.email || "").trim(),
    source: String(client.source || "Otro"),
    stage: String(client.stage || "Nuevo"),
    desiredZone: String(client.desiredZone || "").trim(),
    propertyStage: VALID_PROPERTY_STAGES.includes(String(client.propertyStage || ""))
      ? String(client.propertyStage)
      : "Sin definir",
    budget: Math.max(numberValue(client.budget), 0),
    budgetCurrency: normalizeCurrency(client.budgetCurrency, "USD"),
    notes: String(client.notes || "").trim(),
    capturedAt: dateOnly(client.capturedAt || client.createdAt, today()),
    createdAt: dateOnly(client.createdAt, today()),
    updatedAt: dateOnly(client.updatedAt || client.createdAt, today())
  }));

  const sales = value.sales.map((sale, index) => {
    const saleCurrency = normalizeCurrency(sale.saleCurrency, "USD");
    return {
      id: String(sale.id || "sale-import-" + index),
      clientId: String(sale.clientId || ""),
      project: String(sale.project || "").trim(),
      unit: String(sale.unit || "").trim(),
      developer: String(sale.developer || "").trim(),
      saleStatus: String(sale.saleStatus || "Contratada"),
      salePrice: Math.max(numberValue(sale.salePrice), 0),
      saleCurrency,
      saleDate: dateOnly(sale.saleDate, today()),
      deliveryDate: sale.deliveryDate ? dateOnly(sale.deliveryDate, "") : "",
      sharedSale: Boolean(sale.sharedSale),
      externalAgent: String(sale.externalAgent || "").trim(),
      commissionRate: Math.max(numberValue(sale.commissionRate), 0),
      commissionAmount: Math.max(numberValue(sale.commissionAmount), 0),
      commissionCurrency: normalizeCurrency(sale.commissionCurrency, saleCurrency),
      commissionDueDate: String(sale.commissionDueDate || ""),
      cancelReason: String(sale.cancelReason || "").trim(),
      cancelledAt: String(sale.cancelledAt || ""),
      notes: String(sale.notes || "").trim(),
      createdAt: dateOnly(sale.createdAt, today()),
      updatedAt: dateOnly(sale.updatedAt || sale.createdAt, today())
    };
  });

  const salesById = new Map(sales.map((sale) => [sale.id, sale]));
  const sourceInstallments = Array.isArray(value.installments)
    ? value.installments
    : sales.map((sale) => ({
        id: "installment-import-" + sale.id + "-1",
        saleId: sale.id,
        sequence: 1,
        label: "Cuota única",
        amount: sale.commissionAmount,
        dueDate: sale.commissionDueDate || sale.saleDate,
        notes: "",
        createdAt: sale.createdAt,
        updatedAt: sale.updatedAt
      }));
  const installments = sourceInstallments.map((installment, index) => {
    const sale = salesById.get(String(installment.saleId || ""));
    return {
      id: String(installment.id || "installment-import-" + index),
      saleId: String(installment.saleId || ""),
      sequence: Math.max(Math.trunc(numberValue(installment.sequence || index + 1)), 1),
      label: String(installment.label || "Cuota " + (index + 1)).trim(),
      amount: Math.max(numberValue(installment.amount), 0),
      dueDate: dateOnly(
        installment.dueDate || sale?.commissionDueDate || sale?.saleDate,
        sale?.saleDate || today()
      ),
      notes: String(installment.notes || "").trim(),
      createdAt: dateOnly(installment.createdAt || sale?.createdAt, today()),
      updatedAt: dateOnly(
        installment.updatedAt || installment.createdAt || sale?.updatedAt,
        today()
      )
    };
  });
  sales.forEach((sale) => {
    const dates = installments
      .filter((installment) => installment.saleId === sale.id && installment.dueDate)
      .map((installment) => installment.dueDate)
      .sort();
    sale.commissionDueDate = dates[0] || "";
  });
  const payments = value.payments.map((payment, index) => {
    const sale = salesById.get(String(payment.saleId || ""));
    return {
      id: String(payment.id || "payment-import-" + index),
      saleId: String(payment.saleId || ""),
      installmentId: String(payment.installmentId || ""),
      amount: Math.max(numberValue(payment.amount), 0),
      currency: normalizeCurrency(payment.currency, sale?.commissionCurrency || "USD"),
      paymentDate: dateOnly(payment.paymentDate, today()),
      method: String(payment.method || "Otro"),
      reference: String(payment.reference || "").trim(),
      notes: String(payment.notes || "").trim(),
      status: String(payment.status || "Contabilizado"),
      voidReason: String(payment.voidReason || "").trim(),
      voidedAt: String(payment.voidedAt || ""),
      createdAt: dateOnly(payment.createdAt, today()),
      updatedAt: dateOnly(payment.updatedAt || payment.createdAt, today())
    };
  });

  assertUniqueIds(clients, "clientes");
  assertUniqueIds(sales, "ventas");
  assertUniqueIds(installments, "cuotas");
  assertUniqueIds(payments, "cobros");
  const clientIds = new Set(clients.map((client) => client.id));
  const saleIds = new Set(sales.map((sale) => sale.id));
  if (sales.some((sale) => !clientIds.has(sale.clientId))) {
    throw new Error("Una venta apunta a un cliente inexistente.");
  }
  if (payments.some((payment) => !saleIds.has(payment.saleId))) {
    throw new Error("Un cobro apunta a una venta inexistente.");
  }
  if (installments.some((installment) => !saleIds.has(installment.saleId))) {
    throw new Error("Una cuota apunta a una venta inexistente.");
  }
  const installmentIds = new Set(installments.map((installment) => installment.id));
  if (
    payments.some(
      (payment) => payment.installmentId && !installmentIds.has(payment.installmentId)
    )
  ) {
    throw new Error("Un cobro apunta a una cuota inexistente.");
  }
  if (
    clients.some(
      (client) =>
        !client.name ||
        !client.phone ||
        !client.email ||
        !VALID_CLIENT_STAGES.includes(client.stage) ||
        !VALID_PROPERTY_STAGES.includes(client.propertyStage) ||
        !isValidIsoDate(client.capturedAt) ||
        client.capturedAt > today() ||
        !isValidIsoDate(client.createdAt) ||
        !isValidIsoDate(client.updatedAt) ||
        (client.email && !/^\S+@\S+\.\S+$/.test(client.email))
    )
  ) {
    throw new Error("Hay clientes sin teléfono, correo o con datos inválidos.");
  }
  if (
    sales.some(
      (sale) =>
        !sale.project ||
        !sale.unit ||
        !VALID_SALE_STATUSES.includes(sale.saleStatus) ||
        sale.salePrice <= 0 ||
        sale.commissionAmount <= 0 ||
        sale.commissionRate < 0 ||
        sale.commissionRate > 100 ||
        !isValidIsoDate(sale.saleDate) ||
        (sale.deliveryDate &&
          (!isValidIsoDate(sale.deliveryDate) || sale.deliveryDate < sale.saleDate)) ||
        (sale.sharedSale && !sale.externalAgent) ||
        (!sale.sharedSale && sale.externalAgent) ||
        (isCancelledSale(sale) && !sale.cancelReason) ||
        (sale.commissionDueDate &&
          (!isValidIsoDate(sale.commissionDueDate) ||
            sale.commissionDueDate < sale.saleDate))
    )
  ) {
    throw new Error("Hay ventas con operación, importes, estado o fechas inválidas.");
  }
  if (
    installments.some((installment) => {
      const sale = salesById.get(installment.saleId);
      return (
        !installment.label ||
        installment.amount <= 0 ||
        !isValidIsoDate(installment.dueDate) ||
        installment.dueDate < sale.saleDate
      );
    })
  ) {
    throw new Error("Hay cuotas con monto, etiqueta o fecha inválida.");
  }
  sales.forEach((sale) => {
    const schedule = installments.filter((installment) => installment.saleId === sale.id);
    if (!schedule.length) {
      throw new Error("Cada venta debe tener al menos una cuota de comisión.");
    }
    const scheduledCents = schedule.reduce(
      (total, installment) => total + toCents(installment.amount),
      0
    );
    if (scheduledCents !== toCents(sale.commissionAmount)) {
      throw new Error("El plan de cuotas no coincide con la comisión total.");
    }
  });
  const activeUnits = new Set();
  sales.forEach((sale) => {
    if (isCancelledSale(sale)) return;
    const unitKey = normalizeText(sale.project) + "::" + normalizeText(sale.unit);
    if (activeUnits.has(unitKey)) {
      throw new Error("Hay más de una venta activa para el mismo proyecto y unidad.");
    }
    activeUnits.add(unitKey);
  });
  if (
    payments.some((payment) => {
      const sale = salesById.get(payment.saleId);
      return (
        payment.amount <= 0 ||
        !VALID_PAYMENT_METHODS.includes(payment.method) ||
        !VALID_PAYMENT_STATUSES.includes(payment.status) ||
        !isValidIsoDate(payment.paymentDate) ||
        payment.paymentDate > today() ||
        payment.paymentDate < sale.saleDate ||
        (payment.method !== "Efectivo" &&
          payment.status === "Contabilizado" &&
          !payment.reference) ||
        (payment.status !== "Contabilizado" && !payment.voidReason)
      );
    })
  ) {
    throw new Error("Hay cobros con monto, método, referencia, estado o fechas inválidas.");
  }
  sales.forEach((sale) => {
    const activePayments = payments.filter(
      (payment) =>
        payment.saleId === sale.id &&
        payment.status !== "Anulado" &&
        payment.status !== "Revertido"
    );
    if (activePayments.some((payment) => payment.currency !== sale.commissionCurrency)) {
      throw new Error("Un cobro usa una moneda distinta de su comisión.");
    }
    const paidCents = activePayments.reduce(
      (total, payment) => total + toCents(payment.amount),
      0
    );
    if (paidCents > toCents(sale.commissionAmount)) {
      throw new Error("Una venta contiene cobros superiores a su comisión.");
    }
    if (isCancelledSale(sale) && activePayments.length) {
      throw new Error("Una venta cancelada no puede conservar cobros contabilizados.");
    }
  });

  return {
    clients,
    sales,
    installments,
    payments,
    auditLog: Array.isArray(value.auditLog)
      ? value.auditLog.slice(0, MAX_AUDIT_ENTRIES)
      : []
  };
}

function loadState() {
  if (!DEMO_MODE) return clone(EMPTY_STATE);
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return clone(EMPTY_STATE);
  try {
    return normalizeState(JSON.parse(saved));
  } catch (error) {
    storageHealthy = false;
    storageIssue =
      "Los datos locales están dañados. No se sobrescribirán; importa un respaldo o vacía el CRM.";
    return clone(EMPTY_STATE);
  }
}

function saveState() {
  if (!DEMO_MODE) return true;
  if (!storageHealthy) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    storageHealthy = false;
    storageIssue =
      "No se pudo guardar. Revisa el espacio disponible y descarga un respaldo.";
    return false;
  }
}

function recordAudit(action, entity, entityId, details) {
  if (!DEMO_MODE) return;
  state.auditLog.unshift({
    id: makeId("audit"),
    action,
    entity,
    entityId,
    details: String(details || ""),
    createdAt: new Date().toISOString()
  });
  state.auditLog = state.auditLog.slice(0, MAX_AUDIT_ENTRIES);
}

function formatDate(value) {
  if (!value) return "—";
  const parsed = new Date(String(value) + "T12:00:00");
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("es-DO", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(parsed);
}

function yearOf(value) {
  return String(value || "").slice(0, 4);
}

function money(value, currency) {
  const prefix = normalizeCurrency(currency, "USD") === "DOP" ? "RD$" : "US$";
  return (
    prefix +
    fromCents(toCents(value)).toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    })
  );
}

function moneyFromCents(value, currency) {
  return money(fromCents(value), currency);
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function emptyMoneyTotals() {
  return { USD: 0, DOP: 0 };
}

function addMoney(totals, amount, currency) {
  totals[normalizeCurrency(currency, "USD")] += toCents(amount);
  return totals;
}

function aggregate(items, amountKey, currencyKey) {
  return items.reduce(
    (totals, item) => addMoney(totals, item[amountKey], item[currencyKey]),
    emptyMoneyTotals()
  );
}

function pairMoney(totals) {
  return (
    moneyFromCents(totals.USD, "USD") +
    " · " +
    moneyFromCents(totals.DOP, "DOP")
  );
}

function clientById(id) {
  return state.clients.find((client) => client.id === id);
}

function saleById(id) {
  return state.sales.find((sale) => sale.id === id);
}

function installmentById(id) {
  return state.installments.find((installment) => installment.id === id);
}

function paymentById(id) {
  return state.payments.find((payment) => payment.id === id);
}

function clientName(id) {
  return clientById(id)?.name || "Cliente eliminado";
}

function saleLabel(sale) {
  return sale ? sale.project + " · " + sale.unit : "Venta eliminada";
}

function isCancelledSale(sale) {
  return sale?.saleStatus === "Cancelada";
}

function isClosedSale(sale) {
  return CLOSED_SALE_STATUSES.includes(sale?.saleStatus);
}

function isActivePayment(payment) {
  return payment?.status !== "Anulado" && payment?.status !== "Revertido";
}

function paymentsForSale(saleId) {
  return state.payments.filter((payment) => payment.saleId === saleId);
}

function installmentsForSale(saleId) {
  return state.installments
    .filter((installment) => installment.saleId === saleId)
    .sort(
      (a, b) =>
        String(a.dueDate).localeCompare(String(b.dueDate)) ||
        numberValue(a.sequence) - numberValue(b.sequence)
    );
}

function activePaymentsForSale(saleId, excludedId) {
  const sale = saleById(saleId);
  if (!sale) return [];
  return state.payments.filter(
    (payment) =>
      payment.saleId === saleId &&
      payment.id !== excludedId &&
      isActivePayment(payment) &&
      payment.currency === sale.commissionCurrency
  );
}

function paidForSaleCents(saleId, excludedId) {
  return activePaymentsForSale(saleId, excludedId).reduce(
    (total, payment) => total + toCents(payment.amount),
    0
  );
}

function paidForSale(saleId, excludedId) {
  return fromCents(paidForSaleCents(saleId, excludedId));
}

function pendingForSaleCents(sale, excludedId) {
  if (!sale || isCancelledSale(sale)) return 0;
  return Math.max(
    toCents(sale.commissionAmount) - paidForSaleCents(sale.id, excludedId),
    0
  );
}

function pendingForSale(sale, excludedId) {
  return fromCents(pendingForSaleCents(sale, excludedId));
}

function installmentLedgerForSale(saleId, excludedPaymentId) {
  let availableCents = paidForSaleCents(saleId, excludedPaymentId);
  return installmentsForSale(saleId).map((installment) => {
    const amountCents = toCents(installment.amount);
    const paidCents = Math.min(amountCents, Math.max(availableCents, 0));
    availableCents -= paidCents;
    const pendingCents = amountCents - paidCents;
    return { ...installment, amountCents, paidCents, pendingCents };
  });
}

function nextOpenInstallment(sale, excludedPaymentId) {
  if (!sale || isCancelledSale(sale)) return null;
  return (
    installmentLedgerForSale(sale.id, excludedPaymentId).find(
      (installment) => installment.pendingCents > 0
    ) || null
  );
}

function nextCommissionDueDate(sale) {
  return nextOpenInstallment(sale)?.dueDate || "";
}

function parseLocalDate(value) {
  const parts = String(value || "").split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
}

function daysBetween(from, to) {
  const first = parseLocalDate(from);
  const second = parseLocalDate(to);
  if (!first || !second) return 0;
  return Math.round((second.getTime() - first.getTime()) / 86400000);
}

function isCommissionOverdue(sale) {
  const nextInstallment = nextOpenInstallment(sale);
  return Boolean(nextInstallment?.dueDate && nextInstallment.dueDate < today());
}

function statusForSale(sale) {
  if (isCancelledSale(sale)) {
    return { label: "Anulada", className: "status-void" };
  }
  const commission = toCents(sale.commissionAmount);
  const paid = paidForSaleCents(sale.id);
  if (commission > 0 && commission - paid === 0) {
    return { label: "Pagada", className: "status-paid" };
  }
  if (isCommissionOverdue(sale)) {
    return { label: "Vencida", className: "status-overdue" };
  }
  if (paid > 0) {
    return { label: "Parcial", className: "status-partial" };
  }
  return { label: "Pendiente", className: "status-pending" };
}

function statusBadge(sale) {
  const status = statusForSale(sale);
  return (
    '<span class="status-pill ' +
    status.className +
    '">' +
    escapeHtml(status.label) +
    "</span>"
  );
}

function saleStatusBadge(sale) {
  return (
    '<span class="sale-state' +
    (isCancelledSale(sale) ? " sale-state-cancelled" : "") +
    '">' +
    escapeHtml(sale.saleStatus) +
    "</span>"
  );
}

function showToast(message, duration) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(
    () => toast.classList.remove("show"),
    duration || 3000
  );
}

function clearFormErrors(form) {
  form.querySelectorAll(".field-error").forEach((error) => error.remove());
  form.querySelectorAll('[aria-invalid="true"]').forEach((field) => {
    field.removeAttribute("aria-invalid");
    const errorId = field.dataset.errorId;
    if (errorId) {
      const describedBy = String(field.getAttribute("aria-describedby") || "")
        .split(/\s+/)
        .filter((id) => id && id !== errorId)
        .join(" ");
      if (describedBy) field.setAttribute("aria-describedby", describedBy);
      else field.removeAttribute("aria-describedby");
      delete field.dataset.errorId;
    }
  });
}

function showFieldError(form, name, message) {
  clearFormErrors(form);
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLElement)) {
    showToast(message);
    return false;
  }
  const error = document.createElement("small");
  const errorId = form.id + "-" + name + "-error";
  error.id = errorId;
  error.className = "field-error";
  error.textContent = message;
  const label = field.closest("label");
  (label || field.parentElement).appendChild(error);
  field.setAttribute("aria-invalid", "true");
  field.dataset.errorId = errorId;
  const describedBy = new Set(
    String(field.getAttribute("aria-describedby") || "")
      .split(/\s+/)
      .filter(Boolean)
  );
  describedBy.add(errorId);
  field.setAttribute("aria-describedby", [...describedBy].join(" "));
  field.focus();
  showToast(message);
  return false;
}

function requestConfirmation(options) {
  const dialog = document.querySelector("#confirmDialog");
  const title = document.querySelector("#confirmDialogTitle");
  const message = document.querySelector("#confirmDialogMessage");
  const accept = document.querySelector("#confirmDialogAccept");
  const reasonWrap = document.querySelector("#confirmReasonWrap");
  const reasonField = document.querySelector("#confirmReason");
  title.textContent = options.title || "Confirmar acción";
  message.textContent = options.message || "Esta acción requiere confirmación.";
  accept.textContent = options.confirmLabel || "Confirmar";
  accept.classList.toggle("button-danger", options.danger !== false);
  reasonWrap.hidden = !options.requireReason;
  reasonField.value = "";
  reasonField.required = Boolean(options.requireReason);
  refreshIcons();
  return new Promise((resolve) => {
    const validateReason = (event) => {
      if (options.requireReason && !reasonField.value.trim()) {
        event.preventDefault();
        reasonField.setCustomValidity("Indica el motivo antes de continuar.");
        reasonField.reportValidity();
        reasonField.focus();
      } else {
        reasonField.setCustomValidity("");
      }
    };
    accept.addEventListener("click", validateReason);
    dialog.addEventListener(
      "close",
      () => {
        accept.removeEventListener("click", validateReason);
        resolve({
          confirmed: dialog.returnValue === "confirm",
          reason: reasonField.value.trim()
        });
      },
      { once: true }
    );
    dialog.showModal();
    window.setTimeout(() => {
      (options.requireReason ? reasonField : dialog.querySelector('[value="cancel"]')).focus();
    }, 0);
  });
}

function resetDrawerForm(formId) {
  if (formId === "clientForm") resetClientForm();
  if (formId === "saleForm") resetSaleForm();
  if (formId === "paymentForm") resetPaymentForm();
}

function unlockModalBackground() {
  inertedElements.forEach(({ element, wasInert }) => {
    if (!wasInert) element.removeAttribute("inert");
  });
  inertedElements = [];
}

function lockModalBackground(panel) {
  unlockModalBackground();
  const targets = [document.querySelector(".sidebar"), document.querySelector(".topbar")];
  const content = document.querySelector(".content-shell");
  if (content && !content.contains(panel)) {
    targets.push(content);
  } else {
    document.querySelectorAll(".view").forEach((view) => {
      if (view.contains(panel)) {
        [...view.children].forEach((child) => {
          if (child !== panel) targets.push(child);
        });
      } else {
        targets.push(view);
      }
    });
  }
  inertedElements = targets
    .filter((element) => element instanceof HTMLElement)
    .map((element) => {
      const wasInert = element.hasAttribute("inert");
      element.setAttribute("inert", "");
      return { element, wasInert };
    });
}

function closeDrawer(resetForm, restoreFocus) {
  if (!activeDrawer) return;
  const panel = activeDrawer;
  const returnTarget = drawerReturnFocus;
  activeDrawer = null;
  drawerReturnFocus = null;
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
  panel.setAttribute("inert", "");
  unlockModalBackground();
  document.body.classList.remove("drawer-open");
  const backdrop = document.querySelector("#drawerBackdrop");
  backdrop.classList.remove("visible");
  window.setTimeout(() => {
    if (!activeDrawer) backdrop.hidden = true;
  }, 180);
  if (resetForm !== false) resetDrawerForm(panel.id);
  if (panel.id === "recordDetailDrawer") detailRecord = null;
  if (restoreFocus !== false && returnTarget instanceof HTMLElement) {
    window.setTimeout(() => returnTarget.focus(), 0);
  }
}

function openDrawer(formId, trigger) {
  const panel = document.querySelector("#" + formId);
  if (!panel) return;
  if (activeDrawer && activeDrawer !== panel) closeDrawer(true, false);
  activeDrawer = panel;
  drawerReturnFocus = trigger instanceof HTMLElement ? trigger : document.activeElement;
  const backdrop = document.querySelector("#drawerBackdrop");
  backdrop.hidden = false;
  panel.removeAttribute("inert");
  panel.setAttribute("aria-hidden", "false");
  lockModalBackground(panel);
  document.body.classList.add("drawer-open");
  requestAnimationFrame(() => {
    backdrop.classList.add("visible");
    panel.classList.add("open");
    const focusTarget =
      panel.querySelector('input:not([type="hidden"]), select, textarea') ||
      panel.querySelector("button");
    if (focusTarget instanceof HTMLElement) focusTarget.focus({ preventScroll: true });
  });
}

function renderStorageStatus() {
  const badge = document.querySelector("#storageBadge");
  const environmentBadge = document.querySelector("#environmentBadge");
  const environment = environmentBadge?.querySelector("span");
  if (DEMO_MODE && storageHealthy) {
    badge.textContent = "Demo local · solo este navegador";
    badge.classList.remove("storage-error");
    badge.title = "Prototipo local. No uses información real de clientes.";
    if (environment) environment.textContent = "Demostración local";
    environmentBadge?.setAttribute("aria-label", "Demostración local; datos guardados solo en este navegador");
  } else if (!DEMO_MODE && cloudReady && storageHealthy) {
    badge.textContent = "Nube segura · sincronizado";
    badge.classList.remove("storage-error");
    badge.title = "Datos guardados con control de acceso en Supabase.";
    if (environment) environment.textContent = "Nube segura · en línea";
    environmentBadge?.setAttribute("aria-label", "Nube segura mediante Supabase; sincronización en línea");
  } else {
    badge.textContent = DEMO_MODE ? "Guardado bloqueado" : "Conexión no disponible";
    badge.classList.add("storage-error");
    badge.title = storageIssue;
    if (environment) environment.textContent = "Sin conexión";
    environmentBadge?.setAttribute("aria-label", "Sin conexión; revisa el estado del sistema");
  }
}

const VIEW_HASHES = {
  dashboard: "resumen",
  clients: "clientes",
  sales: "ventas",
  payments: "cobros",
  reports: "reportes"
};

const VIEW_TITLES = {
  dashboard: "Resumen",
  clients: "Clientes",
  sales: "Ventas",
  payments: "Cobros",
  reports: "Reportes"
};

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

function renderWorkspaceContext() {
  const dateLabel = document.querySelector("#currentDateLabel");
  if (!dateLabel) return;
  const formatted = new Intl.DateTimeFormat("es-DO", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date());
  dateLabel.textContent = formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function viewFromHash() {
  const hash = location.hash.replace("#", "");
  return (
    Object.keys(VIEW_HASHES).find((view) => VIEW_HASHES[view] === hash) ||
    "dashboard"
  );
}

function switchView(view, addHistory, moveFocus) {
  const nextView = VIEW_HASHES[view] ? view : "dashboard";
  if (activeDrawer) closeDrawer(true, false);
  const viewLabel = document.querySelector("#currentViewLabel");
  if (viewLabel) viewLabel.textContent = VIEW_TITLES[nextView];
  document.querySelectorAll("[data-view]").forEach((section) => {
    section.classList.toggle("active", section.dataset.view === nextView);
  });
  document.querySelectorAll(".nav-item").forEach((button) => {
    const active = button.dataset.viewTarget === nextView;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (nextView === "reports") renderReports();
  if (addHistory && location.hash !== "#" + VIEW_HASHES[nextView]) {
    history.pushState({ view: nextView }, "", "#" + VIEW_HASHES[nextView]);
  }
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  if (moveFocus !== false) {
    const heading = document.querySelector('[data-view="' + nextView + '"] h1');
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  }
}

function renderMonthlyChart(sales) {
  const year = String(new Date().getFullYear());
  const labels = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
  ];
  const counts = Array(12).fill(0);
  sales.forEach((sale) => {
    if (yearOf(sale.saleDate) !== year) return;
    const month = Number(String(sale.saleDate).slice(5, 7)) - 1;
    if (month >= 0 && month < 12) counts[month] += 1;
  });
  const maximum = Math.max(...counts, 1);
  document.querySelector("#trendYear").textContent = year;
  document.querySelector("#monthlyChart").innerHTML = counts
    .map((count, index) => {
      const height = count ? Math.max(Math.round((count / maximum) * 100), 12) : 0;
      return (
        '<div class="month-column" title="' +
        escapeHtml(
          labels[index] +
            ": " +
            count +
            (count === 1 ? " venta" : " ventas")
        ) +
        '"><strong>' +
        count +
        '</strong><div class="month-bar-track"><span class="month-bar" style="height:' +
        height +
        '%"></span></div><small>' +
        labels[index] +
        "</small></div>"
      );
    })
    .join("");
}

function renderCollectionAlerts(activeSales) {
  const alerts = [];
  activeSales.forEach((sale) => {
    if (pendingForSaleCents(sale) <= 0) return;
    const dueDate = nextCommissionDueDate(sale);
    if (!dueDate) {
      alerts.push({
        sale,
        remaining: 9998,
        critical: false,
        text: "Sin fecha de cobro: completa la programación"
      });
      return;
    }
    const remaining = daysBetween(today(), dueDate);
    if (remaining >= 0) return;
    alerts.push({
      sale,
      remaining,
      critical: remaining < 0,
      text:
        remaining < 0
          ? Math.abs(remaining) + " días de atraso"
          : remaining === 0
            ? "Vence hoy"
            : "Vence en " + remaining + " días"
    });
  });
  state.sales
    .filter((sale) => isCancelledSale(sale) && activePaymentsForSale(sale.id).length)
    .forEach((sale) => {
      alerts.push({
        sale,
        remaining: -9999,
        critical: true,
        text: "Cancelada con cobros: requiere revisión"
      });
    });
  alerts.sort(
    (a, b) =>
      Number(b.critical) - Number(a.critical) ||
      a.remaining - b.remaining
  );
  const visible = alerts.slice(0, 6);
  document.querySelector("#collectionAlerts").innerHTML = visible
    .map(
      (alert) =>
        '<button type="button" data-view-sale="' +
        escapeHtml(alert.sale.id) +
        '" class="collection-alert' +
        (alert.critical ? " collection-alert-overdue" : "") +
        '"><div><strong>' +
        escapeHtml(clientName(alert.sale.clientId)) +
        "</strong><small>" +
        escapeHtml(alert.sale.project + " · " + alert.text) +
        "</small></div><span>" +
        escapeHtml(
          moneyFromCents(
            pendingForSaleCents(alert.sale),
            alert.sale.commissionCurrency
          )
        ) +
        "</span></button>"
    )
    .join("");
  document.querySelector("#collectionAlertsEmpty").hidden = visible.length !== 0;
}

function renderDashboard() {
  const year = String(new Date().getFullYear());
  const activeSales = state.sales.filter((sale) => !isCancelledSale(sale));
  const closedSales = activeSales.filter(isClosedSale);
  const yearSales = closedSales.filter((sale) => yearOf(sale.saleDate) === year);
  const volume = aggregate(activeSales, "salePrice", "saleCurrency");
  const yearVolume = aggregate(yearSales, "salePrice", "saleCurrency");
  const received = aggregate(
    state.payments.filter(
      (payment) => {
        const sale = saleById(payment.saleId);
        return (
          isActivePayment(payment) &&
          payment.paymentDate <= today() &&
          sale &&
          isClosedSale(sale)
        );
      }
    ),
    "amount",
    "currency"
  );
  const pending = activeSales.reduce((totals, sale) => {
    totals[sale.commissionCurrency] += pendingForSaleCents(sale);
    return totals;
  }, emptyMoneyTotals());
  const overdue = closedSales.filter(isCommissionOverdue);
  const commissionTotals = aggregate(
    closedSales,
    "commissionAmount",
    "commissionCurrency"
  );
  const collectionRatios = VALID_CURRENCIES
    .filter((currency) => commissionTotals[currency] > 0)
    .map((currency) =>
      Math.min(received[currency] / commissionTotals[currency], 1)
    );
  const collectionProgress = collectionRatios.length
    ? Math.round(
        (collectionRatios.reduce((total, ratio) => total + ratio, 0) /
          collectionRatios.length) *
          100
      )
    : 0;
  const dueSoon = closedSales.filter((sale) => {
    const dueDate = nextCommissionDueDate(sale);
    if (!dueDate || pendingForSaleCents(sale) <= 0) return false;
    const days = daysBetween(today(), dueDate);
    return days >= 0 && days <= 7;
  });
  const undated = closedSales.filter(
    (sale) => !nextCommissionDueDate(sale) && pendingForSaleCents(sale) > 0
  );

  document.querySelector("#heroPending").textContent = moneyFromCents(
    pending.USD,
    "USD"
  );
  document.querySelector("#heroPendingDop").textContent =
    moneyFromCents(pending.DOP, "DOP") + " adicionales";
  document.querySelector("#heroProgressBar").style.width =
    collectionProgress + "%";
  document.querySelector("#heroProgressMeta").textContent =
    collectionProgress + "% de comisión cobrada";
  document.querySelector("#dailyBriefText").textContent = overdue.length
    ? "Tienes " +
      overdue.length +
      (overdue.length === 1
        ? " comisión vencida que necesita seguimiento hoy."
        : " comisiones vencidas que necesitan seguimiento hoy.")
    : undated.length
      ? "Hay " +
        undated.length +
        (undated.length === 1
          ? " comisión sin fecha de cobro. Conviene programarla hoy."
          : " comisiones sin fecha de cobro. Conviene programarlas hoy.")
    : dueSoon.length
      ? "La cartera está al día. Hay " +
        dueSoon.length +
        (dueSoon.length === 1
          ? " cobro previsto para los próximos 7 días."
          : " cobros previstos para los próximos 7 días.")
      : "La cartera está al día y no hay cobros urgentes para esta semana.";

  document.querySelector("#metricSalesCount").textContent = activeSales.length;
  document.querySelector("#metricSalesVolume").textContent = pairMoney(volume);
  document.querySelector("#metricYearSales").textContent = yearSales.length;
  document.querySelector("#metricYearVolume").textContent = pairMoney(yearVolume);
  document.querySelector("#metricReceived").textContent = moneyFromCents(
    received.USD,
    "USD"
  );
  document.querySelector("#metricReceivedDop").textContent = moneyFromCents(
    received.DOP,
    "DOP"
  );
  document.querySelector("#metricPending").textContent = moneyFromCents(
    pending.USD,
    "USD"
  );
  document.querySelector("#metricPendingDop").textContent =
    moneyFromCents(pending.DOP, "DOP") + " por cobrar";
  document.querySelector("#metricOverdue").textContent =
    overdue.length + (overdue.length === 1 ? " vencida" : " vencidas");

  const recent = [...state.sales]
    .sort((a, b) => String(b.saleDate).localeCompare(String(a.saleDate)))
    .slice(0, 5);
  document.querySelector("#recentSalesBody").innerHTML = recent
    .map(
      (sale) =>
        '<tr class="record-row ' +
        (isCancelledSale(sale) ? "muted-row" : "") +
        '" data-view-sale="' +
        escapeHtml(sale.id) +
        '" tabindex="0" aria-label="Abrir dossier de ' +
        escapeHtml(saleLabel(sale)) +
        '"><td><span class="primary-cell">' +
        escapeHtml(clientName(sale.clientId)) +
        '</span><span class="secondary-cell">' +
        escapeHtml(sale.project) +
        " · " +
        escapeHtml(sale.unit) +
        " · " +
        escapeHtml(formatDate(sale.saleDate)) +
        "</span></td><td>" +
        escapeHtml(money(sale.commissionAmount, sale.commissionCurrency)) +
        "</td><td>" +
        statusBadge(sale) +
        "</td></tr>"
    )
    .join("");
  document.querySelector("#recentSalesEmpty").hidden = recent.length !== 0;

  const pendingSales = activeSales
    .filter((sale) => {
      const dueDate = nextCommissionDueDate(sale);
      if (pendingForSaleCents(sale) <= 0 || !dueDate) return false;
      return daysBetween(today(), dueDate) >= 0;
    })
    .sort((a, b) =>
      String(nextCommissionDueDate(a) || "9999").localeCompare(
        String(nextCommissionDueDate(b) || "9999")
      )
    )
    .slice(0, 6);
  document.querySelector("#pendingList").innerHTML = pendingSales
    .map(
      (sale) =>
        '<button type="button" data-view-sale="' +
        escapeHtml(sale.id) +
        '" class="pending-item' +
        (isCommissionOverdue(sale) ? " pending-item-overdue" : "") +
        '"><div><strong>' +
        escapeHtml(clientName(sale.clientId)) +
        "</strong><small>" +
        escapeHtml(sale.project + " · " + sale.unit) +
        '</small><span class="pending-status">' +
        escapeHtml(
          (isClosedSale(sale)
            ? (isCommissionOverdue(sale) ? "Venció " : "Vence ") +
              formatDate(nextCommissionDueDate(sale))
            : "Programada " + formatDate(nextCommissionDueDate(sale)) +
              " · disponible al contratar")
        ) +
        '</span></div><span class="pending-amount">' +
        escapeHtml(
          moneyFromCents(pendingForSaleCents(sale), sale.commissionCurrency)
        ) +
        "</span></button>"
    )
    .join("");
  document.querySelector("#pendingEmpty").hidden = pendingSales.length !== 0;
  renderMonthlyChart(closedSales);
  renderCollectionAlerts(closedSales);
}

function initialsFor(value) {
  return String(value || "AF")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "AF";
}

function detailField(label, value) {
  return (
    '<div><dt>' +
    escapeHtml(label) +
    '</dt><dd>' +
    escapeHtml(value || "Sin definir") +
    "</dd></div>"
  );
}

function clientDetailHtml(client) {
  const relatedSales = state.sales
    .filter((sale) => sale.clientId === client.id)
    .sort((a, b) => String(b.saleDate).localeCompare(String(a.saleDate)));
  const activeSales = relatedSales.filter((sale) => !isCancelledSale(sale));
  const contactActions = [];
  const phoneDigits = String(client.phone || "").replace(/\D/g, "");
  if (client.phone) {
    contactActions.push(
      '<a href="tel:' +
        escapeHtml(String(client.phone).replace(/[^+\d]/g, "")) +
        '"><i data-lucide="phone" aria-hidden="true"></i>Llamar</a>'
    );
  }
  if (phoneDigits) {
    contactActions.push(
      '<a href="https://wa.me/' +
        escapeHtml(phoneDigits) +
        '" target="_blank" rel="noopener"><i data-lucide="message-circle" aria-hidden="true"></i>WhatsApp</a>'
    );
  }
  if (client.email) {
    contactActions.push(
      '<a href="mailto:' +
        escapeHtml(client.email) +
        '"><i data-lucide="mail" aria-hidden="true"></i>Correo</a>'
    );
  }
  const relatedHtml = relatedSales.length
    ? relatedSales
        .map(
          (sale) =>
            '<button class="detail-related-record" type="button" data-view-sale="' +
            escapeHtml(sale.id) +
            '"><span><strong>' +
            escapeHtml(sale.project + " · " + sale.unit) +
            "</strong><small>" +
            escapeHtml(formatDate(sale.saleDate) + " · " + clientName(sale.clientId)) +
            "</small></span>" +
            statusBadge(sale) +
            '<i data-lucide="chevron-right" aria-hidden="true"></i></button>'
        )
        .join("")
    : '<div class="detail-empty">Todavía no hay operaciones vinculadas.</div>';
  return (
    '<section class="detail-identity"><span class="detail-avatar">' +
    escapeHtml(initialsFor(client.name)) +
    '</span><div><h3>' +
    escapeHtml(client.name) +
    '</h3><span class="stage-pill">' +
    escapeHtml(client.stage) +
    "</span></div></section>" +
    (contactActions.length
      ? '<nav class="detail-contact-actions" aria-label="Contactar cliente">' +
        contactActions.join("") +
        "</nav>"
      : "") +
    '<div class="detail-stat-grid"><article><span>Presupuesto</span><strong>' +
    escapeHtml(client.budget ? money(client.budget, client.budgetCurrency) : "Sin definir") +
    '</strong></article><article><span>Operaciones activas</span><strong>' +
    activeSales.length +
    "</strong></article></div>" +
    '<section class="detail-section"><div class="detail-section-heading"><i data-lucide="map-pin" aria-hidden="true"></i><h3>Perfil de interés</h3></div><dl class="detail-definition-grid">' +
    detailField("Zona", client.desiredZone) +
    detailField("Estado del inmueble", client.propertyStage || "Sin definir") +
    detailField("Origen", client.source) +
    detailField("Captado", formatDate(client.capturedAt)) +
    detailField("Última actualización", formatDate(client.updatedAt)) +
    "</dl></section>" +
    '<section class="detail-section"><div class="detail-section-heading"><i data-lucide="notebook-pen" aria-hidden="true"></i><h3>Notas</h3></div><p class="detail-note">' +
    escapeHtml(client.notes || "No hay notas registradas para este cliente.") +
    "</p></section>" +
    '<section class="detail-section"><div class="detail-section-heading"><i data-lucide="building-2" aria-hidden="true"></i><h3>Operaciones relacionadas</h3></div><div class="detail-related-list">' +
    relatedHtml +
    "</div></section>"
  );
}

function saleDetailHtml(sale) {
  const client = clientById(sale.clientId);
  const payments = paymentsForSale(sale.id).sort((a, b) =>
    String(b.paymentDate).localeCompare(String(a.paymentDate))
  );
  const paidCents = paidForSaleCents(sale.id);
  const totalCents = toCents(sale.commissionAmount);
  const pendingCents = pendingForSaleCents(sale);
  const progress = totalCents
    ? Math.min(Math.round((paidCents / totalCents) * 100), 100)
    : 0;
  const installmentRows = installmentLedgerForSale(sale.id);
  const installmentsHtml = installmentRows.length
    ? installmentRows
        .map((installment) => {
          const paid = installment.pendingCents === 0;
          const overdue = !paid && installment.dueDate < today();
          const status = paid ? "Pagada" : overdue ? "Vencida" : installment.paidCents ? "Parcial" : "Pendiente";
          return (
            '<div class="detail-payment"><span class="detail-payment-icon"><i data-lucide="' +
            (paid ? "check" : overdue ? "triangle-alert" : "calendar-clock") +
            '" aria-hidden="true"></i></span><div><strong>' +
            escapeHtml(installment.label) +
            '</strong><small>Vence ' +
            escapeHtml(formatDate(installment.dueDate)) +
            " · " +
            escapeHtml(status) +
            '</small></div><span>' +
            escapeHtml(moneyFromCents(installment.pendingCents, sale.commissionCurrency)) +
            "</span></div>"
          );
        })
        .join("")
    : '<div class="detail-empty">No hay cuotas programadas.</div>';
  const paymentsHtml = payments.length
    ? payments
        .map(
          (payment) =>
            '<div class="detail-payment' +
            (isActivePayment(payment) ? "" : " detail-payment-void") +
            '"><span class="detail-payment-icon"><i data-lucide="' +
            (isActivePayment(payment) ? "check" : "ban") +
            '" aria-hidden="true"></i></span><div><strong>' +
            escapeHtml(money(payment.amount, payment.currency)) +
            "</strong><small>" +
            escapeHtml(
              formatDate(payment.paymentDate) +
                " · " +
                (isActivePayment(payment) ? payment.method : "Anulado")
            ) +
            "</small></div><span>" +
            escapeHtml(payment.reference || "Sin referencia") +
            "</span></div>"
        )
        .join("")
    : '<div class="detail-empty">Todavía no hay cobros registrados.</div>';
  return (
    '<section class="deal-dossier"><div><span class="eyebrow">' +
    escapeHtml(sale.saleStatus) +
    '</span><h3>' +
    escapeHtml(sale.project) +
    '</h3><p>Unidad ' +
    escapeHtml(sale.unit) +
    " · " +
    escapeHtml(formatDate(sale.saleDate)) +
    "</p></div><strong>" +
    escapeHtml(money(sale.salePrice, sale.saleCurrency)) +
    "</strong></section>" +
    '<section class="detail-commission"><div class="detail-commission-heading"><div><span>Comisión cobrada</span><strong>' +
    escapeHtml(moneyFromCents(paidCents, sale.commissionCurrency)) +
    '</strong></div><span>' +
    progress +
    '%</span></div><div class="detail-progress"><span style="width:' +
    progress +
    '%"></span></div><div class="detail-commission-meta"><span>Total ' +
    escapeHtml(money(sale.commissionAmount, sale.commissionCurrency)) +
    '</span><strong>Pendiente ' +
    escapeHtml(moneyFromCents(pendingCents, sale.commissionCurrency)) +
    "</strong></div></section>" +
    '<section class="detail-section"><div class="detail-section-heading"><i data-lucide="contact-round" aria-hidden="true"></i><h3>Cliente y operación</h3></div><dl class="detail-definition-grid">' +
    detailField("Cliente", client?.name || "Cliente eliminado") +
    detailField("Desarrolladora", sale.developer) +
    detailField(
      "Fecha estimada de entrega",
      sale.deliveryDate ? formatDate(sale.deliveryDate) : "Sin definir"
    ) +
    detailField(
      "Venta compartida",
      sale.sharedSale ? sale.externalAgent || "Asesor externo" : "No"
    ) +
    detailField("Próximo vencimiento", formatDate(nextCommissionDueDate(sale))) +
    detailField("Tasa acordada", sale.commissionRate ? sale.commissionRate + "%" : "Monto fijo") +
    "</dl></section>" +
    '<section class="detail-section"><div class="detail-section-heading"><i data-lucide="calendar-range" aria-hidden="true"></i><h3>Plan de cobro</h3></div><div class="detail-payments">' +
    installmentsHtml +
    "</div></section>" +
    '<section class="detail-section"><div class="detail-section-heading"><i data-lucide="receipt-text" aria-hidden="true"></i><h3>Historial de cobros</h3></div><div class="detail-payments">' +
    paymentsHtml +
    "</div></section>" +
    '<section class="detail-section"><div class="detail-section-heading"><i data-lucide="notebook-pen" aria-hidden="true"></i><h3>Notas de la operación</h3></div><p class="detail-note">' +
    escapeHtml(
      isCancelledSale(sale)
        ? "Motivo de cancelación: " + sale.cancelReason + (sale.notes ? " · " + sale.notes : "")
        : sale.notes || "No hay notas registradas para esta operación."
    ) +
    "</p></section>"
  );
}

function renderRecordDetail() {
  if (!detailRecord) return;
  const title = document.querySelector("#recordDetailTitle");
  const eyebrow = document.querySelector("#recordDetailEyebrow");
  const body = document.querySelector("#recordDetailBody");
  const primary = document.querySelector("#detailPrimaryButton");
  const remove = document.querySelector("#detailDeleteButton");
  remove.hidden = false;
  remove.removeAttribute("data-delete-client");
  remove.removeAttribute("data-delete-sale");
  if (detailRecord.type === "client") {
    const client = clientById(detailRecord.id);
    if (!client) return closeDrawer();
    eyebrow.textContent = "Expediente de cliente";
    title.textContent = client.name;
    body.innerHTML = clientDetailHtml(client);
    primary.hidden = false;
    primary.innerHTML = '<i data-lucide="badge-plus" aria-hidden="true"></i>Nueva venta';
    remove.dataset.deleteClient = client.id;
    remove.textContent = "Eliminar cliente";
  } else {
    const sale = saleById(detailRecord.id);
    if (!sale) return closeDrawer();
    eyebrow.textContent = "Dossier de operación";
    title.textContent = sale.project + " · " + sale.unit;
    body.innerHTML = saleDetailHtml(sale);
    primary.hidden =
      isCancelledSale(sale) ||
      !isClosedSale(sale) ||
      pendingForSaleCents(sale) <= 0;
    primary.innerHTML = '<i data-lucide="circle-dollar-sign" aria-hidden="true"></i>Registrar cobro';
    remove.hidden = !DEMO_MODE;
    if (DEMO_MODE) {
      remove.dataset.deleteSale = sale.id;
      remove.textContent = "Eliminar operación";
    }
  }
  body.scrollTop = 0;
  refreshIcons();
}

function openRecordDetail(type, id, trigger) {
  detailRecord = { type, id };
  renderRecordDetail();
  openDrawer("recordDetailDrawer", trigger);
}

function clientActionsHtml(client) {
  return (
    '<div class="row-actions"><button class="icon-action record-open-action" type="button" data-view-client="' +
    escapeHtml(client.id) +
    '" aria-label="Abrir expediente de ' +
    escapeHtml(client.name) +
    '"><span>Ver ficha</span><i data-lucide="arrow-up-right" aria-hidden="true"></i></button></div>'
  );
}

function renderClients() {
  const query = normalizeText(document.querySelector("#clientSearch").value);
  const stage = document.querySelector("#clientStageFilter").value;
  const clients = state.clients
    .filter((client) => {
      const relatedOperations = state.sales
        .filter((sale) => sale.clientId === client.id)
        .flatMap((sale) => [sale.project, sale.unit, sale.developer, sale.externalAgent]);
      return (
        (!stage || client.stage === stage) &&
        (!query ||
          normalizeText(
            [
              client.name,
              client.phone,
              client.email,
              client.source,
              client.stage,
              client.desiredZone,
              client.propertyStage,
              ...relatedOperations
            ].join(" ")
          ).includes(query))
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const filtersActive = query || stage;
  document.querySelector("#clientOverviewTotal").textContent = state.clients.length;
  document.querySelector("#clientOverviewNew").textContent = state.clients.filter(
    (client) => String(client.capturedAt || "").startsWith(today().slice(0, 7))
  ).length;
  document.querySelector("#clientOverviewFollowUp").textContent = state.clients.filter(
    (client) => client.stage === "En seguimiento" || client.stage === "Calificado"
  ).length;
  document.querySelector("#clientOverviewBuyers").textContent = state.clients.filter(
    (client) => client.stage === "Comprador"
  ).length;
  document.querySelector("#clientsCount").textContent = filtersActive
    ? clients.length + " / " + state.clients.length
    : state.clients.length;
  document.querySelector("#clientsBody").innerHTML = clients
    .map((client) => {
      const salesCount = state.sales.filter(
        (sale) => sale.clientId === client.id
      ).length;
      const budget = client.budget
        ? money(client.budget, client.budgetCurrency)
        : "Sin definir";
      return (
        '<tr class="record-row" data-view-client="' +
        escapeHtml(client.id) +
        '" tabindex="0" aria-label="Abrir expediente de ' +
        escapeHtml(client.name) +
        '"><td><span class="primary-cell">' +
        escapeHtml(client.name) +
        '</span><span class="secondary-cell">' +
        escapeHtml(
          "Captado " +
            formatDate(client.capturedAt) +
            " · " +
            salesCount +
            (salesCount === 1 ? " venta" : " ventas")
        ) +
        '</span></td><td><span class="primary-cell">' +
        escapeHtml(client.phone || "Sin teléfono") +
        '</span><span class="secondary-cell">' +
        escapeHtml(client.email || "Sin correo") +
        '</span></td><td><span class="primary-cell">' +
        escapeHtml(
          (client.desiredZone || "Sin zona definida") +
            (client.propertyStage && client.propertyStage !== "Sin definir"
              ? " · " + client.propertyStage
              : "")
        ) +
        '</span><span class="secondary-cell">' +
        escapeHtml("Origen: " + client.source) +
        '</span></td><td class="money-cell">' +
        escapeHtml(budget) +
        '</td><td><span class="stage-pill">' +
        escapeHtml(client.stage) +
        "</span></td><td>" +
        clientActionsHtml(client) +
        "</td></tr>"
      );
    })
    .join("");
  document.querySelector("#clientsMobileList").innerHTML = clients
    .map((client) => {
      const budget = client.budget
        ? money(client.budget, client.budgetCurrency)
        : "Sin presupuesto";
      return (
        '<article class="mobile-record-card record-row" data-view-client="' +
        escapeHtml(client.id) +
        '" tabindex="0" role="button" aria-label="Abrir expediente de ' +
        escapeHtml(client.name) +
        '"><div class="mobile-record-head"><strong>' +
        escapeHtml(client.name) +
        '</strong><span class="stage-pill">' +
        escapeHtml(client.stage) +
        '</span></div><div class="mobile-record-main">' +
        escapeHtml(
          (client.desiredZone || "Interés por definir") +
            (client.propertyStage && client.propertyStage !== "Sin definir"
              ? " · " + client.propertyStage
              : "")
        ) +
        '</div><div class="mobile-record-meta"><span>' +
        escapeHtml(client.phone || client.email || "Sin contacto") +
        '</span><span class="mobile-record-amount">' +
        escapeHtml(budget) +
        '</span></div><div class="mobile-record-open"><span>Ver expediente</span><i data-lucide="arrow-right" aria-hidden="true"></i></div></article>'
      );
    })
    .join("");
  document.querySelector("#clientsEmpty").hidden = clients.length !== 0;
  refreshIcons();
}

function filteredSalesForList() {
  const query = normalizeText(document.querySelector("#saleSearch").value);
  const status = document.querySelector("#saleStatusFilter").value;
  return state.sales
    .filter(
      (sale) =>
        (!status || sale.saleStatus === status) &&
        (!query ||
          normalizeText(
            [
              clientName(sale.clientId),
              sale.project,
              sale.unit,
              sale.developer,
              sale.saleStatus,
              sale.externalAgent,
              sale.deliveryDate
            ].join(" ")
          ).includes(query))
    )
    .sort((a, b) => String(b.saleDate).localeCompare(String(a.saleDate)));
}

function saleActionsHtml(sale) {
  return (
    '<div class="row-actions"><button class="icon-action record-open-action" type="button" data-view-sale="' +
    escapeHtml(sale.id) +
    '" aria-label="Abrir dossier de ' +
    escapeHtml(saleLabel(sale)) +
    '"><span>Ver dossier</span><i data-lucide="arrow-up-right" aria-hidden="true"></i></button></div>'
  );
}

function renderSales() {
  const sales = filteredSalesForList();
  const filtersActive =
    document.querySelector("#saleSearch").value ||
    document.querySelector("#saleStatusFilter").value;
  document.querySelector("#salesCount").textContent = filtersActive
    ? sales.length + " / " + state.sales.length
    : state.sales.length;
  document.querySelector("#saleOverviewReserved").textContent = state.sales.filter(
    (sale) => sale.saleStatus === "Reservada"
  ).length;
  document.querySelector("#saleOverviewContracted").textContent = state.sales.filter(
    (sale) => sale.saleStatus === "Contratada"
  ).length;
  document.querySelector("#saleOverviewDelivered").textContent = state.sales.filter(
    (sale) => sale.saleStatus === "Entregada"
  ).length;
  document.querySelector("#salesBody").innerHTML = sales
    .map((sale) => {
      const totalCents = toCents(sale.commissionAmount);
      const progress = totalCents
        ? Math.min(Math.round((paidForSaleCents(sale.id) / totalCents) * 100), 100)
        : 0;
      return (
        '<tr class="record-row ' +
        (isCancelledSale(sale) ? "muted-row" : "") +
        '" data-view-sale="' +
        escapeHtml(sale.id) +
        '" tabindex="0" aria-label="Abrir dossier de ' +
        escapeHtml(saleLabel(sale)) +
        '"><td><span class="primary-cell">' +
        escapeHtml(clientName(sale.clientId)) +
        '</span><span class="secondary-cell">' +
        escapeHtml(formatDate(sale.saleDate)) +
        '</span></td><td><span class="primary-cell">' +
        escapeHtml(sale.project) +
        '</span><span class="secondary-cell">' +
        escapeHtml(sale.unit + (sale.developer ? " · " + sale.developer : "")) +
        '</span></td><td class="money-cell">' +
        escapeHtml(money(sale.salePrice, sale.saleCurrency)) +
        "</td><td>" +
        saleStatusBadge(sale) +
        '</td><td><span class="primary-cell money-cell">' +
        escapeHtml(money(sale.commissionAmount, sale.commissionCurrency)) +
        '</span><span class="commission-progress" aria-hidden="true"><span style="width:' +
        progress +
        '%"></span></span><span class="secondary-cell">Cobrado ' +
        escapeHtml(money(paidForSale(sale.id), sale.commissionCurrency)) +
        " · " +
        progress +
        "%</span>" +
        "</td><td>" +
        saleActionsHtml(sale) +
        "</td></tr>"
      );
    })
    .join("");
  document.querySelector("#salesMobileList").innerHTML = sales
    .map(
      (sale) =>
        '<article class="mobile-record-card record-row' +
        (isCancelledSale(sale) ? " muted-row" : "") +
        '" data-view-sale="' +
        escapeHtml(sale.id) +
        '" tabindex="0" role="button" aria-label="Abrir dossier de ' +
        escapeHtml(saleLabel(sale)) +
        '"><div class="mobile-record-head"><strong>' +
        escapeHtml(clientName(sale.clientId)) +
        "</strong>" +
        saleStatusBadge(sale) +
        '</div><div class="mobile-record-main">' +
        escapeHtml(
          sale.project +
            " · " +
            sale.unit +
            (sale.sharedSale && sale.externalAgent
              ? " · Compartida con " + sale.externalAgent
              : "")
        ) +
        '</div><div class="mobile-record-meta"><span>' +
        escapeHtml(
          nextCommissionDueDate(sale)
            ? (isClosedSale(sale) ? "Vence " : "Programada ") +
              formatDate(nextCommissionDueDate(sale))
            : formatDate(sale.saleDate)
        ) +
        '</span><span class="mobile-record-amount">' +
        escapeHtml(money(sale.salePrice, sale.saleCurrency)) +
        '</span></div><div class="mobile-record-meta"><span>Comisión ' +
        escapeHtml(money(sale.commissionAmount, sale.commissionCurrency)) +
        "</span>" +
        statusBadge(sale) +
        '</div><div class="mobile-record-open"><span>Ver dossier</span><i data-lucide="arrow-right" aria-hidden="true"></i></div></article>'
    )
    .join("");
  document.querySelector("#salesEmpty").hidden = sales.length !== 0;
  refreshIcons();
}

function collectionActionHtml(sale) {
  if (pendingForSaleCents(sale) <= 0) {
    return '<span class="status-pill status-paid">Pagado</span>';
  }
  if (!isClosedSale(sale)) {
    return '<span class="status-pill status-pending">Disponible al contratar</span>';
  }
  return (
    '<button class="button button-secondary" type="button" data-register-payment="' +
    escapeHtml(sale.id) +
    '">Registrar pago</button>'
  );
}

function setCollectionMetric(valueId, metaId, totals, count, singular, plural) {
  const primaryCurrency = totals.USD !== 0 || totals.DOP === 0 ? "USD" : "DOP";
  const secondaryCurrency = primaryCurrency === "USD" ? "DOP" : "USD";
  document.querySelector("#" + valueId).textContent = moneyFromCents(
    totals[primaryCurrency],
    primaryCurrency
  );
  const secondary = totals[secondaryCurrency]
    ? moneyFromCents(totals[secondaryCurrency], secondaryCurrency) + " · "
    : "";
  document.querySelector("#" + metaId).textContent =
    secondary + count + " " + (count === 1 ? singular : plural);
}

function renderCollectionQueue() {
  const currentMonth = today().slice(0, 7);
  const activeSales = state.sales.filter((sale) => !isCancelledSale(sale));
  const collectionItems = activeSales.flatMap((sale) =>
    installmentLedgerForSale(sale.id).map((installment) => ({ ...installment, sale }))
  );
  const pendingSales = collectionItems.filter((item) => item.pendingCents > 0);
  const overdueSales = pendingSales.filter(
    (item) => isClosedSale(item.sale) && Boolean(item.dueDate) && item.dueDate < today()
  );
  const nextSales = pendingSales.filter((item) => {
    if (!isClosedSale(item.sale)) return false;
    const remaining = item.dueDate ? daysBetween(today(), item.dueDate) : 9999;
    return remaining >= 0 && remaining <= 7;
  });
  const upcomingSales = pendingSales.filter((item) => {
    if (!item.dueDate) return false;
    return daysBetween(today(), item.dueDate) >= 0;
  });
  const undatedSales = pendingSales.filter((item) => !item.dueDate);
  const paidSales = collectionItems.filter((item) => item.pendingCents === 0);
  const monthPayments = state.payments.filter(
    (payment) => {
      const sale = saleById(payment.saleId);
      return (
        isActivePayment(payment) &&
        sale &&
        !isCancelledSale(sale) &&
        String(payment.paymentDate || "").startsWith(currentMonth)
      );
    }
  );
  const sumPending = (items) =>
    items.reduce((totals, item) => {
      totals[item.sale.commissionCurrency] += item.pendingCents;
      return totals;
    }, emptyMoneyTotals());

  setCollectionMetric(
    "collectionOverdueValue", "collectionOverdueMeta", sumPending(overdueSales),
    overdueSales.length, "cuota", "cuotas"
  );
  setCollectionMetric(
    "collectionNextValue", "collectionNextMeta", sumPending(nextSales),
    nextSales.length, "cuota", "cuotas"
  );
  setCollectionMetric(
    "collectionPendingValue", "collectionPendingMeta", sumPending(pendingSales),
    pendingSales.length, "cuota", "cuotas"
  );
  setCollectionMetric(
    "collectionReceivedValue", "collectionReceivedMeta",
    aggregate(monthPayments, "amount", "currency"),
    monthPayments.length, "pago", "pagos"
  );

  const queues = {
    all: pendingSales,
    overdue: overdueSales,
    upcoming: upcomingSales,
    undated: undatedSales,
    paid: paidSales
  };
  const queue = [...(queues[collectionFilter] || pendingSales)].sort(
    (a, b) =>
      String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999")) ||
      b.pendingCents - a.pendingCents
  );

  const filterCounts = {
    all: pendingSales.length,
    overdue: overdueSales.length,
    upcoming: upcomingSales.length,
    undated: undatedSales.length,
    paid: paidSales.length
  };
  Object.entries(filterCounts).forEach(([key, count]) => {
    const target = document.querySelector(
      "#collectionCount" + key.charAt(0).toUpperCase() + key.slice(1)
    );
    if (target) target.textContent = count;
  });

  document.querySelectorAll("[data-collection-filter]").forEach((button) => {
    const active = button.dataset.collectionFilter === collectionFilter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  const timingForSale = (item) => {
    if (item.pendingCents === 0) return "Cuota completada";
    if (!item.dueDate) return "Sin fecha definida";
    if (!isClosedSale(item.sale)) return "Programada para " + formatDate(item.dueDate);
    const remaining = daysBetween(today(), item.dueDate);
    if (remaining < 0) return Math.abs(remaining) + " días vencido";
    if (remaining === 0) return "Vence hoy";
    return "Vence en " + remaining + " días";
  };
  const rowClassForSale = (item) =>
    item.pendingCents === 0
      ? "collection-row-paid"
      : isClosedSale(item.sale) && item.dueDate && item.dueDate < today()
        ? "collection-row-overdue"
        : "collection-row-upcoming";
  const installmentStatusBadge = (item) => {
    if (item.pendingCents === 0) return '<span class="status-pill status-paid">Pagada</span>';
    if (!isClosedSale(item.sale)) {
      return '<span class="status-pill status-pending">Programada</span>';
    }
    if (item.dueDate && item.dueDate < today()) {
      return '<span class="status-pill status-overdue">Vencida</span>';
    }
    if (item.paidCents > 0) return '<span class="status-pill status-partial">Parcial</span>';
    return '<span class="status-pill status-pending">Pendiente</span>';
  };

  document.querySelector("#collectionQueueBody").innerHTML = queue
    .map(
      (item) =>
        '<tr class="record-row ' +
        rowClassForSale(item) +
        '" data-view-sale="' +
        escapeHtml(item.sale.id) +
        '" tabindex="0" aria-label="Abrir dossier de ' +
        escapeHtml(saleLabel(item.sale)) +
        '"><td><span class="primary-cell">' +
        escapeHtml(clientName(item.sale.clientId)) +
        '</span><span class="secondary-cell">' +
        escapeHtml(item.sale.project + " · " + item.sale.unit + " · " + item.label) +
        "</span></td><td>" +
        escapeHtml(item.dueDate ? formatDate(item.dueDate) : "Sin fecha") +
        '<span class="secondary-cell">' +
        escapeHtml(timingForSale(item)) +
        '</span></td><td class="money-cell">' +
        escapeHtml(moneyFromCents(item.pendingCents, item.sale.commissionCurrency)) +
        "</td><td>" +
        installmentStatusBadge(item) +
        "</td><td>" +
        collectionActionHtml(item.sale) +
        "</td></tr>"
    )
    .join("");
  document.querySelector("#collectionQueueMobile").innerHTML = queue
    .map((item) => {
      const mobileClass =
        item.pendingCents === 0
          ? " mobile-record-paid"
          : isClosedSale(item.sale) && item.dueDate && item.dueDate < today()
            ? " mobile-record-overdue"
            : " mobile-record-upcoming";
      return (
        '<article class="mobile-record-card' +
        mobileClass +
        '"><div class="mobile-record-head"><strong>' +
        escapeHtml(clientName(item.sale.clientId)) +
        "</strong>" +
        installmentStatusBadge(item) +
        '</div><div class="mobile-record-main">' +
        escapeHtml(item.sale.project + " · " + item.sale.unit + " · " + item.label) +
        '</div><div class="mobile-record-meta"><span>' +
        escapeHtml(timingForSale(item)) +
        '</span><span class="mobile-record-amount">' +
        escapeHtml(moneyFromCents(item.pendingCents, item.sale.commissionCurrency)) +
        '</span></div><div class="mobile-record-actions"><button class="icon-action" type="button" data-view-sale="' +
        escapeHtml(item.sale.id) +
        '"><i data-lucide="folder-open" aria-hidden="true"></i>Ver dossier</button>' +
        collectionActionHtml(item.sale) +
        "</div></article>"
      );
    })
    .join("");
  document.querySelector("#collectionQueueEmpty").hidden = queue.length !== 0;
  document.querySelector("#collectionQueueEmpty").textContent =
    collectionFilter === "overdue"
      ? "No hay cobros vencidos. La cartera está al día."
      : collectionFilter === "undated"
        ? "Todas las comisiones pendientes tienen fecha."
        : "No hay operaciones en esta vista.";
  refreshIcons();
}

function filteredPaymentsForList() {
  const query = normalizeText(document.querySelector("#paymentSearch").value);
  return state.payments
    .filter((payment) => {
      if (!query) return true;
      const sale = saleById(payment.saleId);
      return normalizeText(
        [
          clientName(sale?.clientId),
          saleLabel(sale),
          payment.method,
          payment.reference,
          payment.notes,
          payment.status
        ].join(" ")
      ).includes(query);
    })
    .sort((a, b) => String(b.paymentDate).localeCompare(String(a.paymentDate)));
}

function paymentActionsHtml(payment, sale) {
  if (!isActivePayment(payment)) {
    return '<span class="status-pill status-void">Anulado</span>';
  }
  const editAction = DEMO_MODE
    ? '<button type="button" data-edit-payment="' +
      escapeHtml(payment.id) +
      '" aria-label="Editar cobro ' +
      escapeHtml(payment.reference || saleLabel(sale)) +
      '"><i data-lucide="pencil" aria-hidden="true"></i>Editar cobro</button>'
    : "";
  return (
    '<details class="row-more-menu"><summary class="icon-action" aria-label="Más acciones para este cobro"><i data-lucide="ellipsis" aria-hidden="true"></i></summary><div>' +
    editAction +
    '<button class="danger-action" type="button" data-void-payment="' +
    escapeHtml(payment.id) +
    '" aria-label="Anular cobro ' +
    escapeHtml(payment.reference || saleLabel(sale)) +
    '"><i data-lucide="ban" aria-hidden="true"></i>Anular cobro</button></div></details>'
  );
}

function renderPayments() {
  const payments = filteredPaymentsForList();
  const searching = document.querySelector("#paymentSearch").value;
  document.querySelector("#paymentsCount").textContent = searching
    ? payments.length + " / " + state.payments.length
    : state.payments.length;
  document.querySelector("#paymentsBody").innerHTML = payments
    .map((payment) => {
      const sale = saleById(payment.saleId);
      const voided = !isActivePayment(payment);
      return (
        '<tr class="' +
        (voided ? "muted-row" : "") +
        '"><td>' +
        escapeHtml(formatDate(payment.paymentDate)) +
        '</td><td><span class="primary-cell">' +
        escapeHtml(clientName(sale?.clientId)) +
        '</span><span class="secondary-cell">' +
        escapeHtml(saleLabel(sale)) +
        '</span></td><td class="money-cell">' +
        escapeHtml(money(payment.amount, payment.currency)) +
        '</td><td><span class="primary-cell">' +
        escapeHtml(voided ? "Anulado" : payment.method) +
        '</span><span class="secondary-cell">' +
        escapeHtml(
          voided
            ? payment.voidReason || "Sin motivo"
            : payment.reference || "Sin referencia"
        ) +
        '</span></td><td>' +
        paymentActionsHtml(payment, sale) +
        "</td></tr>"
      );
    })
    .join("");
  document.querySelector("#paymentsMobileList").innerHTML = payments
    .map((payment) => {
      const sale = saleById(payment.saleId);
      const voided = !isActivePayment(payment);
      return (
        '<article class="mobile-record-card' +
        (voided ? " muted-row" : "") +
        '"><div class="mobile-record-head"><strong>' +
        escapeHtml(clientName(sale?.clientId)) +
        "</strong>" +
        (voided
          ? '<span class="status-pill status-void">Anulado</span>'
          : '<span class="status-pill status-paid">Recibido</span>') +
        '</div><div class="mobile-record-main">' +
        escapeHtml(saleLabel(sale)) +
        '</div><div class="mobile-record-meta"><span>' +
        escapeHtml(formatDate(payment.paymentDate) + " · " + payment.method) +
        '</span><span class="mobile-record-amount">' +
        escapeHtml(money(payment.amount, payment.currency)) +
        '</span></div><div class="mobile-record-actions">' +
        paymentActionsHtml(payment, sale) +
        "</div></article>"
      );
    })
    .join("");
  document.querySelector("#paymentsEmpty").hidden = payments.length !== 0;
}

function populateClientSelect() {
  const select = document.querySelector("#saleClientId");
  const previous = select.value;
  select.innerHTML =
    '<option value="">Selecciona un cliente</option>' +
    [...state.clients]
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map(
        (client) =>
          '<option value="' +
          escapeHtml(client.id) +
          '">' +
          escapeHtml(client.name) +
          "</option>"
      )
      .join("");
  if (state.clients.some((client) => client.id === previous)) {
    select.value = previous;
  }
}

function populatePaymentSelect() {
  const select = document.querySelector("#paymentSaleId");
  const previous = select.value;
  const editingId = document.querySelector("#paymentForm").elements.id.value;
  const editingPayment = paymentById(editingId);
  const eligible = state.sales.filter(
    (sale) =>
      (isClosedSale(sale) && pendingForSaleCents(sale) > 0) ||
      sale.id === editingPayment?.saleId
  );
  select.innerHTML =
    '<option value="">Selecciona una venta</option>' +
    eligible
      .sort((a, b) => String(b.saleDate).localeCompare(String(a.saleDate)))
      .map(
        (sale) =>
          '<option value="' +
          escapeHtml(sale.id) +
          '">' +
          escapeHtml(
            clientName(sale.clientId) +
              " · " +
              sale.project +
              " · " +
              sale.unit +
              " · " +
              moneyFromCents(
                pendingForSaleCents(sale, editingId),
                sale.commissionCurrency
              )
          ) +
          "</option>"
      )
      .join("");
  if ([...select.options].some((option) => option.value === previous)) {
    select.value = previous;
  } else if (editingPayment) {
    select.value = editingPayment.saleId;
  }
  updatePaymentContext();
}

function updatePaymentContext() {
  const form = document.querySelector("#paymentForm");
  const sale = saleById(form.elements.saleId.value);
  const context = document.querySelector("#paymentContext");
  const fillButton = document.querySelector("#fillPendingAmount");
  if (!sale) {
    context.textContent = "Selecciona una venta para ver su balance.";
    fillButton.disabled = true;
    return;
  }
  const editingId = form.elements.id.value;
  const nextInstallment = nextOpenInstallment(sale, editingId);
  context.textContent =
    "Comisión: " +
    money(sale.commissionAmount, sale.commissionCurrency) +
    " · Cobrado: " +
    moneyFromCents(
      paidForSaleCents(sale.id, editingId),
      sale.commissionCurrency
    ) +
    " · Disponible: " +
    moneyFromCents(
      pendingForSaleCents(sale, editingId),
      sale.commissionCurrency
    ) +
    (nextInstallment
      ? " · Próxima: " + nextInstallment.label + " el " + formatDate(nextInstallment.dueDate)
      : "");
  form.elements.amount.max = fromCents(
    pendingForSaleCents(sale, editingId)
  ).toFixed(2);
  fillButton.disabled = pendingForSaleCents(sale, editingId) <= 0;
}

function populateReportFilters() {
  const yearSelect = document.querySelector("#reportYear");
  const projectSelect = document.querySelector("#reportProject");
  const selectedYear = yearSelect.options.length
    ? yearSelect.value
    : String(new Date().getFullYear());
  const selectedProject = projectSelect.value;
  const years = [
    ...new Set([
      String(new Date().getFullYear()),
      ...state.sales.map((sale) => yearOf(sale.saleDate))
    ])
  ]
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));
  yearSelect.innerHTML =
    '<option value="">Todos los años</option>' +
    years
      .map(
        (year) =>
          '<option value="' +
          escapeHtml(year) +
          '">' +
          escapeHtml(year) +
          "</option>"
      )
      .join("");
  yearSelect.value =
    selectedYear === "" || years.includes(selectedYear) ? selectedYear : years[0] || "";

  const projects = [
    ...new Set(state.sales.map((sale) => sale.project).filter(Boolean))
  ].sort((a, b) => a.localeCompare(b, "es"));
  projectSelect.innerHTML =
    '<option value="">Todos los proyectos</option>' +
    projects
      .map(
        (project) =>
          '<option value="' +
          escapeHtml(project) +
          '">' +
          escapeHtml(project) +
          "</option>"
      )
      .join("");
  projectSelect.value = projects.includes(selectedProject) ? selectedProject : "";
}

function filteredReportSales() {
  const year = document.querySelector("#reportYear").value;
  const project = document.querySelector("#reportProject").value;
  const saleStatus = document.querySelector("#reportSaleStatus").value;
  const commissionStatus = document.querySelector("#reportCommissionStatus").value;
  return state.sales.filter(
    (sale) =>
      (!year || yearOf(sale.saleDate) === year) &&
      (!project || sale.project === project) &&
      (saleStatus
        ? sale.saleStatus === saleStatus
        : commissionStatus === "Anulada"
          ? isCancelledSale(sale)
          : isClosedSale(sale)) &&
      (!commissionStatus || statusForSale(sale).label === commissionStatus)
  );
}

function renderReportAnalysis(sales) {
  const byProject = sales.reduce((groups, sale) => {
    const key = sale.project || "Sin proyecto";
    const current = groups.get(key) || { count: 0, commissions: emptyMoneyTotals() };
    current.count += 1;
    current.commissions[sale.commissionCurrency] += toCents(
      sale.commissionAmount
    );
    groups.set(key, current);
    return groups;
  }, new Map());
  const projects = [...byProject.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6);
  const maximum = Math.max(...projects.map(([, value]) => value.count), 1);
  document.querySelector("#reportProjectBreakdown").innerHTML = projects.length
    ? projects
        .map(
          ([project, value]) =>
            '<div class="project-breakdown-row"><div><strong>' +
            escapeHtml(project) +
            "</strong><span>" +
            value.count +
            (value.count === 1 ? " operación" : " operaciones") +
            " · " +
            escapeHtml(pairMoney(value.commissions)) +
            '</span></div><div class="analysis-bar"><span style="width:' +
            Math.round((value.count / maximum) * 100) +
            '%"></span></div></div>'
        )
        .join("")
    : '<div class="detail-empty">No hay operaciones para estos filtros.</div>';

  const statusOrder = ["Pagada", "Parcial", "Pendiente", "Vencida"];
  const statusCounts = statusOrder.map((status) => ({
    status,
    count: sales.filter((sale) => statusForSale(sale).label === status).length
  }));
  const total = Math.max(sales.length, 1);
  document.querySelector("#reportCollectionHealth").innerHTML = statusCounts
    .map(
      ({ status, count }) =>
        '<div class="health-row"><div><span class="health-dot health-' +
        escapeHtml(normalizeText(status)) +
        '"></span><strong>' +
        escapeHtml(status) +
        "</strong><span>" +
        count +
        '</span></div><div class="analysis-bar"><span style="width:' +
        Math.round((count / total) * 100) +
        '%"></span></div></div>'
    )
    .join("");
}

function renderReports() {
  populateReportFilters();
  const filtered = filteredReportSales();
  const active = filtered;
  const reportYear = document.querySelector("#reportYear").value;
  const volume = aggregate(active, "salePrice", "saleCurrency");
  const commissions = aggregate(active, "commissionAmount", "commissionCurrency");
  const received = active.reduce((totals, sale) => {
    totals[sale.commissionCurrency] += paymentsForSale(sale.id)
      .filter(
        (payment) =>
          isActivePayment(payment) &&
          (!reportYear || yearOf(payment.paymentDate) === reportYear)
      )
      .reduce((sum, payment) => sum + toCents(payment.amount), 0);
    return totals;
  }, emptyMoneyTotals());
  const pending = active.reduce((totals, sale) => {
    totals[sale.commissionCurrency] += pendingForSaleCents(sale);
    return totals;
  }, emptyMoneyTotals());
  document.querySelector("#reportSalesCount").textContent = active.length;
  document.querySelector("#reportSalesVolume").textContent = moneyFromCents(
    volume.USD,
    "USD"
  );
  document.querySelector("#reportSalesVolumeDop").textContent = moneyFromCents(
    volume.DOP,
    "DOP"
  );
  document.querySelector("#reportCommission").textContent = moneyFromCents(
    commissions.USD,
    "USD"
  );
  document.querySelector("#reportCommissionDop").textContent = moneyFromCents(
    commissions.DOP,
    "DOP"
  );
  document.querySelector("#reportReceived").textContent = moneyFromCents(
    received.USD,
    "USD"
  );
  document.querySelector("#reportReceivedDop").textContent = moneyFromCents(
    received.DOP,
    "DOP"
  );
  document.querySelector("#reportPending").textContent = moneyFromCents(
    pending.USD,
    "USD"
  );
  document.querySelector("#reportPendingDop").textContent = moneyFromCents(
    pending.DOP,
    "DOP"
  );
  renderReportAnalysis(active);
  document.querySelector("#reportBody").innerHTML = [...filtered]
    .sort((a, b) => String(b.saleDate).localeCompare(String(a.saleDate)))
    .map(
      (sale) =>
        '<tr class="record-row ' +
        (isCancelledSale(sale) ? "muted-row" : "") +
        '" data-view-sale="' +
        escapeHtml(sale.id) +
        '" tabindex="0" aria-label="Abrir dossier de ' +
        escapeHtml(saleLabel(sale)) +
        '"><td><span class="primary-cell">' +
        escapeHtml(clientName(sale.clientId)) +
        '</span><span class="secondary-cell">' +
        escapeHtml(formatDate(sale.saleDate)) +
        '</span></td><td><span class="primary-cell">' +
        escapeHtml(sale.project) +
        '</span><span class="secondary-cell">' +
        escapeHtml(sale.unit + (sale.developer ? " · " + sale.developer : "")) +
        "</span></td><td>" +
        saleStatusBadge(sale) +
        '</td><td class="money-cell">' +
        escapeHtml(money(sale.salePrice, sale.saleCurrency)) +
        '</td><td class="money-cell">' +
        escapeHtml(money(sale.commissionAmount, sale.commissionCurrency)) +
        "</td><td>" +
        statusBadge(sale) +
        "</td></tr>"
    )
    .join("");
  document.querySelector("#reportMobileList").innerHTML = [...filtered]
    .sort((a, b) => String(b.saleDate).localeCompare(String(a.saleDate)))
    .map(
      (sale) =>
        '<article class="mobile-record-card record-row' +
        (isCancelledSale(sale) ? " muted-row" : "") +
        '" data-view-sale="' +
        escapeHtml(sale.id) +
        '" tabindex="0" role="button" aria-label="Abrir dossier de ' +
        escapeHtml(saleLabel(sale)) +
        '"><div class="mobile-record-head"><strong>' +
        escapeHtml(clientName(sale.clientId)) +
        "</strong>" +
        saleStatusBadge(sale) +
        '</div><div class="mobile-record-main">' +
        escapeHtml(sale.project + " · " + sale.unit) +
        '</div><div class="mobile-record-meta"><span>' +
        escapeHtml(formatDate(sale.saleDate)) +
        '</span><span class="mobile-record-amount">' +
        escapeHtml(money(sale.salePrice, sale.saleCurrency)) +
        '</span></div><div class="mobile-record-meta"><span>Comisión</span><span class="mobile-record-amount">' +
        escapeHtml(money(sale.commissionAmount, sale.commissionCurrency)) +
        '</span></div><div class="mobile-record-open"><span>Ver dossier</span><i data-lucide="arrow-right" aria-hidden="true"></i></div></article>'
    )
    .join("");
  document.querySelector("#reportEmpty").hidden = filtered.length !== 0;
  refreshIcons();
}

function renderAll(persist) {
  if (persist !== false) saveState();
  populateClientSelect();
  populatePaymentSelect();
  renderDashboard();
  renderClients();
  renderSales();
  renderCollectionQueue();
  renderPayments();
  renderReports();
  renderStorageStatus();
  if (activeDrawer?.id === "recordDetailDrawer") renderRecordDetail();
  refreshIcons();
  if (!storageHealthy && storageIssue) showToast(storageIssue, 6500);
}

function setFormValue(form, name, value) {
  const field = form.elements.namedItem(name);
  if (field) field.value = value == null ? "" : String(value);
}

function canonicalDeveloper(value) {
  const key = normalizeText(value).replace(/^constructora\s+/, "");
  return Object.keys(DEVELOPER_PROJECTS).find(
    (developer) => normalizeText(developer).replace(/^constructora\s+/, "") === key
  ) || "";
}

function developerForProject(value) {
  const projectKey = normalizeText(value);
  return Object.entries(DEVELOPER_PROJECTS).find(([, projects]) =>
    projects.some((project) => normalizeText(project) === projectKey)
  )?.[0] || "";
}

function updateProjectCatalog() {
  const developerInput = document.querySelector("#saleDeveloper");
  const catalog = document.querySelector("#projectCatalog");
  if (!developerInput || !catalog) return;
  const selectedDeveloper = canonicalDeveloper(developerInput.value);
  const projects = selectedDeveloper
    ? DEVELOPER_PROJECTS[selectedDeveloper]
    : Object.values(DEVELOPER_PROJECTS).flat();
  catalog.innerHTML = projects
    .map((project) => '<option value="' + escapeHtml(project) + '"></option>')
    .join("");
}

function updateDeveloperFromProject() {
  const developerInput = document.querySelector("#saleDeveloper");
  const projectInput = document.querySelector("#saleProject");
  if (!developerInput || !projectInput) return;
  const matchedDeveloper = developerForProject(projectInput.value);
  if (matchedDeveloper) developerInput.value = matchedDeveloper;
  updateProjectCatalog();
}

function addMonthsToDate(value, months) {
  const parsed = parseLocalDate(value || today());
  if (!parsed) return today();
  const day = parsed.getDate();
  parsed.setDate(1);
  parsed.setMonth(parsed.getMonth() + months);
  const lastDay = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0).getDate();
  parsed.setDate(Math.min(day, lastDay));
  return (
    parsed.getFullYear() +
    "-" +
    String(parsed.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(parsed.getDate()).padStart(2, "0")
  );
}

function installmentPercentageText(amountCents, commissionCents) {
  if (commissionCents <= 0 || amountCents <= 0) return "";
  return String(Number(((amountCents / commissionCents) * 100).toFixed(4)));
}

function syncInstallmentPercentageForRow(row) {
  const percentage = row?.querySelector("[data-installment-percentage]");
  const amount = row?.querySelector("[data-installment-amount]");
  if (!percentage || !amount) return;
  percentage.value = installmentPercentageText(
    toCents(amount.value),
    toCents(document.querySelector("#commissionAmount")?.value)
  );
}

function createInstallmentRow(installment) {
  const container = document.querySelector("#installmentRows");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "installment-row";
  row.dataset.installmentId = installment?.id || "";
  row.innerHTML =
    '<label>Concepto<input type="text" data-installment-label maxlength="120" readonly aria-readonly="true" required /></label>' +
    '<label>Porcentaje<input type="number" data-installment-percentage min="0.0001" max="100" step="0.0001" inputmode="decimal" aria-label="Porcentaje de la comisión" readonly aria-readonly="true" required /></label>' +
    '<label>Monto calculado<input type="number" data-installment-amount min="0.01" step="0.01" readonly aria-readonly="true" required /></label>' +
    '<label>Fecha de cobro<input type="date" data-installment-due-date required /></label>';
  row.querySelector("[data-installment-label]").value = installment?.label || "Pago";
  row.querySelector("[data-installment-amount]").value = numberValue(installment?.amount)
    ? numberValue(installment.amount).toFixed(2)
    : "";
  row.querySelector("[data-installment-due-date]").value =
    installment?.dueDate || document.querySelector("#saleDate")?.value || today();
  container.appendChild(row);
  if (numberValue(installment?.percentage) > 0) {
    row.querySelector("[data-installment-percentage]").value = String(
      numberValue(installment.percentage)
    );
  } else {
    syncInstallmentPercentageForRow(row);
  }
  refreshIcons();
}

function installmentPlanLocked() {
  const saleId = document.querySelector("#saleForm")?.elements.id.value;
  return Boolean(saleId && activePaymentsForSale(saleId).length);
}

function applyInstallmentPlanLock() {
  const form = document.querySelector("#saleForm");
  if (!form) return;
  const locked = installmentPlanLocked();
  document.querySelector("#installmentPlanner")?.classList.toggle("plan-locked", locked);
  installmentRowsFromForm().forEach((row) => {
    row.querySelectorAll("input").forEach((input) => {
      const calculated = input.matches(
        "[data-installment-label], [data-installment-percentage], [data-installment-amount]"
      );
      input.readOnly = calculated || locked;
      input.setAttribute("aria-readonly", String(calculated || locked));
    });
  });
  document.querySelector("#commissionPlanType").disabled = locked;
  document.querySelector("#advancePercentage").disabled = locked;
  document.querySelectorAll("[data-advance-preset]").forEach((button) => {
    button.disabled = locked;
  });
  form.elements.commissionRate.readOnly = locked;
  form.elements.commissionAmount.readOnly = locked;
  form.elements.commissionCurrency.disabled = locked;
  form.elements.saleDate.readOnly = locked;
}

function currentInstallmentDrafts() {
  return installmentRowsFromForm().map((row) => ({
    id: row.dataset.installmentId || "",
    label: String(row.querySelector("[data-installment-label]")?.value || ""),
    amount: numberValue(row.querySelector("[data-installment-amount]")?.value),
    dueDate: String(row.querySelector("[data-installment-due-date]")?.value || "")
  }));
}

function updateCommissionPlanControls() {
  const mode = document.querySelector("#commissionPlanType")?.value || "advance_balance";
  const advanceWrap = document.querySelector("#advancePercentageWrap");
  const presets = document.querySelector("#commissionPlanPresets");
  if (advanceWrap) advanceWrap.hidden = mode === "single";
  if (presets) presets.hidden = mode === "single";
  const percentage = numberValue(document.querySelector("#advancePercentage")?.value);
  document.querySelectorAll("[data-advance-preset]").forEach((button) => {
    const active = mode !== "single" && numberValue(button.dataset.advancePreset) === percentage;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderSelectedCommissionPlan(existing) {
  const container = document.querySelector("#installmentRows");
  if (!container) return;
  const form = document.querySelector("#saleForm");
  const mode = document.querySelector("#commissionPlanType")?.value || "advance_balance";
  const source = Array.isArray(existing) ? existing : currentInstallmentDrafts();
  const commissionCents = toCents(form.elements.commissionAmount.value);
  const saleDate = form.elements.saleDate.value || today();
  const firstDate = source[0]?.dueDate || saleDate;
  const plan = [];

  if (mode === "single") {
    plan.push({
      id: source[0]?.id || "",
      label: "Pago único",
      percentage: 100,
      amount: fromCents(commissionCents),
      dueDate: firstDate
    });
  } else {
    const percentageField = document.querySelector("#advancePercentage");
    let advancePercentage = numberValue(percentageField?.value);
    if (!(advancePercentage > 0 && advancePercentage < 100)) {
      advancePercentage = 50;
      if (percentageField) percentageField.value = "50";
    }
    const advanceCents = Math.round((commissionCents * advancePercentage) / 100);
    plan.push(
      {
        id: source[0]?.id || "",
        label: "Avance",
        percentage: advancePercentage,
        amount: fromCents(advanceCents),
        dueDate: firstDate
      },
      {
        id: source[1]?.id || "",
        label: "Saldo",
        percentage: Number((100 - advancePercentage).toFixed(4)),
        amount: fromCents(commissionCents - advanceCents),
        dueDate: source[1]?.dueDate || addMonthsToDate(firstDate, 1)
      }
    );
  }

  container.textContent = "";
  plan.forEach(createInstallmentRow);
  updateCommissionPlanControls();
  applyInstallmentPlanLock();
  updateInstallmentPlanSummary();
}

function renderInstallmentEditor(installments) {
  const items = Array.isArray(installments) ? installments : [];
  const mode = items.length === 1 ? "single" : "advance_balance";
  const commissionCents = toCents(document.querySelector("#commissionAmount")?.value);
  const firstAmountCents = toCents(items[0]?.amount);
  const percentage = mode === "advance_balance" && commissionCents > 0 && firstAmountCents > 0
    ? installmentPercentageText(firstAmountCents, commissionCents)
    : "50";
  document.querySelector("#commissionPlanType").value = mode;
  document.querySelector("#advancePercentage").value = percentage || "50";
  renderSelectedCommissionPlan(items);
}

function installmentRowsFromForm() {
  return [...document.querySelectorAll("#installmentRows .installment-row")];
}

function updateInstallmentPlanSummary() {
  const summary = document.querySelector("#installmentPlanSummary");
  if (!summary) return;
  const rows = installmentRowsFromForm();
  const scheduledCents = rows.reduce(
    (total, row) => total + toCents(row.querySelector("[data-installment-amount]")?.value),
    0
  );
  const commissionCents = toCents(document.querySelector("#commissionAmount")?.value);
  const difference = commissionCents - scheduledCents;
  const scheduledPercentage = installmentPercentageText(scheduledCents, commissionCents) || "0";
  const paymentBreakdown = rows
    .map((row) => {
      const label = String(row.querySelector("[data-installment-label]")?.value || "Pago");
      const percentage = String(
        row.querySelector("[data-installment-percentage]")?.value || "0"
      );
      return label + " " + percentage + "%";
    })
    .join(" · ");
  summary.textContent =
    paymentBreakdown +
    " · Total " +
    moneyFromCents(scheduledCents, document.querySelector('#saleForm [name="commissionCurrency"]')?.value) +
    " (" +
    scheduledPercentage +
    "%)" +
    (difference === 0
      ? " · Plan completo"
      : " · Diferencia " +
        moneyFromCents(Math.abs(difference), document.querySelector('#saleForm [name="commissionCurrency"]')?.value));
  if (installmentPlanLocked()) {
    summary.textContent += " · Bloqueado por cobros contabilizados";
  }
  summary.classList.toggle("plan-mismatch", difference !== 0);
}

function readInstallmentPlan(saleId, saleDate, commissionAmount) {
  const rows = installmentRowsFromForm();
  if (!rows.length) {
    showToast("Agrega al menos una cuota al plan de cobro", 5000);
    return null;
  }
  const plan = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const labelInput = row.querySelector("[data-installment-label]");
    const amountInput = row.querySelector("[data-installment-amount]");
    const dateInput = row.querySelector("[data-installment-due-date]");
    const label = String(labelInput?.value || "").trim();
    const amount = numberValue(amountInput?.value);
    const dueDate = String(dateInput?.value || "");
    if (!label || amount <= 0 || !isValidIsoDate(dueDate) || dueDate < saleDate) {
      showToast("Revisa el concepto, monto y fecha de cada cuota", 5000);
      (label ? amount > 0 ? dateInput : amountInput : labelInput)?.focus();
      return null;
    }
    plan.push({
      id: row.dataset.installmentId || makeId("installment"),
      saleId,
      sequence: index + 1,
      label,
      amount,
      dueDate,
      notes: "",
      createdAt: installmentById(row.dataset.installmentId)?.createdAt || today(),
      updatedAt: today()
    });
  }
  const scheduledCents = plan.reduce((total, installment) => total + toCents(installment.amount), 0);
  if (scheduledCents !== toCents(commissionAmount)) {
    showFieldError(
      document.querySelector("#saleForm"),
      "commissionAmount",
      "La suma de las cuotas debe coincidir exactamente con la comisión"
    );
    return null;
  }
  return plan;
}

function guardInstallmentStructureChange() {
  if (!installmentPlanLocked()) return false;
  showToast(
    "El plan financiero está bloqueado porque ya existen cobros contabilizados",
    5500
  );
  return true;
}

function updateCancelReasonVisibility() {
  const form = document.querySelector("#saleForm");
  const wrapper = document.querySelector("#cancelReasonWrap");
  if (!form || !wrapper) return;
  const cancelled = form.elements.saleStatus.value === "Cancelada";
  wrapper.hidden = !cancelled;
  form.elements.cancelReason.required = cancelled;
}

function updateSharedSaleVisibility() {
  const form = document.querySelector("#saleForm");
  const wrapper = document.querySelector("#externalAgentWrap");
  if (!form || !wrapper) return;
  const shared = Boolean(form.elements.sharedSale.checked);
  wrapper.hidden = !shared;
  form.elements.externalAgent.required = shared;
}

function resetFormDates() {
  document.querySelector("#saleDate").value = today();
  document.querySelector("#paymentDate").value = today();
}

function resetClientForm() {
  const form = document.querySelector("#clientForm");
  clearFormErrors(form);
  form.reset();
  setFormValue(form, "id", "");
  setFormValue(form, "capturedAt", today());
  document.querySelector("#clientFormTitle").textContent = "Agregar cliente";
  document.querySelector("#clientSubmitButton").textContent = "Guardar cliente";
  document.querySelector("#cancelClientEdit").hidden = false;
}

function resetSaleForm() {
  const form = document.querySelector("#saleForm");
  clearFormErrors(form);
  form.reset();
  setFormValue(form, "id", "");
  setFormValue(form, "saleDate", today());
  setFormValue(form, "cancelReason", "");
  updateProjectCatalog();
  renderInstallmentEditor([]);
  updateCancelReasonVisibility();
  updateSharedSaleVisibility();
  document.querySelector("#saleFormTitle").textContent = "Registrar venta";
  document.querySelector("#saleSubmitButton").textContent = "Guardar venta";
  document.querySelector("#cancelSaleEdit").hidden = false;
}

function resetPaymentForm() {
  const form = document.querySelector("#paymentForm");
  clearFormErrors(form);
  form.reset();
  delete form.dataset.pendingPaymentId;
  setFormValue(form, "id", "");
  setFormValue(form, "paymentDate", today());
  document.querySelector("#paymentFormTitle").textContent = "Registrar cobro de comisión";
  document.querySelector("#paymentSubmitButton").textContent = "Guardar cobro";
  document.querySelector("#cancelPaymentEdit").hidden = false;
  populatePaymentSelect();
}

function startClientEdit(id, trigger) {
  const client = clientById(id);
  if (!client) return;
  const form = document.querySelector("#clientForm");
  [
    "id", "name", "phone", "email", "source", "stage",
    "desiredZone", "propertyStage", "budget", "budgetCurrency", "capturedAt", "notes"
  ].forEach((name) => setFormValue(form, name, client[name]));
  document.querySelector("#clientFormTitle").textContent = "Editar cliente";
  document.querySelector("#clientSubmitButton").textContent = "Guardar cambios";
  document.querySelector("#cancelClientEdit").hidden = false;
  switchView("clients", true, false);
  openDrawer("clientForm", trigger);
}

function startSaleEdit(id, trigger) {
  const sale = saleById(id);
  if (!sale) return;
  const form = document.querySelector("#saleForm");
  [
    "id", "clientId", "project", "unit", "developer", "saleStatus",
    "salePrice", "saleCurrency", "saleDate", "deliveryDate", "externalAgent",
    "commissionRate", "commissionAmount", "commissionCurrency", "cancelReason", "notes"
  ].forEach((name) => setFormValue(form, name, sale[name]));
  form.elements.sharedSale.checked = Boolean(sale.sharedSale);
  updateProjectCatalog();
  renderInstallmentEditor(installmentsForSale(sale.id));
  updateCancelReasonVisibility();
  updateSharedSaleVisibility();
  document.querySelector("#saleFormTitle").textContent = "Editar venta";
  document.querySelector("#saleSubmitButton").textContent = "Guardar cambios";
  document.querySelector("#cancelSaleEdit").hidden = false;
  switchView("sales", true, false);
  openDrawer("saleForm", trigger);
}

function startPaymentEdit(id, trigger) {
  const payment = paymentById(id);
  if (!payment || !isActivePayment(payment)) return;
  const form = document.querySelector("#paymentForm");
  ["id", "saleId", "amount", "paymentDate", "method", "reference", "notes"].forEach(
    (name) => setFormValue(form, name, payment[name])
  );
  document.querySelector("#paymentFormTitle").textContent = "Editar cobro";
  document.querySelector("#paymentSubmitButton").textContent = "Guardar cambios";
  document.querySelector("#cancelPaymentEdit").hidden = false;
  populatePaymentSelect();
  setFormValue(form, "saleId", payment.saleId);
  updatePaymentContext();
  switchView("payments", true, false);
  openDrawer("paymentForm", trigger);
}

function findDuplicateClient(phone, email, excludedId) {
  const phoneKey = String(phone || "").replace(/\D/g, "");
  const emailKey = normalizeText(email);
  return state.clients.find(
    (client) =>
      client.id !== excludedId &&
      ((phoneKey &&
        String(client.phone || "").replace(/\D/g, "") === phoneKey) ||
        (emailKey && normalizeText(client.email) === emailKey))
  );
}

function hasDuplicateActiveUnit(project, unit, excludedId) {
  const projectKey = normalizeText(project);
  const unitKey = normalizeText(unit);
  return state.sales.some(
    (sale) =>
      sale.id !== excludedId &&
      !isCancelledSale(sale) &&
      normalizeText(sale.project) === projectKey &&
      normalizeText(sale.unit) === unitKey
  );
}

function downloadBlob(blob, filename) {
  const downloadableBlob = new Blob([blob], { type: "application/octet-stream" });
  const url = URL.createObjectURL(downloadableBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.target = "_self";
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 30000);
}

function exportBackup() {
  const backupData = {
    clients: state.clients,
    sales: state.sales,
    installments: state.installments,
    payments: state.payments
  };
  downloadBlob(
    new Blob(
      [
        JSON.stringify(
          {
            app: "Antony CRM",
            version: APP_VERSION,
            exportedAt: new Date().toISOString(),
            data: backupData
          },
          null,
          2
        )
      ],
      { type: "application/octet-stream" }
    ),
    "antony-crm-respaldo-" + today() + ".json"
  );
  showToast("Archivo de respaldo descargado. Guárdalo sin editar para restaurar el CRM.", 6000);
}

async function importBackup(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast("El respaldo excede el límite de 5 MB");
    return;
  }
  try {
    const parsed = JSON.parse(await file.text());
    if (parsed.version && Number(parsed.version) > APP_VERSION) {
      throw new Error("Este respaldo pertenece a una versión más reciente del CRM.");
    }
    const importSource = parsed.data || parsed;
    assertImportDates(importSource);
    const imported = normalizeState(importSource);
    if (
      !DEMO_MODE &&
      (state.clients.length || state.sales.length || state.installments.length || state.payments.length)
    ) {
      showToast(
        "Por seguridad, un respaldo de nube solo se restaura en un espacio vacío",
        6000
      );
      return;
    }
    const confirmation = await requestConfirmation({
      title: "Importar respaldo",
      message:
        "El archivo validado contiene " +
        imported.clients.length +
        " clientes, " +
        imported.sales.length +
        " ventas y " +
        imported.payments.length +
        " cobros y " +
        imported.installments.length +
        (DEMO_MODE
          ? " cuotas. Los datos locales actuales serán reemplazados en una sola operación."
          : " cuotas. Se restaurarán en este espacio vacío mediante una sola transacción."),
      confirmLabel: DEMO_MODE ? "Importar y reemplazar" : "Restaurar respaldo"
    });
    if (!confirmation.confirmed) return;
    if (DEMO_MODE) {
      state = imported;
    } else {
      await performCloudMutation(() => cloudBackend.importWorkspace(imported));
      state = normalizeState(await cloudBackend.loadWorkspace());
    }
    storageHealthy = true;
    storageIssue = "";
    recordAudit("import", "backup", "local", "Respaldo importado");
    resetClientForm();
    resetSaleForm();
    resetPaymentForm();
    renderAll();
    document.querySelector(".data-menu").open = false;
    showToast("Respaldo importado correctamente");
  } catch (error) {
    const detail =
      !DEMO_MODE && cloudBackend?.humanizeError
        ? cloudBackend.humanizeError(error)
        : error.message;
    showToast("No se pudo importar: " + detail, 5000);
  }
}

function safeCsvCell(value) {
  let text = String(value == null ? "" : value);
  if (/^\s*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

function exportSalesCsv() {
  const sales = [...filteredReportSales()].sort((a, b) =>
    String(b.saleDate).localeCompare(String(a.saleDate))
  );
  const rows = [
    [
      "Fecha", "Fecha entrega", "Cliente", "Proyecto", "Unidad", "Desarrolladora",
      "Venta compartida", "Asesor externo",
      "Estado venta", "Precio", "Moneda precio", "Comisión",
      "Moneda comisión", "Cobrado", "Pendiente", "Estado comisión",
      "Vencimiento"
    ]
  ];
  sales.forEach((sale) => {
    rows.push([
      sale.saleDate,
      sale.deliveryDate,
      clientName(sale.clientId),
      sale.project,
      sale.unit,
      sale.developer,
      sale.sharedSale ? "Sí" : "No",
      sale.externalAgent,
      sale.saleStatus,
      sale.salePrice,
      sale.saleCurrency,
      sale.commissionAmount,
      sale.commissionCurrency,
      paidForSale(sale.id),
      pendingForSale(sale),
      statusForSale(sale).label,
      nextCommissionDueDate(sale)
    ]);
  });
  const csv = rows.map((row) => row.map(safeCsvCell).join(",")).join("\n");
  downloadBlob(
    new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
    "antony-crm-ventas-filtradas-" + today() + ".csv"
  );
  showToast(sales.length + " ventas exportadas");
}

function exportPaymentsCsv() {
  const rows = [
    [
      "Fecha", "Cliente", "Proyecto", "Unidad", "Monto", "Moneda",
      "Método", "Referencia", "Estado", "Motivo de anulación", "Notas"
    ]
  ];
  [...state.payments]
    .sort((a, b) => String(b.paymentDate).localeCompare(String(a.paymentDate)))
    .forEach((payment) => {
      const sale = saleById(payment.saleId);
      rows.push([
        payment.paymentDate,
        clientName(sale?.clientId),
        sale?.project || "",
        sale?.unit || "",
        payment.amount,
        payment.currency,
        payment.method,
        payment.reference,
        payment.status,
        payment.voidReason,
        payment.notes
      ]);
    });
  const csv = rows.map((row) => row.map(safeCsvCell).join(",")).join("\n");
  downloadBlob(
    new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
    "antony-crm-cobros-" + today() + ".csv"
  );
  showToast(state.payments.length + " cobros exportados");
}

function updateCommissionFromRate() {
  if (installmentPlanLocked()) return;
  const form = document.querySelector("#saleForm");
  if (form.elements.saleCurrency.value !== form.elements.commissionCurrency.value) {
    return;
  }
  const price = toCents(form.elements.salePrice.value);
  const rate = numberValue(form.elements.commissionRate.value);
  if (price > 0 && rate > 0 && rate <= 100) {
    form.elements.commissionAmount.value = fromCents(
      Math.round((price * rate) / 100)
    ).toFixed(2);
    renderSelectedCommissionPlan(currentInstallmentDrafts());
  }
}

function setAppBusy(value) {
  appBusy = Boolean(value);
  document.body.classList.toggle("app-busy", appBusy);
  document.querySelector("#crmApp").setAttribute("aria-busy", String(appBusy));
  document.querySelector("#environmentBadge").setAttribute("aria-busy", String(appBusy));
  document.querySelectorAll("button[type='submit']").forEach((button) => {
    button.disabled = appBusy;
  });
}

async function performCloudMutation(operation) {
  if (DEMO_MODE) return null;
  if (!cloudReady || !cloudBackend) {
    throw new Error("La conexión segura todavía no está disponible.");
  }
  if (appBusy) throw new Error("Hay otra operación en curso.");
  setAppBusy(true);
  try {
    return await operation();
  } finally {
    setAppBusy(false);
  }
}

function showBackendError(error) {
  const message = cloudBackend?.humanizeError
    ? cloudBackend.humanizeError(error)
    : error?.message || "No se pudo completar la operación.";
  showToast(message, 6000);
}

function reportBackendDiagnostic(scope, error) {
  const details = error?.details && typeof error.details === "object"
    ? error.details
    : {};
  console.error("Antony CRM backend failure", {
    scope,
    name: String(error?.name || "Error"),
    code: String(error?.code || "CRM_ERROR"),
    status: Number(error?.status) || 0,
    kind: String(details.kind || "unknown"),
    operation: String(details.operation || scope),
    retryable: Boolean(details.retryable),
    summary: details.summary ? String(details.summary) : null
  });
}

document.querySelectorAll("[data-view-target]").forEach((button) => {
  button.addEventListener("click", () =>
    switchView(button.dataset.viewTarget, true, true)
  );
});

document.querySelectorAll("[data-open-drawer]").forEach((button) => {
  button.addEventListener("click", () => {
    const formId = button.dataset.openDrawer;
    const viewByForm = {
      clientForm: "clients",
      saleForm: "sales",
      paymentForm: "payments"
    };
    const view = viewByForm[formId];
    if (!view) return;
    switchView(view, true, false);
    resetDrawerForm(formId);
    const visibleTrigger = document.querySelector(
      '#view-' + view + ' [data-open-drawer="' + formId + '"]'
    );
    openDrawer(formId, visibleTrigger || button);
  });
});

document.querySelector("#clientForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  clearFormErrors(formElement);
  const data = new FormData(formElement);
  const id = String(data.get("id") || "");
  const name = String(data.get("name") || "").trim();
  const phone = String(data.get("phone") || "").trim();
  const email = String(data.get("email") || "").trim();
  const capturedAt = String(data.get("capturedAt") || today());
  const propertyStage = String(data.get("propertyStage") || "Sin definir");
  if (!phone) {
    return showFieldError(formElement, "phone", "El teléfono es obligatorio");
  }
  if (phone.replace(/\D/g, "").length < 7) {
    return showFieldError(formElement, "phone", "Indica un teléfono válido");
  }
  if (!email) {
    return showFieldError(formElement, "email", "El correo electrónico es obligatorio");
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return showFieldError(formElement, "email", "Indica un correo electrónico válido");
  }
  if (!isValidIsoDate(capturedAt) || capturedAt > today()) {
    return showFieldError(formElement, "capturedAt", "Indica una fecha de captación válida");
  }
  if (!VALID_PROPERTY_STAGES.includes(propertyStage)) {
    return showFieldError(formElement, "propertyStage", "Selecciona un estado válido");
  }
  const duplicate = findDuplicateClient(phone, email, id);
  if (duplicate) {
    const duplicateField =
      phone && normalizeText(duplicate.phone) === normalizeText(phone) ? "phone" : "email";
    return showFieldError(
      formElement,
      duplicateField,
      "Posible duplicado: ya existe " + duplicate.name
    );
  }
  const client = {
    id: id || makeId("client"),
    name,
    phone,
    email,
    source: String(data.get("source") || "Otro"),
    stage: String(data.get("stage") || "Nuevo"),
    desiredZone: String(data.get("desiredZone") || "").trim(),
    propertyStage,
    budget: Math.max(numberValue(data.get("budget")), 0),
    budgetCurrency: normalizeCurrency(data.get("budgetCurrency"), "USD"),
    capturedAt,
    notes: String(data.get("notes") || "").trim(),
    createdAt: id ? clientById(id)?.createdAt || today() : today(),
    updatedAt: today()
  };
  let savedClient = client;
  if (!DEMO_MODE) {
    try {
      savedClient = await performCloudMutation(() => cloudBackend.saveClient(client));
    } catch (error) {
      showBackendError(error);
      return;
    }
  }
  if (id) {
    state.clients = state.clients.map((item) => (item.id === id ? savedClient : item));
    recordAudit("update", "client", id, name);
  } else {
    state.clients.push(savedClient);
    recordAudit("create", "client", client.id, name);
  }
  resetClientForm();
  renderAll();
  closeDrawer(false);
  showToast(id ? "Cliente actualizado" : "Cliente guardado");
});

document.querySelector("#cancelClientEdit").addEventListener("click", () => closeDrawer());
document.querySelector("#clientSearch").addEventListener("input", renderClients);
document.querySelector("#clientStageFilter").addEventListener("change", renderClients);
document.querySelector("#saleDeveloper").addEventListener("input", updateProjectCatalog);
document.querySelector("#saleProject").addEventListener("input", updateDeveloperFromProject);
document.querySelector("#saleProject").addEventListener("change", updateDeveloperFromProject);
document.querySelector("#salePrice").addEventListener("input", updateCommissionFromRate);
document.querySelector("#commissionRate").addEventListener("input", updateCommissionFromRate);
document
  .querySelector('#saleForm [name="commissionCurrency"]')
  .addEventListener("change", updateCommissionFromRate);
document
  .querySelector('#saleForm [name="saleCurrency"]')
  .addEventListener("change", (event) => {
    const form = document.querySelector("#saleForm");
    if (!form.elements.id.value) {
      form.elements.commissionCurrency.value = event.target.value;
    }
    updateCommissionFromRate();
  });
document.querySelector("#commissionAmount").addEventListener("input", () => {
  renderSelectedCommissionPlan(currentInstallmentDrafts());
});
document.querySelector('#saleForm [name="saleStatus"]').addEventListener("change", updateCancelReasonVisibility);
document.querySelector("#sharedSale").addEventListener("change", updateSharedSaleVisibility);
document.querySelector("#saleDate").addEventListener("change", () => {
  const saleDate = document.querySelector("#saleDate").value;
  const deliveryDate = document.querySelector("#deliveryDate");
  if (deliveryDate.value && deliveryDate.value < saleDate) {
    deliveryDate.value = saleDate;
  }
  installmentRowsFromForm().forEach((row) => {
    const field = row.querySelector("[data-installment-due-date]");
    if (!field.value || field.value < saleDate) {
      field.value = saleDate;
    }
  });
  updateInstallmentPlanSummary();
});
document.querySelector("#installmentRows").addEventListener("input", (event) => {
  if (event.target.matches("[data-installment-due-date]")) {
    updateInstallmentPlanSummary();
  }
});
document.querySelector("#commissionPlanType").addEventListener("change", () => {
  if (guardInstallmentStructureChange()) {
    document.querySelector("#commissionPlanType").value =
      installmentRowsFromForm().length === 1 ? "single" : "advance_balance";
    updateCommissionPlanControls();
    return;
  }
  renderSelectedCommissionPlan(currentInstallmentDrafts());
});
document.querySelector("#advancePercentage").addEventListener("input", (event) => {
  if (installmentPlanLocked()) return;
  const percentage = numberValue(event.target.value);
  if (!(percentage > 0 && percentage < 100)) {
    updateCommissionPlanControls();
    return;
  }
  renderSelectedCommissionPlan(currentInstallmentDrafts());
});
document.querySelector("#advancePercentage").addEventListener("change", (event) => {
  const percentage = numberValue(event.target.value);
  if (!(percentage > 0 && percentage < 100)) {
    event.target.value = "50";
    showToast("El avance debe ser mayor que 0% y menor que 100%");
  }
  renderSelectedCommissionPlan(currentInstallmentDrafts());
});
document.querySelector("#commissionPlanPresets").addEventListener("click", (event) => {
  const button = event.target.closest("[data-advance-preset]");
  if (!button || guardInstallmentStructureChange()) return;
  document.querySelector("#advancePercentage").value = button.dataset.advancePreset;
  renderSelectedCommissionPlan(currentInstallmentDrafts());
});

document.querySelector("#saleForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  clearFormErrors(formElement);
  const data = new FormData(formElement);
  const id = String(data.get("id") || "");
  const current = saleById(id);
  const clientId = String(data.get("clientId") || "");
  const project = String(data.get("project") || "").trim();
  const unit = String(data.get("unit") || "").trim();
  const salePrice = numberValue(data.get("salePrice"));
  const saleCurrency = normalizeCurrency(data.get("saleCurrency"), "USD");
  const saleDate = String(data.get("saleDate") || today());
  const deliveryDate = String(data.get("deliveryDate") || "");
  const saleStatus = String(data.get("saleStatus") || "Contratada");
  const sharedSale = data.get("sharedSale") === "on";
  const externalAgent = String(data.get("externalAgent") || "").trim();
  const financialLocked = Boolean(id && activePaymentsForSale(id).length);
  const commissionRate = financialLocked
    ? numberValue(current?.commissionRate)
    : numberValue(data.get("commissionRate"));
  const commissionAmount = financialLocked
    ? numberValue(current?.commissionAmount)
    : numberValue(data.get("commissionAmount"));
  const commissionCurrency = normalizeCurrency(
    financialLocked ? current?.commissionCurrency : data.get("commissionCurrency"),
    saleCurrency
  );
  const cancelReason = String(data.get("cancelReason") || "").trim();
  const payments = id ? paymentsForSale(id) : [];

  if (!clientById(clientId)) {
    return showFieldError(
      formElement,
      "clientId",
      "Primero registra y selecciona un cliente"
    );
  }
  if (salePrice <= 0) {
    return showFieldError(
      formElement,
      "salePrice",
      "El precio vendido debe ser mayor que cero"
    );
  }
  if (deliveryDate && (!isValidIsoDate(deliveryDate) || deliveryDate < saleDate)) {
    return showFieldError(
      formElement,
      "deliveryDate",
      "La entrega no puede ser anterior a la fecha de venta"
    );
  }
  if (sharedSale && !externalAgent) {
    return showFieldError(
      formElement,
      "externalAgent",
      "Indica el nombre del asesor o broker externo"
    );
  }
  if (commissionAmount <= 0) {
    return showFieldError(
      formElement,
      "commissionAmount",
      "Indica una comisión total mayor que cero"
    );
  }
  if (commissionRate < 0 || commissionRate > 100) {
    return showFieldError(
      formElement,
      "commissionRate",
      "La tasa debe estar entre 0% y 100%"
    );
  }
  if (saleCurrency !== commissionCurrency && commissionRate > 0) {
    return showFieldError(
      formElement,
      "commissionRate",
      "Con monedas distintas, usa tasa 0 y registra el monto fijo"
    );
  }
  if (
    saleStatus !== "Cancelada" &&
    hasDuplicateActiveUnit(project, unit, id)
  ) {
    return showFieldError(
      formElement,
      "unit",
      "Ya existe una venta activa para ese proyecto y unidad"
    );
  }
  if (payments.length && current?.commissionCurrency !== commissionCurrency) {
    return showFieldError(
      formElement,
      "commissionCurrency",
      "No puedes cambiar la moneda después de registrar cobros"
    );
  }
  if (
    saleStatus !== "Cancelada" &&
    toCents(commissionAmount) < paidForSaleCents(id)
  ) {
    return showFieldError(
      formElement,
      "commissionAmount",
      "La comisión no puede ser menor que lo ya cobrado"
    );
  }
  if (
    payments.some(
      (payment) => isActivePayment(payment) && payment.paymentDate < saleDate
    )
  ) {
    return showFieldError(
      formElement,
      "saleDate",
      "La venta no puede quedar después de un cobro existente"
    );
  }
  if (
    saleStatus === "Cancelada" &&
    payments.some(isActivePayment)
  ) {
    return showFieldError(
      formElement,
      "saleStatus",
      "Anula o revierte primero todos los cobros contabilizados"
    );
  }
  if (saleStatus === "Cancelada" && !cancelReason) {
    return showFieldError(formElement, "cancelReason", "Indica el motivo de la cancelación");
  }

  const saleId = id || makeId("sale");
  const installments = readInstallmentPlan(saleId, saleDate, commissionAmount);
  if (!installments) return;
  const dueDate = installments.map((installment) => installment.dueDate).sort()[0] || "";
  const sale = {
    id: saleId,
    clientId,
    project,
    unit,
    developer: String(data.get("developer") || "").trim(),
    saleStatus,
    salePrice,
    saleCurrency,
    saleDate,
    deliveryDate,
    sharedSale,
    externalAgent: sharedSale ? externalAgent : "",
    commissionRate,
    commissionAmount,
    commissionCurrency,
    commissionDueDate: dueDate,
    cancelReason: saleStatus === "Cancelada" ? cancelReason : "",
    cancelledAt:
      saleStatus === "Cancelada"
        ? current?.cancelledAt || new Date().toISOString()
        : "",
    notes: String(data.get("notes") || "").trim(),
    createdAt: id ? current?.createdAt || today() : today(),
    updatedAt: today()
  };
  let savedSale = sale;
  let savedInstallments = installments;
  if (!DEMO_MODE) {
    try {
      const result = await performCloudMutation(() =>
        cloudBackend.saveSale(sale, installments)
      );
      savedSale = result?.sale || result?.sales?.[0] || sale;
      savedInstallments = result?.installments || installments;
    } catch (error) {
      showBackendError(error);
      return;
    }
  }
  if (id) {
    state.sales = state.sales.map((item) => (item.id === id ? savedSale : item));
    recordAudit("update", "sale", id, saleLabel(savedSale));
  } else {
    state.sales.push(savedSale);
    recordAudit("create", "sale", savedSale.id, saleLabel(savedSale));
  }
  state.installments = state.installments
    .filter((installment) => installment.saleId !== saleId)
    .concat(savedInstallments);
  resetSaleForm();
  renderAll();
  closeDrawer(false);
  showToast(id ? "Venta actualizada" : "Venta guardada");
});

document.querySelector("#cancelSaleEdit").addEventListener("click", () => closeDrawer());
document.querySelector("#saleSearch").addEventListener("input", renderSales);
document.querySelector("#saleStatusFilter").addEventListener("change", renderSales);
document.querySelector("#paymentSaleId").addEventListener("change", updatePaymentContext);
document.querySelector("#fillPendingAmount").addEventListener("click", () => {
  const form = document.querySelector("#paymentForm");
  const sale = saleById(form.elements.saleId.value);
  if (!sale) return;
  form.elements.amount.value = fromCents(
    pendingForSaleCents(sale, form.elements.id.value)
  ).toFixed(2);
  form.elements.amount.focus();
});

document.querySelector("#paymentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  clearFormErrors(formElement);
  const data = new FormData(formElement);
  const id = String(data.get("id") || "");
  const current = paymentById(id);
  const sale = saleById(String(data.get("saleId") || ""));
  const amount = numberValue(data.get("amount"));
  const amountCents = toCents(amount);
  const paymentDate = String(data.get("paymentDate") || today());
  const method = String(data.get("method") || "Otro");
  const reference = String(data.get("reference") || "").trim();
  if (!sale) {
    return showFieldError(formElement, "saleId", "Selecciona una venta");
  }
  if (isCancelledSale(sale)) {
    return showFieldError(
      formElement,
      "saleId",
      "No se puede cobrar una venta cancelada"
    );
  }
  if (!isClosedSale(sale)) {
    return showFieldError(
      formElement,
      "saleId",
      "La operación debe estar Contratada o Entregada antes de cobrar comisión"
    );
  }
  if (amountCents <= 0) {
    return showFieldError(
      formElement,
      "amount",
      "Indica un monto mayor que cero"
    );
  }
  if (paymentDate > today()) {
    return showFieldError(
      formElement,
      "paymentDate",
      "Un cobro contabilizado no puede tener fecha futura"
    );
  }
  if (paymentDate < sale.saleDate) {
    return showFieldError(
      formElement,
      "paymentDate",
      "El cobro no puede ser anterior a la venta"
    );
  }
  if (method !== "Efectivo" && !reference) {
    return showFieldError(
      formElement,
      "reference",
      "Indica la referencia del cobro"
    );
  }
  if (amountCents > pendingForSaleCents(sale, id)) {
    return showFieldError(
      formElement,
      "amount",
      "El cobro supera la comisión pendiente"
    );
  }
  if (
    reference &&
    state.payments.some(
      (payment) =>
        payment.id !== id &&
        isActivePayment(payment) &&
        normalizeText(payment.reference) === normalizeText(reference)
    )
  ) {
    return showFieldError(
      formElement,
      "reference",
      "Ya existe un cobro con esa referencia"
    );
  }
  const nextInstallment = nextOpenInstallment(sale, id);
  const paymentId = id || formElement.dataset.pendingPaymentId || makeId("payment");
  formElement.dataset.pendingPaymentId = paymentId;
  const payment = {
    id: paymentId,
    saleId: sale.id,
    installmentId:
      nextInstallment && amountCents <= nextInstallment.pendingCents
        ? nextInstallment.id
        : "",
    amount,
    currency: sale.commissionCurrency,
    paymentDate,
    method,
    reference,
    notes: String(data.get("notes") || "").trim(),
    status: "Contabilizado",
    voidReason: "",
    voidedAt: "",
    createdAt: id ? current?.createdAt || today() : today(),
    updatedAt: today()
  };
  let savedPayment = payment;
  if (!DEMO_MODE) {
    if (id) {
      showToast("Los cobros contabilizados no se editan; anúlalos y registra uno nuevo", 5000);
      return;
    }
    try {
      savedPayment = await performCloudMutation(() => cloudBackend.savePayment(payment));
    } catch (error) {
      showBackendError(error);
      return;
    }
  }
  if (id) {
    state.payments = state.payments.map((item) =>
      item.id === id ? savedPayment : item
    );
    recordAudit("update", "payment", id, reference || saleLabel(sale));
  } else {
    state.payments.push(savedPayment);
    recordAudit("create", "payment", savedPayment.id, reference || saleLabel(sale));
  }
  delete formElement.dataset.pendingPaymentId;
  resetPaymentForm();
  renderAll();
  closeDrawer(false);
  showToast(id ? "Cobro actualizado" : "Cobro guardado");
});

document.querySelector("#cancelPaymentEdit").addEventListener("click", () => closeDrawer());
document.querySelector("#paymentSearch").addEventListener("input", renderPayments);
document.querySelectorAll("[data-collection-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    collectionFilter = button.dataset.collectionFilter;
    renderCollectionQueue();
  });
});
["reportYear", "reportProject", "reportSaleStatus", "reportCommissionStatus"].forEach(
  (id) => document.querySelector("#" + id).addEventListener("change", renderReports)
);
document.querySelector("#exportSalesButton").addEventListener("click", exportSalesCsv);
document.querySelector("#exportPaymentsButton").addEventListener("click", exportPaymentsCsv);
document.querySelector("#exportBackupButton").addEventListener("click", exportBackup);
document.querySelector("#importBackupButton").addEventListener("click", () => {
  document.querySelector("#importBackupInput").click();
});
document.querySelector("#importBackupInput").addEventListener("change", (event) => {
  importBackup(event.target.files?.[0]);
  event.target.value = "";
});

document.querySelector("#loadDemoButton").addEventListener("click", async () => {
  if (!DEMO_MODE) return;
  const confirmation = await requestConfirmation({
    title: "Restaurar demostración",
    message:
      "Los datos actuales se reemplazarán por registros ficticios para continuar la prueba local.",
    confirmLabel: "Restaurar demo"
  });
  if (!confirmation.confirmed) return;
  state = clone(DEMO_DATA);
  storageHealthy = true;
  storageIssue = "";
  recordAudit("restore", "demo", "local", "Datos demo restaurados");
  resetClientForm();
  resetSaleForm();
  resetPaymentForm();
  renderAll();
  document.querySelector(".data-menu").open = false;
  showToast("Datos demo restaurados");
});

document.querySelector("#resetDataButton").addEventListener("click", async () => {
  if (!DEMO_MODE) return;
  const confirmation = await requestConfirmation({
    title: "Vaciar datos locales",
    message:
      "Se eliminarán todos los clientes, ventas y cobros guardados en este navegador.",
    confirmLabel: "Vaciar datos"
  });
  if (!confirmation.confirmed) return;
  state = clone(EMPTY_STATE);
  storageHealthy = true;
  storageIssue = "";
  localStorage.removeItem(STORAGE_KEY);
  recordAudit("reset", "storage", "local", "Datos locales vaciados");
  resetClientForm();
  resetSaleForm();
  resetPaymentForm();
  renderAll();
  document.querySelector(".data-menu").open = false;
  showToast("Datos locales eliminados");
});

document.querySelector("#detailEditButton").addEventListener("click", (event) => {
  if (!detailRecord) return;
  const record = { ...detailRecord };
  closeDrawer(false, false);
  if (record.type === "client") startClientEdit(record.id, event.currentTarget);
  else startSaleEdit(record.id, event.currentTarget);
});

document.querySelector("#detailPrimaryButton").addEventListener("click", (event) => {
  if (!detailRecord) return;
  const record = { ...detailRecord };
  closeDrawer(false, false);
  if (record.type === "client") {
    switchView("sales", true, false);
    resetSaleForm();
    setFormValue(document.querySelector("#saleForm"), "clientId", record.id);
    openDrawer("saleForm", event.currentTarget);
    return;
  }
  switchView("payments", true, false);
  resetPaymentForm();
  setFormValue(document.querySelector("#paymentForm"), "saleId", record.id);
  updatePaymentContext();
  openDrawer("paymentForm", event.currentTarget);
});

document.querySelector("#drawerBackdrop").addEventListener("click", () => closeDrawer());
document.querySelectorAll("[data-close-drawer]").forEach((button) => {
  button.addEventListener("click", () => closeDrawer());
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.querySelector("#confirmDialog")?.open) {
    return;
  }
  if (!activeDrawer) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target instanceof Element ? event.target : null;
    const clientRecord = target?.closest("[data-view-client]");
    const saleRecord = target?.closest("[data-view-sale]");
    if (!clientRecord && !saleRecord) return;
    event.preventDefault();
    if (clientRecord) {
      openRecordDetail("client", clientRecord.dataset.viewClient, clientRecord);
    } else {
      openRecordDetail("sale", saleRecord.dataset.viewSale, saleRecord);
    }
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    closeDrawer();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...activeDrawer.querySelectorAll(
    'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((element) => !element.hidden);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

document.addEventListener("click", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const registerPayment = target?.closest("[data-register-payment]");
  const viewClient = target?.closest("[data-view-client]");
  const viewSale = target?.closest("[data-view-sale]");
  const editClient = target?.closest("[data-edit-client]");
  const deleteClient = target?.closest("[data-delete-client]");
  const editSale = target?.closest("[data-edit-sale]");
  const deleteSale = target?.closest("[data-delete-sale]");
  const editPayment = target?.closest("[data-edit-payment]");
  const voidPayment = target?.closest("[data-void-payment]");

  if (registerPayment) {
    resetPaymentForm();
    setFormValue(
      document.querySelector("#paymentForm"),
      "saleId",
      registerPayment.dataset.registerPayment
    );
    updatePaymentContext();
    openDrawer("paymentForm", registerPayment);
    return;
  }
  if (viewClient) {
    openRecordDetail("client", viewClient.dataset.viewClient, viewClient);
    return;
  }
  if (viewSale) {
    openRecordDetail("sale", viewSale.dataset.viewSale, viewSale);
    return;
  }
  if (editClient) return startClientEdit(editClient.dataset.editClient, editClient);
  if (deleteClient) {
    const id = deleteClient.dataset.deleteClient;
    if (state.sales.some((sale) => sale.clientId === id)) {
      showToast("No se puede eliminar un cliente con ventas");
      return;
    }
    const confirmation = await requestConfirmation({
      title: "Eliminar cliente",
      message:
        "Se eliminará este contacto. Esta acción no puede deshacerse.",
      confirmLabel: "Eliminar cliente"
    });
    if (!confirmation.confirmed) return;
    const client = clientById(id);
    if (!DEMO_MODE) {
      try {
        await performCloudMutation(() => cloudBackend.deleteClient(id));
      } catch (error) {
        showBackendError(error);
        return;
      }
    }
    state.clients = state.clients.filter((item) => item.id !== id);
    recordAudit("delete", "client", id, client?.name || "");
    renderAll();
    showToast("Cliente eliminado");
    return;
  }
  if (editSale) return startSaleEdit(editSale.dataset.editSale, editSale);
  if (deleteSale) {
    if (!DEMO_MODE) {
      showToast("En producción las operaciones se conservan para auditoría; márcala Cancelada");
      return;
    }
    const id = deleteSale.dataset.deleteSale;
    if (paymentsForSale(id).length) {
      showToast("La venta tiene cobros: edítala y márcala Cancelada");
      return;
    }
    const confirmation = await requestConfirmation({
      title: "Eliminar operación",
      message:
        "Se eliminará esta venta sin cobros. Esta acción no puede deshacerse.",
      confirmLabel: "Eliminar operación"
    });
    if (!confirmation.confirmed) return;
    const sale = saleById(id);
    if (!DEMO_MODE) {
      try {
        await performCloudMutation(() => cloudBackend.deleteSale(id));
      } catch (error) {
        showBackendError(error);
        return;
      }
    }
    state.sales = state.sales.filter((item) => item.id !== id);
    state.installments = state.installments.filter(
      (installment) => installment.saleId !== id
    );
    recordAudit("delete", "sale", id, saleLabel(sale));
    renderAll();
    showToast("Venta eliminada");
    return;
  }
  if (editPayment) return startPaymentEdit(editPayment.dataset.editPayment, editPayment);
  if (voidPayment) {
    const payment = paymentById(voidPayment.dataset.voidPayment);
    if (!payment || !isActivePayment(payment)) return;
    const confirmation = await requestConfirmation({
      title: "Anular cobro",
      message:
        "El movimiento quedará en el historial y dejará de contar en los totales.",
      confirmLabel: "Anular cobro",
      requireReason: true
    });
    if (!confirmation.confirmed) return;
    const reason = confirmation.reason;
    let voidedPayment = {
      ...payment,
      status: "Anulado",
      voidReason: reason,
      voidedAt: new Date().toISOString(),
      updatedAt: today()
    };
    if (!DEMO_MODE) {
      try {
        const result = await performCloudMutation(() =>
          cloudBackend.voidPayment(payment.id, reason)
        );
        voidedPayment = result?.payment || result;
      } catch (error) {
        showBackendError(error);
        return;
      }
    }
    state.payments = state.payments.map((item) =>
      item.id === payment.id ? voidedPayment : item
    );
    recordAudit("void", "payment", payment.id, reason);
    resetPaymentForm();
    renderAll();
    showToast("Cobro anulado y conservado en el historial");
  }
});

let authActionBusy = false;
const AUTH_FORM_IDS = ["loginForm", "recoveryForm", "passwordSetupForm"];

function setAuthFormStatus(formId, statusId, message, stateName) {
  const shell = document.querySelector("#authShell");
  const form = document.querySelector(`#${formId}`);
  const status = document.querySelector(`#${statusId}`);
  const nextState = stateName || "idle";
  shell.dataset.state = nextState;
  form.setAttribute("aria-busy", String(nextState === "loading"));
  status.dataset.state = nextState;
  status.textContent = message;
}

function setLoginStatus(message, stateName) {
  setAuthFormStatus("loginForm", "loginStatus", message, stateName);
}

function setRecoveryStatus(message, stateName) {
  setAuthFormStatus("recoveryForm", "recoveryStatus", message, stateName);
}

function setPasswordSetupStatus(message, stateName) {
  setAuthFormStatus("passwordSetupForm", "passwordSetupStatus", message, stateName);
}

function showAuthForm(formId) {
  AUTH_FORM_IDS.forEach((id) => {
    document.querySelector(`#${id}`).hidden = id !== formId;
  });
  refreshIcons();
}

function showLoginShell(formId = "loginForm") {
  const shell = document.querySelector("#authShell");
  const app = document.querySelector("#crmApp");
  shell.hidden = false;
  app.hidden = true;
  app.setAttribute("inert", "");
  app.setAttribute("aria-hidden", "true");
  showAuthForm(formId);
  if (formId === "loginForm") {
    document.querySelector("#loginPassword").value = "";
    window.setTimeout(() => document.querySelector("#loginEmail").focus(), 0);
  } else if (formId === "recoveryForm") {
    window.setTimeout(() => document.querySelector("#recoveryEmail").focus(), 0);
  } else {
    document.querySelector("#newPassword").value = "";
    document.querySelector("#confirmPassword").value = "";
    window.setTimeout(() => document.querySelector("#newPassword").focus(), 0);
  }
}

function showPasswordSetupShell(session, allowCancel = false) {
  currentSession = session || currentSession;
  passwordSetupRequired = true;
  showLoginShell("passwordSetupForm");
  document.querySelector("#passwordSetupEmail").textContent =
    currentSession?.user?.email || "Cuenta autorizada";
  document.querySelector("#passwordSetupCancelButton").hidden = !allowCancel;
  setPasswordSetupStatus(
    "Crea una contraseña de al menos 12 caracteres para activar el acceso.",
    "idle"
  );
}

function clearAuthLinkFromUrl() {
  if (!window.location.hash) return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

function recoveryRedirectUrl() {
  if (IS_LOCAL_HOST) return "https://antonyrealestate.com/crm/";
  return new URL("./", window.location.href).href;
}

function showCrmShell(emailLabel) {
  const shell = document.querySelector("#authShell");
  const app = document.querySelector("#crmApp");
  shell.hidden = true;
  app.hidden = false;
  app.removeAttribute("inert");
  app.setAttribute("aria-hidden", "false");
  document.querySelector("#currentUserEmail").textContent = emailLabel;
  document.querySelector("#logoutButton").hidden = DEMO_MODE;
  document.querySelector("#changePasswordButton").hidden = DEMO_MODE;
}

async function enterCloudSession(session) {
  if (!session?.user) {
    currentSession = null;
    cloudReady = false;
    showLoginShell();
    return;
  }
  currentSession = session;
  cloudReady = false;
  storageHealthy = true;
  storageIssue = "";
  setLoginStatus("Abriendo tu cartera segura…", "loading");
  try {
    state = normalizeState(await cloudBackend.loadWorkspace());
    cloudReady = true;
    showCrmShell(session.user.email || "Usuario autorizado");
    resetClientForm();
    resetSaleForm();
    resetPaymentForm();
    renderWorkspaceContext();
    renderAll(false);
    switchView(viewFromHash(), false, false);
    setLoginStatus("Acceso autorizado.", "success");
  } catch (error) {
    reportBackendDiagnostic("loadWorkspace", error);
    cloudReady = false;
    storageHealthy = false;
    storageIssue = cloudBackend.humanizeError(error);
    setLoginStatus(storageIssue, "error");
    showLoginShell();
  }
}

async function initializeApplication() {
  document.body.dataset.environment = DEMO_MODE ? "local" : "production";
  refreshIcons();
  if (DEMO_MODE) {
    cloudReady = false;
    showCrmShell("Modo local de prueba");
    resetFormDates();
    resetClientForm();
    resetSaleForm();
    resetPaymentForm();
    renderWorkspaceContext();
    renderAll();
    switchView(viewFromHash(), false, false);
    return;
  }
  if (!cloudBackend?.configured) {
    storageHealthy = false;
    storageIssue = "El backend seguro todavía no está configurado.";
    setLoginStatus(storageIssue, "error");
    document.querySelector("#loginSubmitButton").disabled = true;
    showLoginShell();
    return;
  }
  try {
    const session = await cloudBackend.getSession();
    if (session && passwordSetupRequired) {
      showPasswordSetupShell(session);
    } else if (session) await enterCloudSession(session);
    else if (passwordSetupRequired) {
      showLoginShell("recoveryForm");
      setRecoveryStatus(
        "El enlace expiró o ya fue utilizado. Solicita uno nuevo para continuar.",
        "error"
      );
    }
    else {
      setLoginStatus("Usa las credenciales autorizadas para esta oficina privada.", "idle");
      showLoginShell();
    }
    cloudBackend.onAuthStateChange((event, nextSession) => {
      if (event === "SIGNED_OUT") {
        currentSession = null;
        cloudReady = false;
        state = clone(EMPTY_STATE);
        passwordSetupRequired = false;
        clearAuthLinkFromUrl();
        setLoginStatus("La sesión se cerró correctamente.", "idle");
        showLoginShell();
      } else if (event === "PASSWORD_RECOVERY") {
        passwordSetupRequired = true;
        showPasswordSetupShell(nextSession);
      } else if (event === "SIGNED_IN" && passwordSetupRequired) {
        showPasswordSetupShell(nextSession);
      } else if (event === "TOKEN_REFRESHED") {
        currentSession = nextSession;
      }
    });
  } catch (error) {
    reportBackendDiagnostic("initializeApplication", error);
    setLoginStatus(cloudBackend.humanizeError(error), "error");
    showLoginShell();
  }
}

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (DEMO_MODE || authActionBusy) return;
  const email = document.querySelector("#loginEmail").value.trim();
  const password = document.querySelector("#loginPassword").value;
  authActionBusy = true;
  setLoginStatus("Verificando acceso…", "loading");
  try {
    const result = await cloudBackend.signIn(email, password);
    await enterCloudSession(result.session);
  } catch (error) {
    reportBackendDiagnostic("signIn", error);
    setLoginStatus(cloudBackend.humanizeError(error), "error");
    document.querySelector("#loginPassword").select();
  } finally {
    authActionBusy = false;
  }
});

document.querySelector("#forgotPasswordButton").addEventListener("click", () => {
  document.querySelector("#recoveryEmail").value =
    document.querySelector("#loginEmail").value.trim();
  setRecoveryStatus(
    "Solo las cuentas previamente autorizadas pueden recuperar el acceso.",
    "idle"
  );
  showLoginShell("recoveryForm");
});

document.querySelector("#recoveryBackButton").addEventListener("click", () => {
  passwordSetupRequired = false;
  clearAuthLinkFromUrl();
  document.querySelector("#loginEmail").value =
    document.querySelector("#recoveryEmail").value.trim();
  setLoginStatus("Usa las credenciales autorizadas para esta oficina privada.", "idle");
  showLoginShell();
});

document.querySelector("#passwordSetupRecoveryButton").addEventListener("click", () => {
  document.querySelector("#recoveryEmail").value =
    currentSession?.user?.email || document.querySelector("#loginEmail").value.trim();
  setRecoveryStatus("Solicita un enlace nuevo para establecer tu contraseña.", "idle");
  showLoginShell("recoveryForm");
});

document.querySelector("#changePasswordButton").addEventListener("click", () => {
  if (DEMO_MODE || !currentSession?.user) return;
  document.querySelector(".data-menu")?.removeAttribute("open");
  showPasswordSetupShell(currentSession, true);
  setPasswordSetupStatus(
    "Escribe una contraseña nueva de al menos 12 caracteres.",
    "idle"
  );
});

document.querySelector("#passwordSetupCancelButton").addEventListener("click", () => {
  if (!currentSession?.user) return;
  passwordSetupRequired = false;
  document.querySelector("#newPassword").value = "";
  document.querySelector("#confirmPassword").value = "";
  showCrmShell(currentSession.user.email || "Usuario autorizado");
  switchView(viewFromHash(), false, false);
});

document.querySelector("#recoveryForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (DEMO_MODE || authActionBusy) return;
  const email = document.querySelector("#recoveryEmail").value.trim();
  authActionBusy = true;
  setRecoveryStatus("Enviando enlace seguro…", "loading");
  try {
    await cloudBackend.requestPasswordReset(email, recoveryRedirectUrl());
    setRecoveryStatus(
      "Si el correo está autorizado, recibirás un enlace para crear una contraseña nueva.",
      "success"
    );
  } catch (error) {
    setRecoveryStatus(cloudBackend.humanizeError(error), "error");
  } finally {
    authActionBusy = false;
  }
});

document.querySelector("#passwordSetupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (DEMO_MODE || authActionBusy) return;
  const password = document.querySelector("#newPassword").value;
  const confirmation = document.querySelector("#confirmPassword").value;
  if (password !== confirmation) {
    setPasswordSetupStatus("Las contraseñas no coinciden.", "error");
    document.querySelector("#confirmPassword").select();
    return;
  }
  if (password.length < 12 || password.length > 128) {
    setPasswordSetupStatus(
      "La contraseña debe tener entre 12 y 128 caracteres.",
      "error"
    );
    document.querySelector("#newPassword").focus();
    return;
  }
  authActionBusy = true;
  setPasswordSetupStatus("Protegiendo tu cuenta…", "loading");
  try {
    await cloudBackend.updatePassword(password);
    const session = await cloudBackend.getSession();
    if (!session?.user) throw new Error("La sesión de recuperación ya no es válida.");
    passwordSetupRequired = false;
    clearAuthLinkFromUrl();
    document.querySelector("#newPassword").value = "";
    document.querySelector("#confirmPassword").value = "";
    setPasswordSetupStatus("Contraseña guardada. Abriendo tu oficina…", "success");
    await enterCloudSession(session);
  } catch (error) {
    setPasswordSetupStatus(cloudBackend.humanizeError(error), "error");
  } finally {
    authActionBusy = false;
  }
});

document.querySelector("#logoutButton").addEventListener("click", async () => {
  if (DEMO_MODE || appBusy) return;
  setAppBusy(true);
  try {
    await cloudBackend.signOut();
  } catch (error) {
    showBackendError(error);
  } finally {
    setAppBusy(false);
  }
});

window.addEventListener("popstate", () => switchView(viewFromHash(), false, true));
window.addEventListener("storage", (event) => {
  if (!DEMO_MODE) return;
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try {
    state = normalizeState(JSON.parse(event.newValue));
    storageHealthy = true;
    storageIssue = "";
    renderAll(false);
    showToast("Datos sincronizados desde otra pestaña");
  } catch (error) {
    storageHealthy = false;
    storageIssue = "Otra pestaña guardó datos inválidos; se bloqueó la sincronización.";
    renderStorageStatus();
    showToast(storageIssue, 5000);
  }
});

initializeApplication();
window.addEventListener("load", refreshIcons);
