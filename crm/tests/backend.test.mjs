import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const backendPath = fileURLToPath(new URL("../backend.js", import.meta.url));
const backendSource = await readFile(backendPath, "utf8");
const validConfig = {
  supabaseUrl: "https://antony-test.supabase.co/",
  supabaseAnonKey: "public-anon-key-for-tests"
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

function base64Url(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function evaluateBackend(options = {}) {
  const config = Object.hasOwn(options, "config") ? options.config : validConfig;
  const { createClient, includeSupabase = true } = options;
  const createClientCalls = [];
  let storageAccesses = 0;
  const windowObject = {
    URL,
    atob(value) {
      return Buffer.from(value, "base64").toString("binary");
    }
  };

  Object.defineProperty(windowObject, "localStorage", {
    configurable: true,
    get() {
      storageAccesses += 1;
      throw new Error("backend.js must not access localStorage");
    }
  });
  Object.defineProperty(windowObject, "sessionStorage", {
    configurable: true,
    get() {
      storageAccesses += 1;
      throw new Error("backend.js must not access sessionStorage");
    }
  });

  if (includeSupabase) {
    windowObject.supabase = {
      createClient(url, key, options) {
        createClientCalls.push({ url, key, options });
        return createClient ? createClient(url, key, options) : {};
      }
    };
  }

  const context = vm.createContext({ window: windowObject });
  const realmValue = (value) =>
    vm.runInContext(
      `JSON.parse(${JSON.stringify(JSON.stringify(value))})`,
      context
    );

  if (config !== undefined) {
    windowObject.ANTONY_MEDIA_CONFIG = realmValue(config);
  }

  vm.runInContext(backendSource, context, {
    filename: backendPath,
    timeout: 1_000
  });

  return {
    api: windowObject.AntonyCrmBackend,
    createClientCalls,
    realmValue,
    storageAccesses: () => storageAccesses
  };
}

function configurationError(error) {
  assert.equal(error?.name, "AntonyCrmError");
  assert.equal(error?.code, "CONFIGURATION_ERROR");
  assert.equal(error?.details?.kind, "configuration");
  assert.doesNotMatch(error?.message || "", /key|token|secret|service.role/i);
  return true;
}

test("invalid Supabase configuration fails closed without touching storage", async (t) => {
  const cases = [
    ["missing config", undefined],
    ["missing values", { supabaseUrl: "", supabaseAnonKey: "" }],
    ["non-HTTPS URL", { supabaseUrl: "http://example.test", supabaseAnonKey: "anon" }],
    [
      "URL credentials",
      { supabaseUrl: "https://user:pass@example.test", supabaseAnonKey: "anon" }
    ]
  ];

  for (const [name, config] of cases) {
    await t.test(name, async () => {
      const harness = evaluateBackend({ config });
      assert.equal(harness.api.configured, false);
      assert.equal(harness.createClientCalls.length, 0);
      await assert.rejects(harness.api.getSession(), configurationError);
      assert.equal(harness.storageAccesses(), 0);
    });
  }
});

test("service-role and secret Supabase keys are rejected before client creation", async (t) => {
  const serviceRoleJwt = [
    base64Url({ alg: "HS256", typ: "JWT" }),
    base64Url({ role: "service_role", ref: "antony-test" }),
    "test-signature"
  ].join(".");

  for (const [name, key] of [
    ["modern secret key", "sb_secret_never_ship_this"],
    ["legacy service-role JWT", serviceRoleJwt]
  ]) {
    await t.test(name, async () => {
      const harness = evaluateBackend({
        config: { ...validConfig, supabaseAnonKey: key }
      });
      assert.equal(harness.api.configured, false);
      assert.equal(harness.createClientCalls.length, 0);
      await assert.rejects(harness.api.getSession(), configurationError);
      assert.equal(harness.storageAccesses(), 0);
    });
  }
});

test("login trims the email and exposes only a safe authentication error", async () => {
  const attempts = [];
  const client = {
    auth: {
      async signInWithPassword(credentials) {
        attempts.push(credentials);
        return {
          data: null,
          error: {
            code: "invalid_credentials",
            status: 400,
            message: "Invalid login credentials for antony@example.com",
            details:
              "antony@example.com https://antony-test.supabase.co/auth/v1/token"
          }
        };
      }
    }
  };
  const harness = evaluateBackend({ createClient: () => client });

  await assert.rejects(
    harness.api.signIn("not-an-email", "never-visible"),
    (error) => {
      assert.equal(error?.code, "VALIDATION_ERROR");
      assert.equal(error?.details?.field, "email");
      return true;
    }
  );
  assert.equal(attempts.length, 0, "Invalid email must not reach Supabase");

  await assert.rejects(
    harness.api.signIn("  antony@example.com  ", "never-visible"),
    (error) => {
      assert.equal(error?.name, "AntonyCrmError");
      assert.equal(error?.status, 401);
      assert.equal(error?.details?.kind, "unauthorized");
      assert.equal(error?.message, "El correo o la contraseña no son correctos.");
      assert.doesNotMatch(error?.message || "", /antony@example\.com|never-visible|supabase\.co/i);
      assert.doesNotMatch(
        error?.details?.summary || "",
        /antony@example\.com|supabase\.co/i
      );
      assert.match(error?.details?.summary || "", /\[correo oculto\]/);
      assert.match(error?.details?.summary || "", /\[url oculta\]/);
      return true;
    }
  );

  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].email, "antony@example.com");
  assert.equal(attempts[0].password, "never-visible");
  assert.equal(harness.storageAccesses(), 0);
});

