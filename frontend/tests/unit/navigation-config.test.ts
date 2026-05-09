import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const thisFileDir = dirname(fileURLToPath(import.meta.url));
const navigationSource = readFileSync(join(thisFileDir, "../../src/config/navigation.ts"), "utf8");

test("admin sidebar has consolidated operational groups", () => {
  const expectedGroupLabels = [
    "Command Center",
    "Sales & Contracts",
    "Billing & Finance",
    "Returns & Reversals",
    "Delivery & Service",
    "Inventory",
    "CRM & Partners",
    "Reports & Audit",
    "Setup",
  ];
  expectedGroupLabels.forEach((label) => {
    assert.ok(
      navigationSource.includes(`"${label}"`),
      `Missing consolidated group label ${label}`
    );
  });
});

test("admin top-level sidebar does not duplicate create invoice actions", () => {
  assert.ok(
    navigationSource.includes('if (/^create\\s/i.test(row.label)) return;'),
    "Expected create-route demotion guard in admin navigation builder"
  );
});
