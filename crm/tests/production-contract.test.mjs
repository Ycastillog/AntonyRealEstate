import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoDir = fileURLToPath(new URL("../../", import.meta.url));
const htmlPath = fileURLToPath(new URL("../index.html", import.meta.url));
const appPath = fileURLToPath(new URL("../app.js", import.meta.url));
const backendPath = fileURLToPath(new URL("../backend.js", import.meta.url));
const historicalPath = fileURLToPath(new URL("../historical.js", import.meta.url));
const mediaConfigPath = fileURLToPath(new URL("../../media-config.js", import.meta.url));
const portalHtmlPath = fileURLToPath(new URL("../../portal/index.html", import.meta.url));
const adminPath = fileURLToPath(new URL("../../admin.js", import.meta.url));

const [html, app, backend, historical, portalHtml, admin] = await Promise.all([
  readFile(htmlPath, "utf8"),
  readFile(appPath, "utf8"),
  readFile(backendPath, "utf8"),
  readFile(historicalPath, "utf8"),
  readFile(portalHtmlPath, "utf8"),
  readFile(adminPath, "utf8")
]);

function tagsNamed(source, name) {
  return [...source.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map(
    (match) => match[0]
  );
}

function attributesFor(tag) {
  const attributes = new Map();
  for (const match of tag.matchAll(
    /\s([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
  )) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function tagWithId(source, tagName, id) {
  return tagsNamed(source, tagName).find(
    (tag) => attributesFor(tag).get("id") === id
  );
}

function cspDirectives(value) {
  const directives = new Map();
  for (const rawDirective of String(value || "").split(";")) {
    const tokens = rawDirective.trim().split(/\s+/).filter(Boolean);
    if (tokens.length) directives.set(tokens[0], tokens.slice(1));
  }
  return directives;
}

function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

test("CRM JavaScript entry points parse without syntax errors", () => {
  for (const path of [appPath, backendPath, historicalPath, mediaConfigPath]) {
    const result = spawnSync(process.execPath, ["--check", path], {
      cwd: repoDir,
      encoding: "utf8"
    });
    assert.equal(result.status, 0, `${path}\n${result.stderr}`);
  }
});

test("HTML ids are unique and JavaScript's direct id selectors have targets", () => {
  const ids = tagsNamed(html, "[a-z][a-z0-9-]*")
    .map((tag) => attributesFor(tag).get("id"))
    .filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, "There are duplicate HTML ids");

  const literalSelectors = [
    ...app.matchAll(/\bquerySelector(?:All)?\(\s*(?:"([^"]+)"|'([^']+)')\s*\)/g)
  ].map((match) => match[1] ?? match[2]);
  const selectorIds = literalSelectors.flatMap((selector) =>
    [...selector.matchAll(/#([A-Za-z][\w-]*)/g)].map((match) => match[1])
  );
  selectorIds.push(
    ...[...app.matchAll(/\bgetElementById\(\s*["']([A-Za-z][\w-]*)["']\s*\)/g)].map(
      (match) => match[1]
    )
  );
  const idSet = new Set(ids);
  const missing = [...new Set(selectorIds)].filter((id) => !idSet.has(id));
  assert.deepEqual(missing, [], `Missing HTML targets: ${missing.join(", ")}`);
});

test("authentication is a real gated screen with no prefilled password", () => {
  const authShell = tagWithId(html, "main", "authShell");
  const appShell = tagWithId(html, "main", "crmApp");
  const loginForm = tagWithId(html, "form", "loginForm");
  const recoveryForm = tagWithId(html, "form", "recoveryForm");
  const passwordSetupForm = tagWithId(html, "form", "passwordSetupForm");
  const changePasswordButton = tagWithId(html, "button", "changePasswordButton");
  const passwordSetupCancelButton = tagWithId(html, "button", "passwordSetupCancelButton");
  const email = tagWithId(html, "input", "loginEmail");
  const password = tagWithId(html, "input", "loginPassword");
  const newPassword = tagWithId(html, "input", "newPassword");
  const confirmPassword = tagWithId(html, "input", "confirmPassword");

  assert.ok(authShell, "Missing #authShell");
  assert.ok(appShell, "Missing #crmApp");
  assert.ok(loginForm, "Missing #loginForm");
  assert.ok(recoveryForm, "Missing #recoveryForm");
  assert.ok(passwordSetupForm, "Missing #passwordSetupForm");
  assert.ok(changePasswordButton, "Missing #changePasswordButton");
  assert.ok(passwordSetupCancelButton, "Missing #passwordSetupCancelButton");
  assert.ok(email, "Missing #loginEmail");
  assert.ok(password, "Missing #loginPassword");
  assert.ok(newPassword, "Missing #newPassword");
  assert.ok(confirmPassword, "Missing #confirmPassword");
  assert.equal(attributesFor(email).get("type"), "email");
  assert.equal(attributesFor(email).get("autocomplete"), "username");
  assert.equal(attributesFor(password).get("type"), "password");
  assert.equal(attributesFor(password).get("autocomplete"), "current-password");
  assert.ok(!attributesFor(password).has("value"), "Password must not be prefilled");
  for (const input of [newPassword, confirmPassword]) {
    assert.equal(attributesFor(input).get("type"), "password");
    assert.equal(attributesFor(input).get("autocomplete"), "new-password");
    assert.equal(attributesFor(input).get("minlength"), "12");
    assert.ok(!attributesFor(input).has("value"), "New passwords must not be prefilled");
  }
  assert.ok(attributesFor(recoveryForm).has("hidden"));
  assert.ok(attributesFor(passwordSetupForm).has("hidden"));
  for (const form of [loginForm, recoveryForm, passwordSetupForm]) {
    assert.equal(attributesFor(form).get("method"), "post");
    assert.equal(attributesFor(form).get("action"), "./");
  }

  const appAttributes = attributesFor(appShell);
  assert.ok(appAttributes.has("hidden"), "CRM shell must start hidden");
  assert.ok(appAttributes.has("inert"), "Hidden CRM shell must start inert");
  assert.equal(appAttributes.get("aria-hidden"), "true");
  assert.match(app, /cloudBackend\.getSession\(\)/);
  assert.match(app, /cloudBackend\.signIn\(email, password\)/);
  assert.match(app, /cloudBackend\.requestPasswordReset\(email, recoveryRedirectUrl\(\)\)/);
  assert.match(app, /cloudBackend\.updatePassword\(password\)/);
  assert.match(app, /#changePasswordButton/);
  assert.match(app, /event === "PASSWORD_RECOVERY"/);
  assert.match(app, /cloudBackend\.signOut\(\)/);
  assert.match(app, /function reportBackendDiagnostic\(scope, error\)/);
});

test("Supabase and Lucide are version-pinned and protected by SRI", () => {
  const externalScripts = tagsNamed(html, "script")
    .map((tag) => ({ tag, attributes: attributesFor(tag) }))
    .filter(({ attributes }) => /^https:\/\//.test(attributes.get("src") || ""));

  const requirements = [
    {
      label: "Supabase",
      matches: (src) => src.includes("/@supabase/supabase-js@"),
      pinned: /\/@supabase\/supabase-js@\d+\.\d+\.\d+\//
    },
    {
      label: "Lucide",
      matches: (src) => src.includes("/lucide@"),
      pinned: /\/lucide@\d+\.\d+\.\d+\//
    }
  ];

  for (const requirement of requirements) {
    const script = externalScripts.find(({ attributes }) =>
      requirement.matches(attributes.get("src") || "")
    );
    assert.ok(script, `Missing ${requirement.label} CDN script`);
    const src = script.attributes.get("src");
    assert.match(src, requirement.pinned, `${requirement.label} must pin an exact version`);
    assert.doesNotMatch(src, /@(latest|next|canary|\^|~)/i);
    assert.match(
      script.attributes.get("integrity") || "",
      /^sha384-[A-Za-z0-9+/]+={0,2}$/,
      `${requirement.label} must provide a sha384 integrity hash`
    );
    assert.equal(script.attributes.get("crossorigin"), "anonymous");
    assert.ok(script.attributes.has("defer"), `${requirement.label} must be deferred`);
  }
});

test("CSP limits scripts, connections, objects, base URLs, and form targets", () => {
  const cspMeta = tagsNamed(html, "meta").find((tag) => {
    const attributes = attributesFor(tag);
    return (attributes.get("http-equiv") || "").toLowerCase() === "content-security-policy";
  });
  assert.ok(cspMeta, "Missing Content-Security-Policy meta tag");

  const directives = cspDirectives(attributesFor(cspMeta).get("content"));
  assert.deepEqual(directives.get("default-src"), ["'self'"]);
  assert.ok(directives.get("script-src")?.includes("'self'"));
  assert.ok(directives.get("script-src")?.includes("https://cdn.jsdelivr.net"));
  assert.ok(!directives.get("script-src")?.includes("'unsafe-inline'"));
  assert.ok(!directives.get("script-src")?.includes("'unsafe-eval'"));
  assert.ok(directives.get("connect-src")?.includes("https://*.supabase.co"));
  assert.ok(directives.get("connect-src")?.includes("wss://*.supabase.co"));
  assert.deepEqual(directives.get("object-src"), ["'none'"]);
  assert.deepEqual(directives.get("base-uri"), ["'self'"]);
  assert.deepEqual(directives.get("form-action"), ["'self'"]);
  assert.equal(
    tagsNamed(html, "script").filter((tag) => !attributesFor(tag).has("src")).length,
    0,
    "CSP-compatible page must not contain inline scripts"
  );
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, "CSP-compatible page must not use inline handlers");
});

test("CRM contains no embedded admin password or password comparison", () => {
  const crmSource = `${html}\n${app}\n${backend}`;
  assert.doesNotMatch(
    crmSource,
    /\b(?:ADMIN_PASSWORD|CRM_PASSWORD|DEFAULT_PASSWORD|adminPassword|hardcodedPassword)\b/i
  );
  assert.doesNotMatch(html, /<input\b[^>]*\btype=["']password["'][^>]*\bvalue\s*=/i);
  assert.doesNotMatch(
    app,
    /\b(?:password|contrase(?:ñ|n)a)\s*={2,3}\s*["'`][^"'`]+["'`]/i
  );
  assert.doesNotMatch(app, /\b(?:prompt|confirm)\s*\(/);
});

test("backend adapter never reads or writes browser storage for business data", () => {
  const executableBackend = withoutComments(backend);
  assert.doesNotMatch(
    executableBackend,
    /\b(?:localStorage|sessionStorage|indexedDB)\b/,
    "Only the Supabase auth client may manage its own session storage"
  );
  assert.match(backend, /auth:\s*{[\s\S]*?storageKey:\s*AUTH_STORAGE_KEY[\s\S]*?}/);
});

test("backend names every workspace table and required RPC contract", () => {
  for (const table of [
    "crm_clients",
    "crm_sales",
    "crm_commission_installments",
    "crm_payments",
    "crm_sale_unit_changes",
    "crm_historical_import_batches",
    "crm_historical_sales",
    "crm_audit_log"
  ]) {
    assert.match(backend, new RegExp(`["']${table}["']`), `Missing table ${table}`);
  }

  for (const rpc of [
    "crm_save_sale",
    "crm_change_sale_contract",
    "crm_record_payment",
    "crm_void_payment",
    "crm_import_workspace",
    "crm_import_historical_sales",
    "crm_update_historical_contact",
    "crm_enrich_historical_contacts"
  ]) {
    assert.match(
      backend,
      new RegExp(`\\.rpc\\(["']${rpc}["']`),
      `Missing RPC call ${rpc}`
    );
  }
  assert.match(backend, /p_sale:\s*mapSaleToDatabase/);
  assert.match(backend, /p_installments:\s*mapToDatabase/);
  assert.match(backend, /p_payment:\s*mapToDatabase/);
  assert.match(backend, /p_payment_id:\s*safeId/);
  assert.match(backend, /p_batch:\s*mapToDatabase/);
  assert.match(backend, /p_rows:\s*mapToDatabase/);
  assert.match(backend, /p_reason:\s*safeReason/);
  assert.match(
    backend,
    /\.rpc\(["']crm_import_workspace["']\s*,\s*{\s*p_state\s*:/,
    "crm_import_workspace must use the SQL parameter name p_state"
  );
});

test("legacy historical data remains compatible but is retired from the CRM navigation", () => {
  for (const id of [
    "view-historical",
    "historicalImportButton",
    "historicalImportInput",
    "historicalOverviewTotal",
    "historicalOverviewVolume",
    "historicalBody",
    "exportHistoricalButton",
    "historicalContactForm",
    "historicalContactSubmitButton"
  ]) {
    assert.ok(html.includes(`id="${id}"`), `Missing #${id}`);
  }
  const historicalView = tagWithId(html, "section", "view-historical");
  const historicalAttributes = attributesFor(historicalView);
  assert.ok(historicalAttributes.has("hidden"));
  assert.ok(historicalAttributes.has("inert"));
  assert.doesNotMatch(html, /data-view-target=["']historical["']/);
  assert.match(html, /Estas operaciones cuentan en ventas, años, proyectos y volumen/);
  assert.match(app, /no crearán comisiones ni cobros/i);
  assert.match(app, /function activeHistoricalSales\(\)/);
  assert.match(app, /function analyticsSales\(\)/);
  assert.match(app, /if \(hash === "historico"\)[\s\S]*?#reportes/);
  const reportableSource = app.slice(
    app.indexOf("function reportableSales()"),
    app.indexOf("function installmentById")
  );
  assert.doesNotMatch(reportableSource, /activeHistoricalSales|historicalAnalyticsSale/);
  const dashboardSource = app.slice(
    app.indexOf("function renderDashboard()"),
    app.indexOf("function renderClients()")
  );
  assert.doesNotMatch(dashboardSource, /activeHistoricalSales|historicalAnalyticsSale/);
  assert.doesNotMatch(dashboardSource, /documentedClosings|documentedSales/);
  assert.match(dashboardSource, /renderMonthlyChart\(operationalClosings\)/);
  assert.match(app, /function renderHistoricalSales\(\)/);
  assert.match(app, /cloudBackend\.importHistoricalSales\(batch, rows\)/);
  assert.match(app, /cloudBackend\.updateHistoricalContact/);
  assert.match(app, /cloudBackend\.enrichHistoricalContacts/);
  assert.match(historical, /MAX_ROWS\s*=\s*5000/);
  assert.match(historical, /parseHistoricalContactUpdates/);
  assert.match(historical, /sourceSnapshot/);
  assert.match(historical, /sha256/);
  assert.doesNotMatch(
    historical,
    /buyer_name\s*:\s*["'][^"']+["']|buyer_email\s*:\s*["'][^"']+@/i,
    "the parser must not embed buyer records or email addresses"
  );
});

test("commission reports reconcile each installment and support export and printable PDF", () => {
  for (const id of [
    "view-reports",
    "reportYear",
    "reportSearch",
    "reportPeriodType",
    "reportYearLabel",
    "reportFilterToggle",
    "reportFilterCount",
    "reportFilters",
    "reportDeveloper",
    "reportProject",
    "reportSaleStatus",
    "reportCommissionStatus",
    "reportCutoffTitle",
    "reportSalesCount",
    "reportCommission",
    "reportReceived",
    "reportPending",
    "reportCollectible",
    "reportScheduled",
    "reportOverdue",
    "reportAging",
    "reportPriorityList",
    "reportRefreshIndicator",
    "reportUpcomingMeta",
    "clearReportFilters",
    "reportCollectionRate",
    "reportInstallmentCount",
    "reportBody",
    "reportLedger",
    "reportPagination",
    "reportPrevPage",
    "reportPageRange",
    "reportPageStatus",
    "reportNextPage",
    "reportMobileList",
    "exportSalesButton",
    "printCommissionReportButton"
  ]) {
    assert.ok(html.includes(`id="${id}"`), `Missing #${id}`);
  }
  assert.match(html, /Conciliación por cuota/);
  assert.match(html, /Avances y saldos/);
  assert.match(html, /Pendientes y programadas/);
  assert.match(app, /function reportInstallmentStatus\(/);
  assert.match(app, /function filteredReportInstallments\(/);
  assert.match(app, /\["Pendiente", "Programada"\]\.includes\(status\)/);
  assert.match(app, /pendingCents: isCancelledSale\(sale\) \? 0/);
  assert.match(app, /function exportSalesCsv\(/);
  assert.match(app, /antony-reporte-comisiones-/);
  assert.match(app, /function printCommissionReport\(/);
  assert.match(app, /Reporte de comisiones por constructora/);
  assert.match(app, /sale\.developer === developer/);
  assert.match(app, /function reportInstallmentsForSales\(/);
  assert.match(app, /function renderReportCommandCenter\(/);
  assert.match(app, /function reportSaleMatchesSearch\(/);
  assert.match(app, /function reportDueContext\(/);
  assert.match(app, /function reportPeriodInstallmentsForSales\(/);
  assert.match(app, /function reportPaymentContext\(/);
  assert.match(app, /function reportPaidCents\(/);
  assert.match(app, /const REPORT_PAGE_SIZE = 10/);
  assert.match(app, /function paginatedReportInstallments\(/);
  assert.match(app, /function activeReportFilterCount\(/);
  assert.match(app, /function resetReportPageAndRender\(/);
  assert.match(app, /Resumen por constructora/);
  assert.match(app, /const developerSummaryRows =/);
  assert.match(app, /Fechas de cobro/);
  assert.match(app, /Métodos de cobro/);
  assert.match(app, /Referencias/);
  assert.match(app, /"1–30 días"/);
  assert.match(app, /"Más de 90 días"/);
  assert.match(app, /Confirmar entrega/);
  assert.match(app, /isReportInstallmentOverdue/);
  assert.match(app, /\{ label: "Parcial vencida", className: "status-overdue" \}/);
  assert.match(app, /\["Vencida", "Parcial vencida"\]/);
  assert.match(html, /Pendiente contractual/);
  assert.match(html, /Programado para entrega/);
  assert.match(html, /Estado de la cuota \(detalle\)/);
  assert.match(html, /Vencimiento de cuota/);
  assert.match(html, /Fecha de cobro/);
  assert.match(app, /lastWorkspaceSyncAt/);
  assert.match(app, /Próximos 30 días/);
  assert.match(app, /Todos los vencimientos/);
  assert.match(app, /Todos los cobros registrados/);
  assert.match(app, /activePaymentsForSale\(sale\.id\)\.some/);
  assert.match(html, /production-v15/);
});

test("signed unit changes carry the paid advance and recalculate only the balance", () => {
  assert.ok(tagWithId(html, "button", "startContractChangeButton"));
  assert.ok(tagWithId(html, "label", "contractChangeReasonWrap"));
  assert.match(app, /function contractChangeEligibility\(/);
  assert.match(app, /advance\.paidCents !== advance\.amountCents/);
  assert.match(app, /balance\.paidCents > 0/);
  assert.match(app, /commissionCents - eligibility\.advancePaidCents/);
  assert.match(app, /cloudBackend\.changeSaleContract/);
  assert.match(app, /state\.saleUnitChanges\.push/);
  assert.match(backend, /crm_change_sale_contract/);
});

test("production workflows retain capture date, cancellation reason, installments, and payment export", () => {
  const capturedAt = tagWithId(html, "input", "capturedAt");
  assert.ok(capturedAt, "Missing #capturedAt");
  assert.equal(attributesFor(capturedAt).get("name"), "capturedAt");
  assert.equal(attributesFor(capturedAt).get("type"), "date");
  assert.ok(attributesFor(capturedAt).has("required"));

  assert.ok(tagWithId(html, "section", "installmentPlanner"));
  assert.ok(tagWithId(html, "div", "installmentRows"));
  assert.ok(tagWithId(html, "select", "commissionPlanType"));
  assert.ok(tagWithId(html, "input", "advancePercentage"));
  assert.match(html, /data-advance-preset="50"/);
  assert.match(html, /data-advance-preset="80"/);
  assert.ok(tagWithId(html, "label", "cancelReasonWrap"));
  assert.ok(tagWithId(html, "button", "exportPaymentsButton"));

  assert.match(app, /const capturedAt = String\(data\.get\("capturedAt"\)/);
  assert.match(app, /capturedAt > today\(\)/);
  assert.match(
    app,
    /TERMINAL_SALE_STATUSES\.includes\(saleStatus\) && !cancelReason/
  );
  assert.match(app, /form\.elements\.cancelReason\.required = terminal/);
  assert.match(app, /function readInstallmentPlan\(/);
  assert.match(app, /function renderSelectedCommissionPlan\(/);
  assert.match(app, /label: "Avance"/);
  assert.match(app, /label: "Saldo"/);
  assert.match(app, /label: "Pago único"/);
  assert.match(app, /scheduledCents !== toCents\(commissionAmount\)/);
  assert.match(app, /cloudBackend\.saveSale\(sale, installments\)/);
  assert.match(app, /function exportPaymentsCsv\(\)/);
  assert.match(app, /"Motivo de anulación", "Notas"/);
  assert.match(
    app,
    /querySelector\("#exportPaymentsButton"\)\.addEventListener\("click", exportPaymentsCsv\)/
  );
});

test("desisted and changed sales are archived outside active sales and collections", () => {
  assert.ok(tagWithId(html, "strong", "terminalSaleNoticeTitle"));
  assert.ok(tagWithId(html, "small", "terminalSaleNoticeText"));
  assert.match(html, /id="saleStatusFilter"[\s\S]{0,220}<option value="">Operaciones activas<\/option>/);
  assert.match(html, /<option value="all">Todas, incluyendo archivadas<\/option>/);
  assert.match(html, /Desistió \(archivada\)/);
  assert.match(html, /Cambio \(archivada\)/);

  assert.match(app, /function activeOperationalSales\(\)/);
  assert.match(
    app,
    /status === "all"[\s\S]{0,180}!isCancelledSale\(sale\)/,
    "The default sales list must hide terminal operations"
  );
  assert.match(
    app,
    /sale\.clientId === client\.id && !isCancelledSale\(sale\)/,
    "Client sale counts must exclude archived operations"
  );
  assert.match(app, /const recent = operationalSales/);
  assert.match(app, /if \(!sale \|\| isCancelledSale\(sale\)\) return 0;/);
  assert.match(app, /No se puede cobrar una operación desistida o cambiada/);
  assert.match(app, /title: saleStatus === "Cambio" \? "Archivar operación anterior" : "Confirmar desistimiento"/);
  assert.match(app, /Venta desistida y archivada; ya no cuenta en ventas ni cobros/);
  assert.match(app, /Operación archivada/);
  assert.match(app, /Archivada — no cobrable/);
});

test("client feedback fields and collection visibility remain wired end to end", () => {
  assert.match(
    html,
    /name="propertyStage"[\s\S]{0,320}>En planos \/ En construcción</
  );
  for (const zone of [
    "Santo Domingo Norte",
    "Santo Domingo Este",
    "Santo Domingo Oeste",
    "Distrito Nacional",
    "Punta Cana",
    "El Cibao",
    "El Sur",
    "El Norte"
  ]) {
    assert.match(html, new RegExp(`<option value="${zone}">${zone}</option>`));
  }
  assert.match(html, /name="deliveryDate"[^>]+type="date"/);
  assert.match(html, /name="sharedSale"[^>]+type="checkbox"/);
  assert.match(html, /name="externalAgent"[^>]+maxlength="200"/);
  assert.ok(tagWithId(html, "strong", "collectionOverdueValue"));
  assert.ok(tagWithId(html, "strong", "collectionPendingValue"));
  assert.ok(tagWithId(html, "strong", "collectionReceivedValue"));
  assert.match(html, /Buscar nombre, teléfono, correo, proyecto o unidad/);
  assert.match(app, /client\?\.phone[\s\S]{0,80}client\?\.email/);
  assert.match(html, /data-collection-filter="all"[^>]+aria-pressed="true"/);

  assert.match(app, /let collectionFilter = "all"/);
  assert.match(app, /state\.sales\.filter\(\(sale\) => !isCancelledSale\(sale\)\)/);
  assert.match(app, /relatedOperations[\s\S]{0,220}sale\.project[\s\S]{0,100}sale\.unit/);
  assert.match(app, /data-installment-percentage/);
  assert.match(app, /commissionCents \* advancePercentage/);
  assert.match(app, /scheduledPercentage/);
  assert.match(app, /sharedSale && !externalAgent/);
  assert.match(app, /deliveryDate < saleDate/);
  assert.match(app, /externalAgent: sharedSale \? externalAgent : ""/);
  assert.match(app, /function syncBalanceDueDateWithDelivery\(/);
  assert.match(app, /const VALID_INSTALLMENT_KINDS = \["advance", "balance", "single"\]/);
  assert.match(
    app,
    /isDeliveredSale\(sale\)[\s\S]{0,120}\["advance", "single"\]\.includes\(installment\.installmentKind\)/
  );
  assert.match(app, /installmentId: nextInstallment\.id/);
  assert.match(app, /payment\.installmentId[\s\S]{0,180}toCents\(payment\.amount\)/);
  assert.match(
    app,
    /nextInstallment\.installmentKind\s*===\s*"balance"[\s\S]{0,160}paymentDate\s*<\s*sale\.deliveryDate/
  );
  assert.match(
    app,
    /installment\.installmentKind\s*===\s*"balance"[\s\S]{0,180}payment\.paymentDate\s*<\s*sale\.deliveryDate/
  );
  assert.doesNotMatch(app, /saleStatus === "Entregado" && !deliveryDate\) \{\s*deliveryDate = today\(\)/);
  assert.match(app, /collectiblePendingForSaleCents\(sale/);
});

test("required contacts, LVP catalog, safe backup, and reserved receivables stay enforced", () => {
  assert.ok(tagWithId(html, "form", "clientForm"));
  assert.match(html, /name="phone"[^>]+required/);
  assert.match(html, /name="email"[^>]+required/);
  assert.match(html, /id="saleDeveloper"[\s\S]{0,160}Constructora LVP/);
  assert.ok(
    html.indexOf('id="saleDeveloper"') < html.indexOf('id="saleProject"'),
    "Constructora must appear before Proyecto"
  );
  assert.match(html, /id="saleProject"[^>]+disabled/);
  assert.match(app, /"Altos del este"/);
  assert.match(app, /"Riviera 4"/);
  assert.match(app, /"LP11 ABEY"/);
  assert.match(app, /"East Town"/);
  assert.match(app, /function updateProjectCatalog\(/);
  assert.match(app, /DEVELOPER_PROJECTS\[selectedDeveloper\]/);
  assert.match(app, /const pending = activeSales\.reduce/);
  assert.match(app, /const pendingSales = activeSales/);
  assert.match(app, /const backupData = \{[\s\S]{0,180}payments: state\.payments/);
  assert.doesNotMatch(
    app.match(/function exportBackup\(\)[\s\S]*?\n\}/)?.[0] || "",
    /auditLog/
  );
  assert.match(backend, /'desiredZone', 'propertyStage'/);
  assert.doesNotMatch(html, /Descargar respaldo \(\.json\)|Importar respaldo \(\.json\)/);
  assert.doesNotMatch(html, /id="exportBackupButton"|id="importBackupButton"/);
});

test("local demo and cloud production paths stay separated", () => {
  assert.match(app, /const IS_LOCAL_HOST = \["localhost", "127\.0\.0\.1", "::1"\]/);
  assert.match(app, /const DEMO_MODE = IS_LOCAL_HOST && QUERY\.get\("cloud"\) !== "1"/);
  assert.doesNotMatch(
    app,
    /QUERY\.get\("demo"\) === "1"/,
    "A public query string must never enable local business-data storage"
  );
  assert.match(app, /function loadState\(\)\s*{\s*if \(!DEMO_MODE\) return clone\(EMPTY_STATE\)/);
  assert.match(
    app,
    /function saveState\(\)\s*{\s*if \(!DEMO_MODE\) return true;[\s\S]{0,220}localStorage\.setItem/
  );
  assert.match(app, /if \(DEMO_MODE\) {[\s\S]{0,400}showCrmShell\("Modo local de prueba"\)/);
  assert.match(app, /state = normalizeState\(await cloudBackend\.loadWorkspace\(\)\)/);
  assert.match(app, /document\.body\.dataset\.environment = DEMO_MODE \? "local" : "production"/);
  assert.match(app, /remove\.hidden = !DEMO_MODE/);
  assert.match(
    app,
    /if \(deleteSale\)\s*{\s*if \(!DEMO_MODE\)\s*{[\s\S]{0,220}return;/,
    "Hard deletion of sales must stay confined to local demo mode"
  );
});

test("prototype-pollution keys are blocked and Escape preserves an open confirmation", () => {
  for (const key of ["__proto__", "prototype", "constructor"]) {
    assert.match(backend, new RegExp(`["']${key}["']\\s*:\\s*true`));
  }
  assert.match(backend, /if \(BLOCKED_KEYS\[key\]\)\s*{\s*return;/);

  const confirmationGuard = app.indexOf(
    'event.key === "Escape" && document.querySelector("#confirmDialog")?.open'
  );
  const drawerEscape = app.indexOf('if (event.key === "Escape")', confirmationGuard + 1);
  const closeDrawer = app.indexOf("closeDrawer();", drawerEscape);
  assert.ok(confirmationGuard >= 0, "Missing Escape guard for the confirmation dialog");
  assert.ok(drawerEscape > confirmationGuard, "Confirmation guard must run first");
  assert.ok(closeDrawer > drawerEscape, "Drawer close must remain behind its Escape branch");
  assert.match(app.slice(confirmationGuard, drawerEscape), /{\s*return;\s*}/);
});

test("content portal is portable to a new Supabase project and requires admin app_metadata", () => {
  const portalLoginForm = tagWithId(portalHtml, "form", "loginForm");
  const evidenceForm = tagWithId(portalHtml, "form", "evidenceForm");
  const propertyForm = tagWithId(portalHtml, "form", "propertyForm");
  const cspMeta = tagsNamed(portalHtml, "meta").find((tag) =>
    /content-security-policy/i.test(attributesFor(tag).get("http-equiv") || "")
  );
  const csp = cspDirectives(attributesFor(cspMeta).get("content"));
  assert.ok(csp.get("connect-src").includes("https://*.supabase.co"));
  assert.ok(csp.get("connect-src").includes("wss://*.supabase.co"));
  for (const form of [portalLoginForm, evidenceForm, propertyForm]) {
    assert.ok(form, "Missing protected portal form");
    assert.equal(attributesFor(form).get("method"), "post");
    assert.equal(attributesFor(form).get("action"), "./");
  }
  assert.match(portalHtml, /No subas contratos, identificaciones, comprobantes/i);
  assert.match(admin, /function isPortalAdmin\(user\)/);
  assert.match(admin, /function reportPortalDiagnostic\(scope, error, reason/);
  assert.match(admin, /sessionValidationPromise && sessionValidationToken === token/);
  assert.match(admin, /attempt < 2 && !verifiedUser/);
  assert.match(admin, /user\.app_metadata\.role/);
  assert.match(admin, /const DEMO_ALLOWED = isLoopback\(window\.location\.hostname\)/);
  assert.doesNotMatch(admin, /DEMO_REQUESTED\s*\|\|\s*isLoopback/);
});
