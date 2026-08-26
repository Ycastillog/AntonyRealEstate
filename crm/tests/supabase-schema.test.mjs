import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sqlPath = fileURLToPath(
  new URL("../../supabase-production-setup.sql", import.meta.url)
);

async function readOptionalSql() {
  try {
    return await readFile(sqlPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

const sql = await readOptionalSql();
const sqlTestOptions = sql
  ? {}
  : { skip: "supabase-production-setup.sql is not present yet" };

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function functionSignature(name) {
  const match = sql?.match(
    new RegExp(
      `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${escapeRegExp(name)}\\s*\\(([^)]*)\\)`,
      "i"
    )
  );
  return match ? match[1] : null;
}

function functionDefinition(name) {
  const match = sql?.match(
    new RegExp(
      `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${escapeRegExp(name)}\\s*\\([^)]*\\)[\\s\\S]*?\\$function\\$\\s*;`,
      "i"
    )
  );
  return match?.[0] || null;
}

test("production schema defines every CRM table and critical business column", sqlTestOptions, () => {
  const tables = [
    "crm_clients",
    "crm_sales",
    "crm_commission_installments",
    "crm_payments",
    "crm_audit_log"
  ];

  for (const table of tables) {
    assert.match(
      sql,
      new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}\\s*\\(`, "i"),
      `Missing table public.${table}`
    );
  }

  assert.match(sql, /create\s+table[\s\S]*?public\.crm_clients\s*\([\s\S]*?captured_at\s+timestamptz\s+not\s+null/i);
  assert.match(sql, /public\.crm_clients\s*\([\s\S]*?phone\s+text\s+not\s+null[\s\S]*?email\s+text\s+not\s+null/i);
  assert.match(sql, /public\.crm_clients\s*\([\s\S]*?property_stage\s+text\s+not\s+null\s+default\s+'Sin definir'/i);
  assert.match(sql, /create\s+table[\s\S]*?public\.crm_sales\s*\([\s\S]*?cancel_reason\s+text/i);
  assert.match(sql, /public\.crm_sales\s*\([\s\S]*?delivery_date\s+date[\s\S]*?shared_sale\s+boolean\s+not\s+null[\s\S]*?external_agent\s+text/i);
  assert.match(sql, /public\.crm_commission_installments[\s\S]*?sale_id\s+text\s+not\s+null[\s\S]*?due_date\s+date\s+not\s+null/i);
  assert.match(sql, /public\.crm_payments[\s\S]*?installment_id\s+text[\s\S]*?void_reason\s+text/i);
  assert.match(sql, /primary\s+key\s*\(owner_id\s*,\s*id\s*\)/i);
  assert.match(sql, /crm_clients_contact_check[\s\S]{0,220}phone[\s\S]{0,120}\band\b[\s\S]{0,120}email/i);
  assert.match(sql, /Cada cliente del respaldo debe incluir teléfono y correo electrónico/i);
});

test("RLS policies isolate each CRM table by authenticated owner", sqlTestOptions, () => {
  const rlsBlock = sql.match(/do\s+\$crm_rls\$([\s\S]*?)\$crm_rls\$\s*;/i)?.[1];
  assert.ok(rlsBlock, "Missing the $crm_rls$ policy block");

  for (const table of [
    "crm_clients",
    "crm_sales",
    "crm_commission_installments",
    "crm_payments",
    "crm_audit_log"
  ]) {
    assert.match(rlsBlock, new RegExp(`["']${table}["']`), `${table} is absent from RLS loop`);
  }

  assert.match(rlsBlock, /enable\s+row\s+level\s+security/i);
  assert.match(rlsBlock, /revoke\s+all\s+privileges[\s\S]*?public\s*,\s*anon\s*,\s*authenticated/i);
  for (const action of ["select", "insert", "update", "delete"]) {
    assert.match(
      rlsBlock,
      new RegExp(`create\\s+policy[\\s\\S]*?for\\s+${action}\\s+to\\s+authenticated`, "i"),
      `Missing authenticated ${action} policy template`
    );
  }
  assert.match(rlsBlock, /owner_id\s*=\s*\(select\s+auth\.uid\(\)\)/i);
  assert.match(
    rlsBlock,
    /if\s+v_table\s*=\s*'crm_clients'/i,
    "Direct writes must be limited to clients; financial mutations go through RPCs"
  );
  assert.doesNotMatch(rlsBlock, /grant[\s\S]{0,80}\bto\s+anon\b/i);
});

test("SQL implements and grants every RPC required by the browser adapter", sqlTestOptions, () => {
  const contracts = new Map([
    ["crm_save_sale", ["p_sale", "p_installments"]],
    ["crm_record_payment", ["p_payment"]],
    ["crm_void_payment", ["p_payment_id", "p_reason"]],
    ["crm_import_workspace", ["p_state"]],
    ["crm_workspace_health", []]
  ]);
  const issues = [];

  for (const [name, parameters] of contracts) {
    const signature = functionSignature(name);
    if (signature === null) {
      issues.push(`missing function public.${name}`);
      continue;
    }
    for (const parameter of parameters) {
      if (!new RegExp(`\\b${parameter}\\b`, "i").test(signature)) {
        issues.push(`public.${name} is missing parameter ${parameter}`);
      }
    }
    const definition = functionDefinition(name);
    if (!definition) {
      issues.push(`public.${name} has no complete function body`);
    } else if (name === "crm_workspace_health") {
      if (!/security\s+invoker/i.test(definition)) {
        issues.push(`public.${name} must remain SECURITY INVOKER`);
      }
      if (!/owner_id\s*=\s*auth\.uid\(\)/i.test(definition)) {
        issues.push(`public.${name} must filter rows by auth.uid()`);
      }
    } else {
      if (!/security\s+definer/i.test(definition)) {
        issues.push(`public.${name} must be SECURITY DEFINER`);
      }
      if (!/set\s+search_path\s*=\s*pg_catalog\s*,\s*pg_temp/i.test(definition)) {
        issues.push(`public.${name} must pin a safe search_path`);
      }
      if (!/auth\.uid\(\)/i.test(definition)) {
        issues.push(`public.${name} must bind mutations to auth.uid()`);
      }
    }
    const grantPattern = new RegExp(
      `grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\s*\\([^;]*?\\)\\s+to\\s+authenticated`,
      "i"
    );
    if (!grantPattern.test(sql)) {
      issues.push(`public.${name} is not granted only through authenticated execute`);
    }
    const revokePattern = new RegExp(
      `revoke\\s+all\\s+on\\s+function\\s+public\\.${name}\\s*\\([^;]*?\\)\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`,
      "i"
    );
    if (!revokePattern.test(sql)) {
      issues.push(`public.${name} lacks the explicit PUBLIC/anon/authenticated revoke`);
    }
  }

  assert.deepEqual(issues, [], issues.join("; "));
});

test("financial validation, audit, timestamp, and immutability triggers are installed", sqlTestOptions, () => {
  const triggers = [
    "crm_clients_identity_bu",
    "crm_clients_touch_bu",
    "crm_clients_audit_aiud",
    "crm_sales_identity_bu",
    "crm_sales_financial_biu",
    "crm_sales_touch_bu",
    "crm_sales_audit_aiud",
    "crm_installments_identity_bu",
    "crm_installments_financial_biu",
    "crm_installments_touch_bu",
    "crm_installments_audit_aiud",
    "crm_payments_identity_bu",
    "crm_payments_financial_biud",
    "crm_payments_touch_bu",
    "crm_payments_audit_aiud",
    "crm_audit_log_immutable_bud",
    "crm_audit_log_immutable_bt"
  ];
  const missing = triggers.filter(
    (trigger) => !new RegExp(`create\\s+trigger\\s+${trigger}\\b`, "i").test(sql)
  );
  assert.deepEqual(missing, [], `Missing triggers: ${missing.join(", ")}`);

  for (const functionName of [
    "crm_validate_sale_financials",
    "crm_validate_installment_financials",
    "crm_validate_payment_financials",
    "crm_write_audit",
    "crm_block_audit_mutation"
  ]) {
    assert.ok(functionSignature(functionName) !== null, `Missing function ${functionName}`);
  }
  assert.match(sql, /crm_audit_log\s+es\s+inmutable/i);
});

test("schema enforces cancellation, installment, payment, and audit invariants", sqlTestOptions, () => {
  assert.match(sql, /status\s*=\s*'Cancelada'[\s\S]{0,180}cancel_reason/i);
  assert.match(sql, /new\.status\s*=\s*'Cancelada'[\s\S]{0,220}requiere\s+cancel_reason/i);
  assert.match(sql, /v_other_planned\s*\+\s*new\.amount\s*>\s*v_commission/i);
  assert.match(sql, /v_other_sale_payments\s*\+\s*new\.amount\s*>\s*v_commission/i);
  assert.match(sql, /insert\s+into\s+public\.crm_audit_log/i);
  assert.match(sql, /before\s+truncate\s+on\s+public\.crm_audit_log/i);
  assert.match(sql, /delivery_date\s+is\s+null\s+or\s+delivery_date\s+>=\s+sale_date/i);
  assert.match(sql, /shared_sale[\s\S]{0,180}external_agent[\s\S]{0,220}not\s+shared_sale/i);
  assert.match(sql, /property_stage\s+in\s*\('Sin definir',\s*'Listo',\s*'En planos'/i);
  assert.match(sql, /v_shared_sale\s*:=\s*coalesce\(\(p_sale\s*->>\s*'shared_sale'\)::boolean,\s*false\)/i);
  assert.match(sql, /delivery_date\s*=\s*v_delivery_date[\s\S]{0,100}external_agent\s*=\s*v_external_agent/i);
});

test("production migration is self-contained and portal writes require an admin role", sqlTestOptions, () => {
  for (const table of ["evidence_items", "property_items"]) {
    assert.match(
      sql,
      new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}\\s*\\(`, "i")
    );
  }
  assert.match(sql, /auth\.jwt\(\)[\s\S]{0,100}app_metadata[\s\S]{0,80}role[\s\S]{0,40}admin/i);
  assert.match(sql, /name\s+like\s*\(\(select\s+auth\.uid\(\)\)::text\s*\|\|\s*'\/%'\)/i);
  assert.match(sql, /crm_import_workspace\s+solo\s+restaura\s+en\s+un\s+workspace\s+completamente\s+vacio/i);
  assert.match(sql, /case\s+when\s+v_status\s*=\s*'Cancelada'\s+then\s+'Reservada'/i);
});

test("database currency and post-payment plan contracts match the UI", sqlTestOptions, () => {
  assert.match(sql, /sale_currency\s+in\s*\('USD'\s*,\s*'DOP'\)/i);
  assert.match(sql, /commission_currency\s+in\s*\('USD'\s*,\s*'DOP'\)/i);
  assert.match(sql, /currency\s+in\s*\('USD'\s*,\s*'DOP'\)/i);
  assert.match(
    sql,
    /El contrato financiero y su plan no cambian despues de contabilizar cobros/i
  );
  assert.match(
    sql,
    /set\s+constraints\s+public\.crm_commission_installments_sequence_key\s+deferred/i
  );
  assert.match(
    sql,
    /set\s+constraints\s+public\.crm_commission_installments_sequence_key\s+immediate/i
  );
  assert.match(sql, /notify\s+pgrst\s*,\s*'reload schema'/i);
  assert.match(
    sql,
    /jsonb_typeof\(p_payment\s*->\s*'amount'\)\s+is\s+distinct\s+from\s+'number'/i
  );
  assert.match(
    sql,
    /amount::text\s+not\s+in\s*\('NaN',\s*'Infinity',\s*'-Infinity'\)/i
  );
});
