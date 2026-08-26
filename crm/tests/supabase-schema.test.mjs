import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sqlPath = fileURLToPath(
  new URL("../../supabase-production-setup.sql", import.meta.url)
);
const acceptancePath = fileURLToPath(
  new URL("./supabase-acceptance.sql", import.meta.url)
);

async function readOptionalFile(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

const sql = await readOptionalFile(sqlPath);
const acceptanceSql = await readOptionalFile(acceptancePath);
const sqlTestOptions = sql
  ? {}
  : { skip: "supabase-production-setup.sql is not present yet" };
const acceptanceTestOptions = acceptanceSql
  ? {}
  : { skip: "crm/tests/supabase-acceptance.sql is not present yet" };

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
    "crm_historical_import_batches",
    "crm_historical_sales",
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
  assert.match(
    sql,
    /public\.crm_historical_import_batches\s*\([\s\S]*?source_sha256\s+text\s+not\s+null[\s\S]*?source_row_count\s+integer\s+not\s+null/i
  );
  assert.match(
    sql,
    /public\.crm_historical_sales\s*\([\s\S]*?batch_id\s+text\s+not\s+null[\s\S]*?buyer_phone\s+text[\s\S]*?review_status\s+text\s+not\s+null[\s\S]*?source_snapshot\s+jsonb\s+not\s+null/i
  );
  assert.match(
    sql,
    /public\.crm_commission_installments[\s\S]*?sale_id\s+text\s+not\s+null[\s\S]*?installment_kind\s+text\s+not\s+null[\s\S]*?due_date\s+date\s+not\s+null/i
  );
  assert.match(sql, /public\.crm_payments[\s\S]*?installment_id\s+text[\s\S]*?void_reason\s+text/i);
  assert.match(
    sql,
    /crm_payments_accounted_installment_check[\s\S]{0,180}status\s*<>\s*'Contabilizado'\s+or\s+installment_id\s+is\s+not\s+null/i
  );
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
    "crm_historical_import_batches",
    "crm_historical_sales",
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
    ["crm_import_historical_sales", ["p_batch", "p_rows"]],
    ["crm_update_historical_contact", ["p_contact"]],
    ["crm_enrich_historical_contacts", ["p_rows"]],
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
    "crm_historical_batches_workspace_lock_bs",
    "crm_historical_batches_identity_bu",
    "crm_historical_batches_touch_bu",
    "crm_historical_batches_audit_aiud",
    "crm_historical_sales_workspace_lock_bs",
    "crm_historical_sales_identity_bu",
    "crm_historical_sales_touch_bu",
    "crm_historical_sales_audit_aiud",
    "crm_installments_identity_bu",
    "crm_installments_financial_biu",
    "crm_installments_touch_bu",
    "crm_installments_audit_aiud",
    "crm_payments_identity_bu",
    "crm_payments_financial_biud",
    "crm_payments_touch_bu",
    "crm_payments_audit_aiud",
    "crm_audit_log_immutable_bud",
    "crm_audit_log_immutable_bt",
    "crm_sales_plan_constraint_aiu",
    "crm_installments_plan_constraint_aiud"
  ];
  const missing = triggers.filter(
    (trigger) =>
      !new RegExp(`create\\s+(?:constraint\\s+)?trigger\\s+${trigger}\\b`, "i").test(sql)
  );
  assert.deepEqual(missing, [], `Missing triggers: ${missing.join(", ")}`);

  for (const functionName of [
    "crm_validate_sale_financials",
    "crm_validate_installment_financials",
    "crm_validate_commission_plan",
    "crm_validate_payment_financials",
    "crm_write_audit",
    "crm_block_audit_mutation"
  ]) {
    assert.ok(functionSignature(functionName) !== null, `Missing function ${functionName}`);
  }
  assert.match(sql, /crm_audit_log\s+es\s+inmutable/i);
});

