import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const thisFileDir = dirname(fileURLToPath(import.meta.url));
const routesSource = readFileSync(join(thisFileDir, "../../src/lib/routes.ts"), "utf8");
const registrySource = readFileSync(join(thisFileDir, "../../src/config/admin-route-registry.ts"), "utf8");

const appRoot = join(thisFileDir, "../../src/app/(dashboard)/admin/lucky-plan");

// ── Route constants ───────────────────────────────────────────────────────────

test("canonical Lucky Plan route constants are defined in ROUTES", () => {
  assert.ok(routesSource.includes("luckyPlanControl:"), "Missing luckyPlanControl route key");
  assert.ok(routesSource.includes("luckyPlanBatches:"), "Missing luckyPlanBatches route key");
  assert.ok(routesSource.includes("luckyPlanLuckyIds:"), "Missing luckyPlanLuckyIds route key");
  assert.ok(routesSource.includes("luckyPlanDraws:"), "Missing luckyPlanDraws route key");
  assert.ok(routesSource.includes("luckyPlanWinners:"), "Missing luckyPlanWinners route key");
});

test("canonical Lucky Plan route paths are correct", () => {
  assert.ok(routesSource.includes('"/admin/lucky-plan"'), "Missing /admin/lucky-plan path");
  assert.ok(routesSource.includes('"/admin/lucky-plan/batches"'), "Missing /admin/lucky-plan/batches path");
  assert.ok(routesSource.includes('"/admin/lucky-plan/lucky-ids"'), "Missing /admin/lucky-plan/lucky-ids path");
  assert.ok(routesSource.includes('"/admin/lucky-plan/draws"'), "Missing /admin/lucky-plan/draws path");
  assert.ok(routesSource.includes('"/admin/lucky-plan/winners"'), "Missing /admin/lucky-plan/winners path");
});

// ── Legacy routes still defined ───────────────────────────────────────────────

test("legacy Lucky Plan route constants still exist in ROUTES (backward compat)", () => {
  assert.ok(routesSource.includes("batches:"), "Missing legacy batches route key");
  assert.ok(routesSource.includes("luckyIds:"), "Missing legacy luckyIds route key");
  assert.ok(routesSource.includes("luckyDraws:"), "Missing legacy luckyDraws route key");
  assert.ok(routesSource.includes('"/admin/batches"'), "Missing legacy /admin/batches path");
  assert.ok(routesSource.includes('"/admin/lucky-ids"'), "Missing legacy /admin/lucky-ids path");
  assert.ok(routesSource.includes('"/admin/lucky-draws"'), "Missing legacy /admin/lucky-draws path");
});

// ── Admin route registry ──────────────────────────────────────────────────────

test("admin route registry Lucky Plan Control group links to canonical routes", () => {
  assert.ok(registrySource.includes("ROUTES.admin.luckyPlanControl"), "Missing luckyPlanControl in registry");
  assert.ok(registrySource.includes("ROUTES.admin.luckyPlanBatches"), "Missing luckyPlanBatches in registry");
  assert.ok(registrySource.includes("ROUTES.admin.luckyPlanLuckyIds"), "Missing luckyPlanLuckyIds in registry");
  assert.ok(registrySource.includes("ROUTES.admin.luckyPlanDraws"), "Missing luckyPlanDraws in registry");
  assert.ok(registrySource.includes("ROUTES.admin.luckyPlanWinners"), "Missing luckyPlanWinners in registry");
});

test("admin route registry Lucky Plan Control is correctly grouped", () => {
  const lines = registrySource.split("\n");
  const luckyPlanStart = lines.findIndex((l) => l.includes('"Lucky Plan Control"'));
  assert.ok(luckyPlanStart !== -1, "Lucky Plan Control group not found");

  // Find the next group boundary (// ── N. comment)
  let luckyPlanEnd = lines.length;
  for (let i = luckyPlanStart + 1; i < lines.length; i++) {
    if (/\/\/ ── \d+\./.test(lines[i])) {
      luckyPlanEnd = i;
      break;
    }
  }

  const block = lines.slice(luckyPlanStart, luckyPlanEnd).join("\n");
  assert.ok(block.includes("luckyPlanControl"), "luckyPlanControl must appear in Lucky Plan Control block");
  assert.ok(block.includes("luckyPlanBatches"), "luckyPlanBatches must appear in Lucky Plan Control block");
  assert.ok(block.includes("luckyPlanDraws"), "luckyPlanDraws must appear in Lucky Plan Control block");
});