test("password recovery uses an HTTPS redirect and enforces a strong replacement", async () => {
  const resetCalls = [];
  const updateCalls = [];
  const client = {
    auth: {
      async resetPasswordForEmail(email, options) {
        resetCalls.push({ email, options });
        return { data: {}, error: null };
      },
      async updateUser(payload) {
        updateCalls.push(payload);
        return {
          data: { user: { id: "user-1", email: "antony@example.com" } },
          error: null
        };
      }
    }
  };
  const harness = evaluateBackend({ createClient: () => client });

  await assert.rejects(
    harness.api.requestPasswordReset(
      "antony@example.com",
      "http://antonyrealestate.com/crm/"
    ),
    (error) => error?.code === "VALIDATION_ERROR" && error?.details?.field === "redirectTo"
  );
  assert.equal(resetCalls.length, 0);

  await harness.api.requestPasswordReset(
    "  antony@example.com  ",
    "https://antonyrealestate.com/crm/"
  );
  assert.equal(resetCalls.length, 1);
  assert.equal(resetCalls[0].email, "antony@example.com");
  assert.equal(
    resetCalls[0].options.redirectTo,
    "https://antonyrealestate.com/crm/"
  );

  await assert.rejects(
    harness.api.updatePassword("too-short"),
    (error) => error?.code === "VALIDATION_ERROR" && error?.details?.field === "password"
  );
  assert.equal(updateCalls.length, 0);

  const user = await harness.api.updatePassword("a-secure-passphrase-2026");
  assert.equal(user.email, "antony@example.com");
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].password, "a-secure-passphrase-2026");
  assert.equal(harness.storageAccesses(), 0);
});

