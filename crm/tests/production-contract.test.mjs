import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoDir = fileURLToPath(new URL("../../", import.meta.url));
const htmlPath = fileURLToPath(new URL("../index.html", import.meta.url));
const appPath = fileURLToPath(new URL("../app.js", import.meta.url));
const backendPath = fileURLToPath(new URL("../backend.js", import.meta.url));
const mediaConfigPath = fileURLToPath(new URL("../../media-config.js", import.meta.url));
const portalHtmlPath = fileURLToPath(new URL("../../portal/index.html", import.meta.url));
const adminPath = fileURLToPath(new URL("../../admin.js", import.meta.url));

const [html, app, backend, portalHtml, admin] = await Promise.all([
  readFile(htmlPath, "utf8"),
  readFile(appPath, "utf8"),
  readFile(backendPath, "utf8"),
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
  for (const path of [appPath, backendPath, mediaConfigPath]) {
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
    "crm_audit_log"
  ]) {
    assert.match(backend, new RegExp(`["']${table}["']`), `Missing table ${table}`);
  }

  for (const rpc of [
    "crm_save_sale",
    "crm_record_payment",
    "crm_void_payment",
    "crm_import_workspace"
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
  assert.match(backend, /p_reason:\s*safeReason/);
  assert.match(
    backend,
    /\.rpc\(["']crm_import_workspace["']\s*,\s*{\s*p_state\s*:/,
    "crm_import_workspace must use the SQL parameter name p_state"
  );
});

test("production workflows retain capture date, cancellation reason, installments, and payment export", () => {
  const capturedAt = tagWithId(html, "input", "capturedAt");
  assert.ok(capturedAt, "Missing #capturedAt");
  assert.equal(attributesFor(capturedAt).get("name"), "capturedAt");
  assert.equal(attributesFor(capturedAt).get("type"), "date");
  assert.ok(attributesFor(capturedAt).has("required"));

  assert.ok(tagWithId(html, "section", "installmentPlanner"));
  assert.ok(tagWithId(html, "div", "installmentRows"));
  assert.ok(tagWithId(html, "button", "splitInstallmentsButton"));
  assert.ok(tagWithId(html, "button", "addInstallmentButton"));
  assert.ok(tagWithId(html, "label", "cancelReasonWrap"));
  assert.ok(tagWithId(html, "button", "exportPaymentsButton"));

  assert.match(app, /const capturedAt = String\(data\.get\("capturedAt"\)/);
  assert.match(app, /capturedAt > today\(\)/);
  assert.match(app, /saleStatus === "Cancelada" && !cancelReason/);
  assert.match(app, /form\.elements\.cancelReason\.required = cancelled/);
  assert.match(app, /function readInstallmentPlan\(/);
  assert.match(app, /scheduledCents !== toCents\(commissionAmount\)/);
  assert.match(app, /cloudBackend\.saveSale\(sale, installments\)/);
  assert.match(app, /function exportPaymentsCsv\(\)/);
  assert.match(app, /"Motivo de anulación", "Notas"/);
  assert.match(
    app,
    /querySelector\("#exportPaymentsButton"\)\.addEventListener\("click", exportPaymentsCsv\)/
  );
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
  assert.match(admin, /user\.app_metadata\.role/);
  assert.match(admin, /const DEMO_ALLOWED = isLoopback\(window\.location\.hostname\)/);
  assert.doesNotMatch(admin, /DEMO_REQUESTED\s*\|\|\s*isLoopback/);
});