// ── Rent/lease separation ─────────────────────────────────────────────────────

test("rent/lease routes are not inside Lucky Plan Control block in registry", () => {
  const lines = registrySource.split("\n");
  const luckyPlanStart = lines.findIndex((l) => l.includes('"Lucky Plan Control"'));
  assert.ok(luckyPlanStart !== -1, "Lucky Plan Control group not found");

  let luckyPlanEnd = lines.length;
  for (let i = luckyPlanStart + 1; i < lines.length; i++) {
    if (/\/\/ ── \d+\./.test(lines[i])) {
      luckyPlanEnd = i;
      break;
    }
  }

  const block = lines.slice(luckyPlanStart, luckyPlanEnd).join("\n");
  assert.ok(
    !block.includes("rentLease") && !block.includes("rent-lease"),
    "Rent/lease must not appear inside Lucky Plan Control registry block"
  );
});

test("rent/lease route constants still exist in ROUTES", () => {
  assert.ok(routesSource.includes("rentLease:"), "Missing rentLease route key");
  assert.ok(routesSource.includes('"/admin/rent-lease"'), "Missing /admin/rent-lease path");
});

// ── Page files exist ──────────────────────────────────────────────────────────

test("lucky-plan hub page file exists", () => {
  assert.ok(existsSync(join(appRoot, "page.tsx")), "Missing /admin/lucky-plan/page.tsx");
});

test("lucky-plan redirect alias page files exist", () => {
  assert.ok(existsSync(join(appRoot, "batches/page.tsx")), "Missing /admin/lucky-plan/batches/page.tsx");
  assert.ok(existsSync(join(appRoot, "lucky-ids/page.tsx")), "Missing /admin/lucky-plan/lucky-ids/page.tsx");
  assert.ok(existsSync(join(appRoot, "draws/page.tsx")), "Missing /admin/lucky-plan/draws/page.tsx");
  assert.ok(existsSync(join(appRoot, "winners/page.tsx")), "Missing /admin/lucky-plan/winners/page.tsx");
});

test("lucky-plan redirect pages redirect to legacy routes", () => {
  const batchesPage = readFileSync(join(appRoot, "batches/page.tsx"), "utf8");
  const luckyIdsPage = readFileSync(join(appRoot, "lucky-ids/page.tsx"), "utf8");
  const drawsPage = readFileSync(join(appRoot, "draws/page.tsx"), "utf8");

  assert.ok(batchesPage.includes('redirect("/admin/batches")'), "batches page must redirect to /admin/batches");
  assert.ok(luckyIdsPage.includes('redirect("/admin/lucky-ids")'), "lucky-ids page must redirect to /admin/lucky-ids");
  assert.ok(drawsPage.includes('redirect("/admin/lucky-draws")'), "draws page must redirect to /admin/lucky-draws");
});

test("lucky-plan winners page uses the service-backed winners register without fake data", () => {
  const winnersPage = readFileSync(join(appRoot, "winners/page.tsx"), "utf8");
  const drawsService = readFileSync(join(thisFileDir, "../../src/services/draws/index.ts"), "utf8");
  assert.ok(
    winnersPage.includes("listLuckyDrawWinners"),
    "winners page must use the service-backed winners register"
  );
  assert.ok(
    drawsService.includes("/admin/lucky-draws/winners/"),
    "winners service must call the backend winners action"
  );
  assert.ok(
    !winnersPage.toLowerCase().includes("mock") && !winnersPage.includes("fake winner"),
    "winners page must not render mocked or fake winner data"
  );
});