test("loadWorkspace starts every table read in parallel and maps snake_case deeply", async () => {
  const tables = [
    "crm_clients",
    "crm_sales",
    "crm_commission_installments",
    "crm_payments",
    "crm_audit_log"
  ];
  const pendingByTable = new Map(tables.map((table) => [table, deferred()]));
  const fromCalls = [];
  const started = [];
  const queryCalls = [];

  const client = {
    auth: {},
    from(table) {
      fromCalls.push(table);
      const query = {
        select(columns) {
          queryCalls.push([table, "select", columns]);
          return query;
        },
        order(column, options) {
          queryCalls.push([table, "order", column, options]);
          return query;
        },
        limit(value) {
          queryCalls.push([table, "limit", value]);
          return query;
        },
        then(onFulfilled, onRejected) {
          started.push(table);
          return pendingByTable.get(table).promise.then(onFulfilled, onRejected);
        }
      };
      return query;
    }
  };
  const harness = evaluateBackend({ createClient: () => client });
  const workspacePromise = harness.api.loadWorkspace();

  await nextTurn();
  assert.deepEqual(fromCalls, tables, "All reads must be issued before any response resolves");
  assert.deepEqual(new Set(started), new Set(tables));
  assert.ok(
    queryCalls.some(
      ([table, method, value]) =>
        table === "crm_audit_log" && method === "limit" && value === 300
    ),
    "Audit log read must be capped"
  );
  assert.ok(
    queryCalls.some(
      ([table, method, value]) =>
        table === "crm_audit_log" && method === "order" && value === "changed_at"
    ),
    "Audit log must use its real changed_at timestamp"
  );

  const responseRows = {
    crm_clients: [
      JSON.parse(`{
        "id": "client-z",
        "name": "Zoé",
        "captured_at": "2026-08-02T10:00:00Z",
        "contact_meta": { "desired_zone": "Naco" },
        "__proto__": { "polluted": true }
      }`),
      {
        id: "client-a",
        name: "Ana",
        captured_at: "2026-08-01T10:00:00Z"
      }
    ],
    crm_sales: [
      {
        id: "sale-old",
        sale_date: "2026-07-01",
        commission_amount: 100,
        status: "Reservada"
      },
      {
        id: "sale-new",
        sale_date: "2026-08-01",
        commission_amount: 200,
        status: "Contratada"
      }
    ],
    crm_commission_installments: [
      { id: "installment-2", due_date: "2026-10-01", sale_id: "sale-new" },
      { id: "installment-1", due_date: "2026-09-01", sale_id: "sale-new" }
    ],
    crm_payments: [
      { id: "payment-1", payment_date: "2026-08-10", sale_id: "sale-new" }
    ],
    crm_audit_log: [
      {
        id: "audit-old",
        changed_at: "2026-08-01T12:00:00Z",
        before_data: { desired_zone: "Bella Vista" }
      },
      {
        id: "audit-new",
        changed_at: "2026-08-02T12:00:00Z",
        after_data: { desired_zone: "Naco" }
      }
    ]
  };

  for (const table of [...tables].reverse()) {
    pendingByTable.get(table).resolve({
      data: harness.realmValue(responseRows[table]),
      error: null
    });
  }

  const workspace = await workspacePromise;
  assert.deepEqual(
    Array.from(workspace.clients, (clientRow) => clientRow.name),
    ["Ana", "Zoé"]
  );
  assert.equal(workspace.clients[1].capturedAt, "2026-08-02T10:00:00Z");
  assert.equal(workspace.clients[1].contactMeta.desiredZone, "Naco");
  assert.ok(!Object.hasOwn(workspace.clients[1], "captured_at"));
  assert.ok(!Object.hasOwn(workspace.clients[1], "__proto__"));
  assert.deepEqual(
    Array.from(workspace.sales, (sale) => sale.id),
    ["sale-new", "sale-old"]
  );
  assert.equal(workspace.sales[0].saleStatus, "Contratada");
  assert.ok(!Object.hasOwn(workspace.sales[0], "status"));
  assert.deepEqual(
    Array.from(workspace.installments, (installment) => installment.id),
    ["installment-1", "installment-2"]
  );
  assert.deepEqual(
    Array.from(workspace.auditLog, (entry) => entry.id),
    ["audit-new", "audit-old"]
  );
  assert.equal(workspace.auditLog[0].afterData.desiredZone, "Naco");
  assert.ok(Object.isFrozen(workspace.auditLog));
  assert.ok(Object.isFrozen(workspace.auditLog[0]));
  assert.ok(Object.isFrozen(workspace.auditLog[0].afterData));
  assert.equal(harness.storageAccesses(), 0);
});

test("saveClient waits for a confirmed row, maps it, and strips dangerous keys", async () => {
  const response = deferred();
  let requestStarted = false;
  let capturedPayload;
  let capturedOptions;

  const client = {
    auth: {},
    from(table) {
      assert.equal(table, "crm_clients");
      const query = {
        upsert(payload, options) {
          capturedPayload = payload;
          capturedOptions = options;
          return query;
        },
        select(columns) {
          assert.equal(columns, "*");
          return query;
        },
        single() {
          return query;
        },
        then(onFulfilled, onRejected) {
          requestStarted = true;
          return response.promise.then(onFulfilled, onRejected);
        }
      };
      return query;
    }
  };
  const harness = evaluateBackend({ createClient: () => client });
  const draft = harness.realmValue(
    JSON.parse(`{
      "id": "client-1",
      "name": "Borrador",
      "phone": "",
      "desiredZone": "",
      "propertyStage": "En planos",
      "capturedAt": "2026-08-20",
      "createdAt": "2026-08-19",
      "updatedAt": "2026-08-20",
      "contactMeta": {
        "desiredZone": "Naco",
        "__proto__": { "polluted": true }
      },
      "__proto__": { "polluted": true },
      "constructor": { "prototype": { "polluted": true } }
    }`)
  );

  let settled = false;
  const savePromise = harness.api.saveClient(draft);
  savePromise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );
  await nextTurn();

  assert.equal(requestStarted, true);
  assert.equal(settled, false, "Mutation must wait for the server response");
  assert.equal(capturedOptions.onConflict, "owner_id,id");
  assert.equal(capturedPayload.captured_at, "2026-08-20");
  assert.equal(capturedPayload.phone, null);
  assert.equal(capturedPayload.desired_zone, null);
  assert.equal(capturedPayload.property_stage, "En planos");
  assert.ok(!Object.hasOwn(capturedPayload, "created_at"));
  assert.ok(!Object.hasOwn(capturedPayload, "updated_at"));
  assert.ok(!Object.hasOwn(capturedPayload, "contact_meta"));
  assert.ok(!Object.hasOwn(capturedPayload, "__proto__"));
  assert.ok(!Object.hasOwn(capturedPayload, "constructor"));
  assert.equal(Object.prototype.polluted, undefined);

  response.resolve({
    data: harness.realmValue({
      id: "client-1",
      name: "Confirmado por servidor",
      captured_at: "2026-08-20T12:30:00Z",
      created_at: "2026-08-25T13:00:00Z"
    }),
    error: null
  });

  const saved = await savePromise;
  assert.equal(saved.name, "Confirmado por servidor");
  assert.equal(saved.capturedAt, "2026-08-20T12:30:00Z");
  assert.equal(saved.createdAt, "2026-08-25T13:00:00Z");
  assert.equal(harness.storageAccesses(), 0);
});

