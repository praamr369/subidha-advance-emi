import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const serviceSource = readFileSync(join(here, "../../src/services/brochures.ts"), "utf8");
const pageSource = readFileSync(
  join(here, "../../src/app/(dashboard)/admin/brochures/page.tsx"),
  "utf8"
);

test("brochure service uses implemented admin endpoints", () => {
  for (const endpoint of [
    "/admin/brochures/products/",
    "/admin/brochures/preview/",
    "/admin/brochures/generate/",
    "/admin/brochures/product-settings/",
    "/admin/brochures/product-settings/bulk-update/",
    "/admin/brochures/",
  ]) {
    assert.ok(serviceSource.includes(endpoint), `Missing brochure endpoint ${endpoint}`);
  }
});

test("brochure page exposes operational share and custom-selection states", () => {
  assert.ok(pageSource.includes('"CUSTOM"'));
  assert.ok(pageSource.includes("Select at least one product"));
  assert.ok(pageSource.includes("Copy public link"));
  assert.ok(pageSource.includes("Copy WhatsApp message"));
  assert.ok(pageSource.includes("does not reserve stock"));
});

test("brochure settings manager has typed CRUD, bulk, and operational controls", () => {
  const settingsPageSource = readFileSync(
    join(here, "../../src/app/(dashboard)/admin/brochures/settings/page.tsx"),
    "utf8"
  );
  for (const serviceName of [
    "listBrochureProductSettings",
    "getBrochureProductSettings",
    "updateBrochureProductSettings",
    "bulkUpdateBrochureProductSettings",
  ]) {
    assert.ok(serviceSource.includes(serviceName), `Missing service ${serviceName}`);
  }
  assert.ok(settingsPageSource.includes("Brochure Product Settings"));
  assert.ok(settingsPageSource.includes("Missing settings"));
  assert.ok(settingsPageSource.includes("Apply to selected"));
  assert.ok(settingsPageSource.includes("Back to Brochure Generator"));
});
