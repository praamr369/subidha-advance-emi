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