test("a mutation without returned data is rejected as unconfirmed", async () => {
  const client = {
    auth: {},
    from() {
      const query = {
        upsert() {
          return query;
        },
        select() {
          return query;
        },
        single() {
          return Promise.resolve({ data: null, error: null });
        }
      };
      return query;
    }
  };
  const harness = evaluateBackend({ createClient: () => client });

  await assert.rejects(
    harness.api.saveClient(harness.realmValue({ id: "client-1", name: "Sin confirmar" })),
    (error) => {
      assert.equal(error?.code, "EMPTY_RESPONSE");
      assert.equal(error?.status, 502);
      assert.equal(error?.details?.operation, "saveClient");
      return true;
    }
  );
});

test("financial mutations use RPC contracts and preserve the UI sale status name", async () => {
  const pending = {
    crm_save_sale: deferred(),
    crm_record_payment: deferred(),
    crm_import_workspace: deferred()
  };
  const calls = [];
  const client = {
    auth: {},
    rpc(name, payload) {
      calls.push({ name, payload });
      return pending[name].promise;
    }
  };
  const harness = evaluateBackend({ createClient: () => client });

  const saveSalePromise = harness.api.saveSale(
    harness.realmValue({
      id: "sale-1",
      saleStatus: "Contratada",
      commissionDueDate: "2026-09-01",
      commissionAmount: 300
    }),
    harness.realmValue([
      { id: "installment-1", saleId: "sale-1", sequence: 1, amount: 300 }
    ])
  );
  await nextTurn();
  assert.equal(calls[0].name, "crm_save_sale");
  assert.equal(calls[0].payload.p_sale.status, "Contratada");
  assert.ok(!Object.hasOwn(calls[0].payload.p_sale, "sale_status"));
  assert.ok(!Object.hasOwn(calls[0].payload.p_sale, "commission_due_date"));
  pending.crm_save_sale.resolve({
    data: harness.realmValue({
      sale: { id: "sale-1", status: "Contratada", commission_amount: 300 },
      installments: [{ id: "installment-1", sale_id: "sale-1", amount: 300 }]
    }),
    error: null
  });
  const savedSale = await saveSalePromise;
  assert.equal(savedSale.sale.saleStatus, "Contratada");
  assert.ok(!Object.hasOwn(savedSale.sale, "status"));
  assert.equal(savedSale.installments[0].saleId, "sale-1");

  const savePaymentPromise = harness.api.savePayment(
    harness.realmValue({ id: "payment-1", saleId: "sale-1", amount: 100 })
  );
  await nextTurn();
  assert.equal(calls[1].name, "crm_record_payment");
  assert.equal(calls[1].payload.p_payment.sale_id, "sale-1");
  pending.crm_record_payment.resolve({
    data: harness.realmValue({ id: "payment-1", sale_id: "sale-1", amount: 100 }),
    error: null
  });
  const savedPayment = await savePaymentPromise;
  assert.equal(savedPayment.saleId, "sale-1");

  const importPromise = harness.api.importWorkspace(
    harness.realmValue({
      clients: [],
      sales: [{ id: "sale-1", saleStatus: "Entregada", commissionDueDate: "2026-09-01" }],
      installments: [],
      payments: []
    })
  );
  await nextTurn();
  assert.equal(calls[2].name, "crm_import_workspace");
  assert.equal(calls[2].payload.p_state.sales[0].status, "Entregada");
  assert.ok(!Object.hasOwn(calls[2].payload.p_state.sales[0], "sale_status"));
  pending.crm_import_workspace.resolve({
    data: harness.realmValue({ sales_upserted: 1 }),
    error: null
  });
  assert.equal((await importPromise).salesUpserted, 1);
  assert.equal(harness.storageAccesses(), 0);
});