test("schema enforces terminal, installment, payment, and audit invariants", sqlTestOptions, () => {
  assert.match(sql, /status\s+in\s*\(\s*'Desistió'\s*,\s*'Cambio'\s*\)[\s\S]{0,180}cancel_reason/i);
  assert.match(sql, /new\.status\s+in\s*\(\s*'Desistió'\s*,\s*'Cambio'\s*\)[\s\S]{0,220}requiere\s+cancel_reason/i);
  assert.match(sql, /v_other_planned\s*\+\s*new\.amount\s*>\s*v_commission/i);
  assert.match(sql, /v_other_sale_payments\s*\+\s*new\.amount\s*>\s*v_commission/i);
  assert.match(sql, /insert\s+into\s+public\.crm_audit_log/i);
  assert.match(sql, /before\s+truncate\s+on\s+public\.crm_audit_log/i);
  assert.match(sql, /delivery_date\s+is\s+null\s+or\s+delivery_date\s+>=\s+sale_date/i);
  assert.match(sql, /shared_sale[\s\S]{0,180}external_agent[\s\S]{0,220}not\s+shared_sale/i);
  assert.match(sql, /property_stage\s+in\s*\(\s*'Sin definir'\s*,\s*'Listo'\s*,\s*'En planos \/ En construcción'\s*,\s*'Indiferente'/i);
  assert.match(sql, /v_shared_sale\s*:=\s*coalesce\(\(p_sale\s*->>\s*'shared_sale'\)::boolean,\s*false\)/i);
  assert.match(sql, /delivery_date\s*=\s*v_delivery_date[\s\S]{0,100}external_agent\s*=\s*v_external_agent/i);
});

const lvpProjects = [
  "Altos del este",
  "Riviera 1",
  "Riviera 2",
  "Riviera 3",
  "Riviera 4",
  "Vistas del limonal",
  "Epic Moon",
  "Epic River",
  "Doña Carmen",
  "Las Margaritas",
  "LP12",
  "LP11",
  "LP11 ABEY",
  "East Town"
];

test("closed CRM catalogs, LVP pairs, and legacy mappings are explicit", sqlTestOptions, () => {
  assert.match(
    sql,
    /desired_zone\s+is\s+null[\s\S]{0,260}'Santo Domingo Norte'[\s\S]{0,120}'Santo Domingo Este'[\s\S]{0,120}'Santo Domingo Oeste'[\s\S]{0,120}'Distrito Nacional'[\s\S]{0,120}'Punta Cana'[\s\S]{0,120}'El Cibao'[\s\S]{0,120}'El Sur'[\s\S]{0,120}'El Norte'/i
  );
  assert.match(sql, /when\s+'zona oriental'\s+then\s+'Santo Domingo Este'/i);
  assert.match(
    sql,
    /client\.desired_zone\s+is\s+distinct\s+from\s+normalized\.desired_zone/i
  );
  assert.match(
    sql,
    /set\s+property_stage\s*=\s*'En planos \/ En construcción'[\s\S]{0,100}where\s+property_stage\s+in\s*\(\s*'En planos'\s*,\s*'En construcción'/i
  );
  assert.match(
    sql,
    /status\s+in\s*\(\s*'Reservada'\s*,\s*'Opción a compra firmada'\s*,\s*'Entregado'\s*,\s*'Desistió'\s*,\s*'Cambio'/i
  );
  assert.match(sql, /when\s+'Contratada'\s+then\s+'Opción a compra firmada'/i);
  assert.match(sql, /when\s+'Entregada'\s+then\s+'Entregado'/i);
  assert.match(
    sql,
    /crm_clients_stage_check[\s\S]{0,220}stage\s+in\s*\(\s*'Nuevo'\s*,\s*'Calificado'\s*,\s*'En seguimiento'\s*,\s*'Comprador'\s*,\s*'Inactivo'/i
  );
  assert.doesNotMatch(sql, /when\s+'Cancelada'\s+then\s+'Desistió'/i);
  assert.match(
    sql,
    /where\s+status\s*=\s*'Cancelada'[\s\S]{0,260}requieren revisión manual/i
  );

  const pairConstraint = sql.match(
    /constraint\s+crm_sales_developer_project_check\s+check\s*\(([\s\S]*?)\),\s*constraint\s+crm_sales_status_check/i
  )?.[1];
  assert.ok(pairConstraint, "Missing Constructora LVP/project pair constraint");
  const firstProjectList = pairConstraint.match(/project\s+in\s*\(([\s\S]*?)\)/i)?.[1];
  assert.ok(firstProjectList, "Missing exact LVP project list");
  assert.deepEqual(
    [...firstProjectList.matchAll(/'([^']+)'/g)].map((match) => match[1]),
    lvpProjects
  );
  assert.match(
    pairConstraint,
    /developer\s+is\s+not\s+distinct\s+from\s+'Constructora LVP'/i
  );
  assert.doesNotMatch(pairConstraint, /\bor\s*\(/i);

  for (const definition of [
    functionDefinition("crm_save_sale"),
    functionDefinition("crm_import_workspace"),
    functionDefinition("crm_import_historical_sales")
  ]) {
    assert.ok(definition);
    for (const project of lvpProjects) {
      assert.match(definition, new RegExp(`'${escapeRegExp(project)}'`, "i"));
    }
    assert.match(
      definition,
      /Constructora LVP[\s\S]{0,100}proyecto(?:s)? autorizado(?:s)?/i
    );
  }
  assert.match(
    functionDefinition("crm_import_workspace"),
    /case\s+lower\s*\(\s*btrim\s*\([^)]*developer[^)]*\)\s*\)[\s\S]{0,120}when\s+'lvp'\s+then\s+'Constructora LVP'/i
  );
  assert.match(
    sql,
    /set\s+project\s*=\s*catalog\.canonical_project\s*,\s*developer\s*=\s*'Constructora LVP'/i
  );
  assert.doesNotMatch(
    sql,
    /set\s+project\s*=\s*catalog\.canonical_project\s*,\s*developer\s+is\s+not\s+distinct/i
  );

  assert.match(
    sql,
    /crm_sales_active_project_unit_uidx[\s\S]{0,220}where\s+status\s+not\s+in\s*\(\s*'Desistió'\s*,\s*'Cambio'\s*\)/i
  );
});

test("historical staging is constrained, idempotent, and RPC-only", sqlTestOptions, () => {
  const historicalImport = functionDefinition("crm_import_historical_sales");
  const historicalContactUpdate = functionDefinition("crm_update_historical_contact");
  const historicalContactEnrichment = functionDefinition("crm_enrich_historical_contacts");
  const workspaceImport = functionDefinition("crm_import_workspace");
  assert.ok(historicalImport);
  assert.ok(historicalContactUpdate);
  assert.ok(historicalContactEnrichment);
  assert.ok(workspaceImport);

  assert.match(
    sql,
    /crm_historical_import_batches_owner_sha_key[\s\S]{0,100}unique\s*\(\s*owner_id\s*,\s*source_sha256\s*\)/i
  );
  assert.match(
    sql,
    /crm_historical_import_batches_sha_check[\s\S]{0,180}\^\[0-9a-f\]\{64\}\$/i
  );
  assert.match(
    sql,
    /crm_historical_sales_batch_fk[\s\S]{0,180}references\s+public\.crm_historical_import_batches\s*\(\s*owner_id\s*,\s*id\s*\)/i
  );
  assert.match(
    sql,
    /crm_historical_sales_review_status_check[\s\S]{0,180}'Por completar'[\s\S]{0,80}'Lista para convertir'[\s\S]{0,80}'Convertida'/i
  );
  assert.match(
    sql,
    /crm_historical_sales_advance_check[\s\S]{0,220}advance_percentage\s+is\s+not\s+null[\s\S]{0,100}advance_percentage\s*>\s*0/i
  );
  assert.match(
    sql,
    /crm_historical_sales_ready_check[\s\S]{0,320}sale_status\s+is\s+not\s+null[\s\S]{0,320}commission_plan\s*=\s*'single'[\s\S]{0,180}advance_percentage\s+is\s+not\s+null/i
  );
  assert.match(
    sql,
    /crm_historical_sales_open_project_unit_uidx[\s\S]{0,360}where\s+review_status\s*<>\s*'Convertida'/i
  );
  assert.match(
    sql,
    /crm_audit_log_table_check[\s\S]{0,220}'crm_historical_import_batches'[\s\S]{0,100}'crm_historical_sales'/i
  );

  assert.match(historicalImport, /security\s+definer/i);
  assert.match(
    historicalImport,
    /set\s+search_path\s*=\s*pg_catalog\s*,\s*pg_temp/i
  );
  assert.match(historicalImport, /v_owner\s+uuid\s*:=\s*auth\.uid\(\)/i);
  assert.match(historicalImport, /entre\s+1\s+y\s+5000\s+filas/i);
  assert.match(historicalImport, /limite\s+de\s+10\s+MiB/i);
  assert.match(historicalImport, /jsonb_object_keys\(p_batch\)/i);
  assert.match(historicalImport, /jsonb_object_keys\(v_row\)/i);
  assert.match(
    historicalImport,
    /p_batch\.id debe ser texto o null; la identidad final es server-side/i
  );
  assert.match(
    historicalImport,
    /review_status distinto de Por completar/i
  );
  assert.match(
    historicalImport,
    /regexp_replace\s*\(\s*btrim\s*\(\s*v_row\s*->>\s*'project'/i
  );
  assert.match(
    historicalImport,
    /when\s+'altos del este'\s+then\s+'Altos del este'[\s\S]*?when\s+'east town'\s+then\s+'East Town'/i
  );
  assert.match(
    historicalImport,
    /crm_historical_sales[\s\S]*?review_status\s*<>\s*'Convertida'[\s\S]*?duplica proyecto y unidad en staging histórico no convertido/i
  );
  assert.match(
    historicalImport,
    /crm_sales[\s\S]*?status\s+not\s+in\s*\(\s*'Desistió'\s*,\s*'Cambio'\s*\)[\s\S]*?duplica proyecto y unidad de una venta operativa activa/i
  );
  const saveSale = functionDefinition("crm_save_sale");
  assert.ok(saveSale);
  assert.match(
    saveSale,
    /pg_advisory_xact_lock_shared[\s\S]{0,180}crm_workspace:/i
  );
  assert.match(
    saveSale,
    /crm_historical_sales[\s\S]{0,500}histórico no convertido/i
  );
  assert.match(
    historicalImport,
    /'batchId'[\s\S]{0,180}'alreadyImported'\s*,\s*true[\s\S]*?'alreadyImported'\s*,\s*false/i
  );
  for (const definition of [historicalContactUpdate, historicalContactEnrichment]) {
    assert.match(definition, /security\s+definer/i);
    assert.match(definition, /set\s+search_path\s*=\s*pg_catalog\s*,\s*pg_temp/i);
    assert.match(definition, /v_owner\s+uuid\s*:=\s*auth\.uid\(\)/i);
    assert.match(definition, /owner_id\s*=\s*v_owner/i);
    assert.match(definition, /review_status\s*<>\s*'Convertida'/i);
  }
  assert.match(
    historicalContactUpdate,
    /jsonb_object_keys\(p_contact\)[\s\S]{0,260}'buyer_name'[\s\S]{0,100}'buyer_phone'[\s\S]{0,100}'buyer_email'/i
  );
  assert.match(
    historicalContactUpdate,
    /v_buyer_phone\s+is\s+not\s+null[\s\S]{0,260}regexp_replace\(v_buyer_phone/i
  );
  assert.match(
    historicalContactUpdate,
    /v_buyer_email\s+is\s+not\s+null[\s\S]{0,260}v_buyer_email\s+!~\*/i
  );
  assert.match(
    historicalContactEnrichment,
    /jsonb_array_length\(p_rows\)\s+not\s+between\s+1\s+and\s+5000/i
  );
  assert.match(
    historicalContactEnrichment,
    /buyer_phone\s*=\s*coalesce\(hs\.buyer_phone,\s*v_buyer_phone\)[\s\S]{0,120}buyer_email\s*=\s*coalesce\(hs\.buyer_email,\s*v_buyer_email\)/i
  );
  assert.match(
    historicalContactEnrichment,
    /v_id\s*=\s*any\s*\(v_seen_ids\)/i
  );

  const rlsBlock = sql.match(/do\s+\$crm_rls\$([\s\S]*?)\$crm_rls\$\s*;/i)?.[1];
  assert.ok(rlsBlock);
  assert.match(rlsBlock, /grant\s+select\s+on\s+table/i);
  assert.match(rlsBlock, /if\s+v_table\s*=\s*'crm_clients'/i);
  assert.doesNotMatch(
    rlsBlock,
    /if\s+v_table\s*=\s*'crm_historical_(?:import_batches|sales)'[\s\S]{0,180}grant\s+(?:insert|update|delete)/i
  );

  for (const collection of ["historical_import_batches", "historical_sales"]) {
    assert.match(
      workspaceImport,
      new RegExp(`p_state\\s*->\\s*'${collection}'`, "i")
    );
    assert.match(
      workspaceImport,
      new RegExp(`jsonb_array_elements\\(v_${collection.replace("historical_import_batches", "historical_batches")}\\)`, "i")
    );
  }
  assert.match(
    workspaceImport,
    /insert\s+into\s+public\.crm_historical_import_batches/i
  );
  assert.match(workspaceImport, /insert\s+into\s+public\.crm_historical_sales/i);
  assert.match(
    workspaceImport,
    /historical_batches_upserted[\s\S]{0,120}historical_sales_upserted/i
  );
  assert.match(
    workspaceImport,
    /crm_historical_import_batches\s+where\s+owner_id\s*=\s*v_owner[\s\S]{0,180}crm_historical_sales\s+where\s+owner_id\s*=\s*v_owner/i
  );
});

test("installment_kind is structural, immutable, migrated safely, and totals 100%", sqlTestOptions, () => {
  const installmentTrigger = functionDefinition("crm_validate_installment_financials");
  const planTrigger = functionDefinition("crm_validate_commission_plan");
  const saveSale = functionDefinition("crm_save_sale");
  const importWorkspace = functionDefinition("crm_import_workspace");
  const health = functionDefinition("crm_workspace_health");

  assert.ok(installmentTrigger);
  assert.ok(planTrigger);
  assert.ok(saveSale);
  assert.ok(importWorkspace);
  assert.ok(health);
  assert.match(
    sql,
    /crm_commission_installments_kind_check[\s\S]{0,260}installment_kind\s*=\s*'single'[\s\S]{0,80}sequence\s*=\s*1[\s\S]{0,140}installment_kind\s*=\s*'advance'[\s\S]{0,80}sequence\s*=\s*1[\s\S]{0,140}installment_kind\s*=\s*'balance'[\s\S]{0,80}sequence\s*=\s*2/i
  );
  assert.match(
    sql,
    /crm_commission_installments_label_kind_check[\s\S]{0,260}installment_kind\s*=\s*'advance'\s+and\s+label\s*=\s*'Avance'[\s\S]{0,120}installment_kind\s*=\s*'balance'\s+and\s+label\s*=\s*'Saldo'[\s\S]{0,120}installment_kind\s*=\s*'single'\s+and\s+label\s*=\s*'Pago único'/i
  );
  assert.match(
    sql,
    /alter\s+column\s+installment_kind\s+set\s+not\s+null/i
  );
  assert.match(
    sql,
    /count\(i\.id\)\s+not\s+in\s*\(\s*1\s*,\s*2\s*\)[\s\S]{0,600}planes de comisión con más de 2 cuotas o secuencias ambiguas/i
  );
  assert.match(
    sql,
    /set\s+installment_kind\s*=\s*case[\s\S]{0,240}plan_count\s*=\s*1\s+then\s+'single'[\s\S]{0,180}sequence\s*=\s*1\s+then\s+'advance'[\s\S]{0,180}sequence\s*=\s*2\s+then\s+'balance'/i
  );
  assert.match(
    installmentTrigger,
    /new\.installment_kind\s+is\s+distinct\s+from\s+old\.installment_kind[\s\S]{0,180}inmutables/i
  );
  assert.match(
    installmentTrigger,
    /tg_op\s*=\s*'INSERT'\s+and\s+exists[\s\S]{0,220}existing\.id\s*=\s*new\.id[\s\S]{0,120}return\s+new/i
  );
  assert.match(
    installmentTrigger,
    /new\.label\s*:=\s*case\s+new\.installment_kind[\s\S]{0,100}'advance'\s+then\s+'Avance'[\s\S]{0,100}'balance'\s+then\s+'Saldo'[\s\S]{0,100}'single'\s+then\s+'Pago único'/i
  );
  assert.match(
    planTrigger,
    /v_plan_total\s*<>\s*v_commission[\s\S]*?v_plan_count\s*=\s*1[\s\S]*?v_single_count\s*=\s*1[\s\S]*?v_plan_count\s*=\s*2[\s\S]*?v_advance_count\s*=\s*1[\s\S]*?v_balance_count\s*=\s*1/i
  );
  assert.doesNotMatch(planTrigger, /\blabel\b/i);
  assert.match(
    sql,
    /create\s+constraint\s+trigger\s+crm_sales_plan_constraint_aiu[\s\S]{0,180}deferrable\s+initially\s+deferred/i
  );
  assert.match(
    sql,
    /create\s+constraint\s+trigger\s+crm_installments_plan_constraint_aiud[\s\S]{0,180}deferrable\s+initially\s+deferred/i
  );
  assert.match(saveSale, /El plan requiere exactamente single o advance\(1\)\+balance\(2\)/i);
  assert.match(importWorkspace, /no se autoriza ni se migra a partir de label/i);
  for (const definition of [saveSale, importWorkspace]) {
    assert.match(
      definition,
      /installmentKind[\s\S]{0,180}installment_kind[\s\S]{0,240}no pueden contradecirse/i
    );
    assert.match(
      definition,
      /'installment_kind'\s*,\s*coalesce\s*\([\s\S]{0,180}'installmentKind'[\s\S]{0,180}'installment_kind'/i
    );
  }
  assert.match(
    sql,
    /label\s*=\s*case[\s\S]{0,180}plan_count\s*=\s*1\s+then\s+'Pago único'[\s\S]{0,180}sequence\s*=\s*1\s+then\s+'Avance'[\s\S]{0,180}sequence\s*=\s*2\s+then\s+'Saldo'/i
  );
  assert.match(
    sql,
    /crm_commission_installments_amount_check[\s\S]{0,160}amount\s*>\s*0/i
  );
  assert.match(
    health,
    /coalesce\s*\(\s*i\.single_count[\s\S]*?coalesce\s*\(\s*i\.advance_count[\s\S]*?coalesce\s*\(\s*i\.balance_count[\s\S]*?as\s+plan_matches/i
  );
  assert.match(
    health,
    /ci\.installment_kind\s*=\s*'single'[\s\S]*?ci\.installment_kind\s*=\s*'advance'[\s\S]*?ci\.installment_kind\s*=\s*'balance'/i
  );
});

test("commission collection is installment-bound and balance unlocks only after Entregado", sqlTestOptions, () => {
  const saleTrigger = functionDefinition("crm_validate_sale_financials");
  const paymentTrigger = functionDefinition("crm_validate_payment_financials");
  const recordPayment = functionDefinition("crm_record_payment");

  assert.ok(saleTrigger);
  assert.ok(paymentTrigger);
  assert.ok(recordPayment);

  for (const definition of [paymentTrigger, recordPayment]) {
    assert.match(
      definition,
      /not\s+in\s*\(\s*'Opción a compra firmada'\s*,\s*'Entregado'\s*\)/i
    );
    assert.match(definition, /installment_id\s+is\s+null[\s\S]{0,180}requiere installment_id/i);
    assert.match(
      definition,
      /select\s+i\.amount\s*,\s*i\.installment_kind[\s\S]*?Opción a compra firmada[\s\S]*?installment_kind\s+not\s+in\s*\(\s*'advance'\s*,\s*'single'\s*\)/i
    );
    assert.match(definition, /balance requiere Entregado/i);
    assert.match(
      definition,
      /installment_kind\s*=\s*'balance'[\s\S]{0,180}payment_date[\s\S]{0,120}delivery_date/i
    );
    assert.doesNotMatch(definition, /\blabel\b/i);
  }
  assert.match(
    functionDefinition("crm_import_workspace"),
    /saldo del respaldo tiene fecha anterior a la entrega/i
  );

  assert.match(
    paymentTrigger,
    /v_other_installment_payments\s*\+\s*new\.amount\s*>\s*v_installment_amount/i
  );
  assert.match(
    recordPayment,
    /v_installment_accounted\s*\+\s*v_amount\s*>\s*v_installment_amount/i
  );
  assert.match(
    saleTrigger,
    /new\.status\s*=\s*'Opción a compra firmada'[\s\S]*?p\.status\s*=\s*'Contabilizado'[\s\S]*?i\.installment_kind\s+not\s+in\s*\(\s*'advance'\s*,\s*'single'\s*\)/i
  );
});

test("delivery and unpaid balance dates remain reschedulable after advance", sqlTestOptions, () => {
  const saleTrigger = functionDefinition("crm_validate_sale_financials");
  const installmentTrigger = functionDefinition("crm_validate_installment_financials");
  const paymentTrigger = functionDefinition("crm_validate_payment_financials");
  const saveSale = functionDefinition("crm_save_sale");
  const importWorkspace = functionDefinition("crm_import_workspace");

  assert.ok(saleTrigger);
  assert.ok(installmentTrigger);
  assert.ok(paymentTrigger);
  assert.ok(saveSale);
  assert.ok(importWorkspace);

  for (const definition of [saleTrigger, saveSale, importWorkspace]) {
    assert.match(definition, /Entregado[\s\S]{0,260}delivery_date[\s\S]{0,180}(?:no futura|futura)/i);
  }
  assert.match(
    importWorkspace,
    /where\s*\(x\.value\s*->>\s*'status'\)\s*=\s*'Entregado'[\s\S]{0,220}delivery_date/i
  );
  assert.doesNotMatch(
    importWorkspace,
    /plan_count\s*=\s*2[\s\S]{0,180}delivery_date\s+is\s+null/i
  );
  assert.doesNotMatch(saveSale, /v_delivery_date\s*:=\s*coalesce\s*\(/i);
  assert.match(saveSale, /delivery_date\s*=\s*v_delivery_date/i);
  assert.match(
    saveSale,
    /v_existing\.sale_price\s+is\s+distinct\s+from\s+v_sale_price[\s\S]*?v_existing\.commission_currency\s+is\s+distinct\s+from\s+v_commission_currency/i
  );
  assert.match(
    saleTrigger,
    /v_accounted\s*>\s*0[\s\S]*?new\.sale_price\s+is\s+distinct\s+from\s+old\.sale_price[\s\S]*?new\.commission_currency\s+is\s+distinct\s+from\s+old\.commission_currency/i
  );
  assert.match(
    saveSale,
    /i\.installment_kind\s*=\s*'balance'[\s\S]*?p\.installment_id\s*=\s*i\.id[\s\S]*?p\.installment_id\s+is\s+null/i
  );
  assert.match(
    installmentTrigger,
    /new\.due_date\s+is\s+distinct\s+from\s+old\.due_date[\s\S]*?old\.installment_kind\s*<>\s*'balance'[\s\S]*?v_accounted\s*>\s*0[\s\S]*?v_unallocated_accounted\s*>\s*0/i
  );
  assert.match(
    installmentTrigger,
    /new\.label\s+is\s+distinct\s+from\s+old\.label[\s\S]*?new\.sequence[\s\S]*?new\.amount[\s\S]*?estructura y los montos del plan no cambian/i
  );
  assert.match(
    paymentTrigger,
    /new\.installment_id\s+is\s+distinct\s+from\s+old\.installment_id[\s\S]{0,180}no cambia mientras un cobro esta Contabilizado/i
  );
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
  assert.match(sql, /case\s+when\s+v_status\s+in\s*\(\s*'Desistió'\s*,\s*'Cambio'\s*\)\s+then\s+'Reservada'/i);
});

test("database currency and post-payment plan contracts match the UI", sqlTestOptions, () => {
  assert.match(sql, /sale_currency\s+in\s*\('USD'\s*,\s*'DOP'\)/i);
  assert.match(sql, /commission_currency\s+in\s*\('USD'\s*,\s*'DOP'\)/i);
  assert.match(sql, /currency\s+in\s*\('USD'\s*,\s*'DOP'\)/i);
  assert.match(
    sql,
    /El contrato financiero y la estructura del plan no cambian despues de contabilizar cobros/i
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

test("transactional acceptance covers structural installment attacks", acceptanceTestOptions, () => {
  assert.match(acceptanceSql, /'Santo Domingo Este'/i);
  assert.match(acceptanceSql, /'En planos \/ En construcción'/i);
  assert.match(acceptanceSql, /'developer'\s*,\s*'Constructora LVP'/i);
  assert.match(acceptanceSql, /'project'\s*,\s*'Riviera 2'/i);
  assert.match(
    acceptanceSql,
    /'installmentKind'\s*,\s*'advance'[\s\S]{0,120}'amount'\s*,\s*12000[\s\S]*?'installmentKind'\s*,\s*'balance'[\s\S]{0,120}'amount'\s*,\s*138000/i
  );
  assert.match(acceptanceSql, /qa-e2e-advance-100-sale/i);
  assert.match(acceptanceSql, /qa-e2e-balance-before-delivery/i);
  assert.match(acceptanceSql, /qa-e2e-retro-balance-payment/i);
  assert.match(acceptanceSql, /qa-e2e-unknown-developer-sale/i);
  assert.match(acceptanceSql, /qa-e2e-invalid-stage-client/i);
  assert.match(acceptanceSql, /qa-e2e-without-installment/i);
  assert.match(acceptanceSql, /Entregado acepto delivery_date futura/i);
  assert.match(acceptanceSql, /qa-e2e-single-payment/i);
  assert.match(acceptanceSql, /qa-e2e-payment-balance/i);
  assert.match(acceptanceSql, /qa-historical-source\.tsv/i);
  assert.match(acceptanceSql, /alreadyImported/i);
  assert.match(acceptanceSql, /duplicado de staging histórico/i);
  assert.match(acceptanceSql, /duplicado contra venta operativa/i);
  assert.match(acceptanceSql, /authenticated pudo escribir directamente en staging histórico/i);
  assert.match(acceptanceSql, /set\s+constraints\s+all\s+immediate/i);
  assert.match(
    acceptanceSql,
    /installment_kind\s*=\s*'balance'[\s\S]{0,100}label\s*=\s*'Saldo'/i
  );
});
