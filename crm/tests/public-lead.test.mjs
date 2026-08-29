import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const [html, app, styles, sql, sharedSetup] = await Promise.all([
  readFile(`${root}/index.html`, "utf8"),
  readFile(`${root}/app.js`, "utf8"),
  readFile(`${root}/styles.css`, "utf8"),
  readFile(`${root}/supabase-production-setup.sql`, "utf8"),
  readFile(`${root}/supabase-shared-workspace-setup.sql`, "utf8")
]);

function functionBlock(name) {
  const pattern = new RegExp(
    `create\\s+function\\s+public\\.${name}\\s*\\([^)]*jsonb[^)]*\\)[\\s\\S]*?\\$function\\$;`,
    "i"
  );
  const match = sql.match(pattern);
  assert.ok(match, `Missing ${name}(jsonb)`);
  return match[0];
}

test("public lead form collects the CRM contact contract and privacy consent", () => {
  for (const field of [
    "clientName",
    "clientPhone",
    "clientEmail",
    "clientBudget",
    "clientBudgetCurrency",
    "clientZone",
    "clientPropertyStage",
    "clientIntent",
    "clientMessage",
    "privacyConsent",
    "companyWebsite"
  ]) {
    assert.match(html, new RegExp(`name=["']${field}["']`));
  }

  assert.match(html, /name="clientName"[^>]*required/);
  assert.match(html, /name="clientPhone"[^>]*required/);
  assert.match(html, /name="clientEmail"[^>]*required/);
  assert.match(html, /name="privacyConsent"[^>]*required/);
  assert.match(html, /id="leadFormStatus"[^>]*role="status"/);
  assert.match(html, /id="leadWhatsappFollowup"[^>]*hidden/);
  assert.match(html, /public-leads-v1/);
  assert.match(styles, /\.lead-trap\s*\{/);
  assert.match(styles, /\.lead-form-status\[data-state="success"\]/);
});

test("public page submits only to the isolated RPC and preserves WhatsApp fallback", () => {
  assert.doesNotThrow(() => new vm.Script(app));
  assert.match(app, /\/rest\/v1\/rpc\/crm_submit_public_lead/);
  assert.match(app, /JSON\.stringify\(\{ p_payload: payload \}\)/);
  assert.match(app, /privacy_consent:\s*privacyConsent/);
  assert.match(app, /page_path:\s*window\.location\.pathname/);
  assert.match(app, /result\.accepted !== true/);
  assert.match(app, /leadWhatsappFollowup\.href = whatsappUrl/);
  assert.doesNotMatch(app, /\/rest\/v1\/crm_clients(?:\?|["'`])/);
  assert.doesNotMatch(app, /service[_-]?role|sb_secret_/i);
});

test("public lead RPC is fail-closed, deduplicated, rate-limited and write-only", () => {
  const definition = functionBlock("crm_submit_public_lead");

  assert.match(definition, /security\s+definer/i);
  assert.match(definition, /set\s+search_path\s*=\s*pg_catalog\s*,\s*pg_temp/i);
  assert.match(definition, /crm_public_lead_settings[\s\S]*enabled\s+is\s+true/i);
  assert.match(definition, /jsonb_object_keys\(p_payload\)/i);
  assert.match(definition, /privacy_consent/i);
  assert.match(definition, /companyWebsite|website/i);
  assert.match(definition, /pg_advisory_xact_lock/i);
  assert.match(definition, /interval\s+'1 minute'/i);
  assert.match(definition, /interval\s+'1 day'/i);
  assert.match(definition, /interval\s+'15 minutes'/i);
  assert.match(definition, /lower\(btrim\(c\.email\)\)\s*=\s*v_email/i);
  assert.match(definition, /regexp_replace\(c\.phone,[\s\S]*?=\s*v_phone_digits/i);
  assert.match(
    definition,
    /insert\s+into\s+public\.crm_clients[\s\S]*?'Página web'\s*,\s*'Nuevo'/i
  );
  assert.match(definition, /return\s+jsonb_build_object\('accepted'\s*,\s*true\)/i);
  assert.doesNotMatch(definition, /p_payload\s*->>\s*'owner_id'/i);
  assert.doesNotMatch(definition, /return\s+to_jsonb\(v_|returning\s+\*/i);

  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.crm_submit_public_lead\(jsonb\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i
  );
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.crm_submit_public_lead\(jsonb\)\s+to\s+anon/i
  );
  assert.doesNotMatch(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.crm_submit_public_lead\(jsonb\)\s+to\s+authenticated/i
  );
});

test("lead intake tables have no direct browser privileges and shared setup enables one workspace", () => {
  for (const table of [
    "crm_public_lead_settings",
    "crm_public_lead_submissions"
  ]) {
    assert.match(sql, new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter\\s+table\\s+public\\.%I\\s+enable\\s+row\\s+level\\s+security`, "i"));
  }
  assert.match(
    sql,
    /revoke all privileges on table public\.%I from public, anon, authenticated/i
  );
  assert.match(sharedSetup, /insert\s+into\s+public\.crm_public_lead_settings/i);
  assert.match(sharedSetup, /enabled\s*=\s*true/i);
  assert.doesNotMatch(sharedSetup, /@(hotmail|gmail|outlook)\.com/i);
});
