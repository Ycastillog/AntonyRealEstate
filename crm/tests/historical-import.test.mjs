import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const sourcePath = fileURLToPath(new URL("../historical.js", import.meta.url));
const source = await readFile(sourcePath, "utf8");

function loadParser() {
  const window = { crypto: webcrypto };
  const context = vm.createContext({ window, TextEncoder, Uint8Array, Set, Date });
  vm.runInContext(source, context, { filename: sourcePath, timeout: 1_000 });
  return window.AntonyHistoricalImport;
}

test("historical parser normalizes the LVP spreadsheet without inventing missing data", () => {
  const parser = loadParser();
  const input = [
    "Proyecto\tAño\tMes\tFecha\tUnidad\tPrecio \tFecha de entrega\tVendedor\tComprador\tCorreo\tTelefono",
    "ALTOS DEL ESTE\t2023\tEnero\t18/1/2023\tADE-001-A\tUSD 94,500.00\t\tAnthony Fulgencio\tCliente Uno\t\t",
    "Vistas Del Limonal\t2024\tMarzo\t6/3/2024\tVDL-204\tUS$ 88,000.00\t\tAntony Fulgencio\tCliente Dos y Cliente Tres\t\t"
  ].join("\n");

  const rows = parser.parseHistoricalFile(input, { today: "2026-08-25" });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].project, "Altos del este");
  assert.equal(rows[1].project, "Vistas del limonal");
  assert.equal(rows[0].saleDate, "2023-01-18");
  assert.equal(rows[0].salePrice, 94_500);
  assert.equal(rows[0].saleCurrency, "USD");
  assert.equal(rows[0].sellerName, "Antony Fulgencio");
  assert.equal(rows[0].buyerPhone, "");
  assert.equal(rows[0].buyerEmail, "");
  assert.equal(rows[0].deliveryDate, "");
  assert.equal(rows[0].saleStatus, "");
  assert.equal(rows[0].commissionAmount, null);
  assert.equal(rows[0].reviewStatus, "Por completar");
  assert.ok(rows[0].sourceSnapshot.Proyecto);
  assert.notEqual(rows[0].id, rows[1].id);
});

test("historical parser rejects duplicates, unknown projects, and inconsistent dates", () => {
  const parser = loadParser();
  const header = "Proyecto\tAño\tMes\tFecha\tUnidad\tPrecio\tComprador";

  assert.throws(
    () => parser.parseHistoricalFile([
      header,
      "LP11\t2023\tEnero\t18/1/2023\tLP11-A\tUSD 90,000\tCliente Uno",
      "LP11\t2023\tEnero\t19/1/2023\tLP11-A\tUSD 91,000\tCliente Dos"
    ].join("\n"), { today: "2026-08-25" }),
    /aparece más de una vez/
  );

  assert.throws(
    () => parser.parseHistoricalFile([
      header,
      "Proyecto inventado\t2023\tEnero\t18/1/2023\tX-1\tUSD 90,000\tCliente Uno"
    ].join("\n"), { today: "2026-08-25" }),
    /fuera del catálogo/
  );

  assert.throws(
    () => parser.parseHistoricalFile([
      header,
      "LP11\t2024\tEnero\t18/1/2023\tLP11-A\tUSD 90,000\tCliente Uno"
    ].join("\n"), { today: "2026-08-25" }),
    /año no coincide/i
  );
});

test("contact enrichment ignores unrelated delivery errors and keeps contact optional", () => {
  const parser = loadParser();
  const input = [
    "Proyecto\tFecha\tUnidad\tPrecio\tFecha de entrega\tComprador\tCorreo\tTelefono",
    "Riviera 1\t13/5/2025\tRRV-010-3F\tUSD 83,000\t30/10/2024\tCliente Uno\tcliente@example.com\t829-555-0101",
    "LP11\t18/1/2023\tLP11-A\tUSD 90,000\t\tCliente Dos\t\t"
  ].join("\n");

  assert.throws(
    () => parser.parseHistoricalFile(input, { today: "2026-08-26" }),
    /ocurre antes de la venta/
  );

  const contacts = parser.parseHistoricalContactUpdates(input);
  assert.equal(contacts.length, 2);
  assert.equal(contacts[0].project, "Riviera 1");
  assert.equal(contacts[0].buyerEmail, "cliente@example.com");
  assert.equal(contacts[0].buyerPhone, "829-555-0101");
  assert.equal(contacts[1].buyerEmail, "");
  assert.equal(contacts[1].buyerPhone, "");

  assert.throws(
    () => parser.parseHistoricalContactUpdates([
      "Proyecto\tUnidad\tCorreo",
      "LP11\tLP11-A\tcorreo-invalido"
    ].join("\n")),
    /Correo inválido/
  );
});

test("historical parser produces a stable SHA-256 fingerprint and safe summary", async () => {
  const parser = loadParser();
  const first = await parser.sha256("same-file");
  const second = await parser.sha256("same-file");
  const other = await parser.sha256("other-file");
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, second);
  assert.notEqual(first, other);

  const summary = parser.summarize([
    { buyerName: "Cliente Uno", saleDate: "2023-01-01", salePrice: 50_000 },
    { buyerName: "cliente uno", saleDate: "2024-01-01", salePrice: 75_000 },
    { buyerName: "Cliente Dos", saleDate: "2024-02-01", salePrice: 25_000 }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(summary)), {
    rows: 3,
    volume: 150_000,
    buyers: 2,
    years: { 2023: 1, 2024: 2 }
  });
});
