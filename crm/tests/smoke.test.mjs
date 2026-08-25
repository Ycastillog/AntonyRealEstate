import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const crmDir = fileURLToPath(new URL("../", import.meta.url));
const htmlPath = fileURLToPath(new URL("../index.html", import.meta.url));
const appPath = fileURLToPath(new URL("../app.js", import.meta.url));
const cssPath = fileURLToPath(new URL("../styles.css", import.meta.url));
const [html, app, css] = await Promise.all([
  readFile(htmlPath, "utf8"),
  readFile(appPath, "utf8"),
  readFile(cssPath, "utf8")
]);

test("JavaScript parses without syntax errors", () => {
  const result = spawnSync(process.execPath, ["--check", appPath], {
    cwd: crmDir,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
});

test("HTML ids are unique and direct JavaScript selectors exist", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "There are duplicate HTML ids");
  const directSelectors = [
    ...app.matchAll(/querySelector\("#([A-Za-z][\w-]*)"\)/g)
  ].map((match) => match[1]);
  const idSet = new Set(ids);
  directSelectors.forEach((id) =>
    assert.ok(idSet.has(id), `Missing HTML target #${id}`)
  );
});

test("Private Office shell uses official brand assets and one SVG icon family", () => {
  assert.match(html, /antony-fulgencio-logo-transparent\.png/);
  assert.match(html, /antony-instagram-profile\.jpg/);
  assert.match(html, /data-lucide="layout-dashboard"/);
  assert.doesNotMatch(html, />\s*[▦◉↗▥]\s*</);
});

test("Drawers and confirmations expose accessible dialog semantics", () => {
  assert.match(html, /id="clientForm"[^>]+role="dialog"[^>]+aria-modal="true"/);
  assert.match(html, /id="saleForm"[^>]+role="dialog"[^>]+aria-modal="true"/);
  assert.match(html, /id="paymentForm"[^>]+role="dialog"[^>]+aria-modal="true"/);
  assert.match(html, /id="recordDetailDrawer"[^>]+role="dialog"[^>]+aria-modal="true"/);
  assert.match(html, /<dialog[^>]+id="confirmDialog"/);
  assert.doesNotMatch(app, /\b(?:confirm|prompt)\s*\(/);
});

test("Collection inbox exposes every pending balance category", () => {
  for (const filter of ["all", "overdue", "upcoming", "undated", "paid"]) {
    assert.match(html, new RegExp(`data-collection-filter="${filter}"`));
  }
  assert.match(app, /all:\s*pendingSales/);
  assert.match(app, /undated:\s*undatedSales/);
  assert.match(app, /aria-pressed/);
});

test("mobile forms expose shared sales and percentage-based installments", () => {
  assert.match(html, /id="sharedSale"[^>]+type="checkbox"/);
  assert.match(html, /id="externalAgentWrap"[^>]+hidden/);
  assert.match(app, /data-installment-percentage/);
  assert.match(css, /\.shared-sale-toggle/);
  assert.match(css, /grid-template-columns:\s*minmax\(125px,\s*1\.2fr\)/);
});

test("Financial values are protected from silent truncation", () => {
  assert.match(css, /metric-card > strong[\s\S]*overflow:\s*visible/);
  assert.match(css, /\.money-cell[\s\S]*text-align:\s*right/);
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
});
