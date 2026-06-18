/**
 * Phase 9F — Production Release Gate documentation guard.
 *
 * File-content assertions only, compatible with:
 * node --test tests/unit/phase-9f-production-release-gate.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const thisFileDir = dirname(fileURLToPath(import.meta.url));
const gatePath = join(
  thisFileDir,
  "../../../docs/release/phase-9f-production-release-gate.md"
);

test("Phase 9F: production release gate document exists", () => {
  assert.ok(existsSync(gatePath), "Phase 9F production release gate must exist");
});

test("Phase 9F: release gate contains every critical invariant label", () => {
  const source = readFileSync(gatePath, "utf8");
  const requiredLabels = [
    "Product base price = total contract price",
    "Default EMI = total contract price / tenure months",
    "Customer can have multiple subscriptions",
    "Customer can hold multiple Lucky IDs",
    "One Lucky ID per batch slot",
    "Lucky draw winner receives future EMI waiver only",
    "Rent/Lease has no Lucky ID",
    "Rent/Lease security deposit is refundable liability",
    "Rent/Lease monthly demand remains separate from deposit",
    "Payment, receipt, waiver, delivery, commission, payout, accounting bridge, reconciliation, and audit records remain controlled and auditable",
  ];

  for (const label of requiredLabels) {
    assert.ok(source.includes(label), `Missing critical invariant: ${label}`);
  }
});

test("Phase 9F: release gate locks the no-flip route policy", () => {
  const source = readFileSync(gatePath, "utf8");
  assert.ok(source.includes("no-flip admin route policy"));
  assert.ok(source.includes("Any route flip"));
  assert.ok(source.includes("canonical routes still redirect to legacy content owners"));
});

test("Phase 9F: release gate states readiness display is read-only and backend-authoritative", () => {
  const source = readFileSync(gatePath, "utf8");
  assert.ok(
    source.includes("Readiness display is read-only; backend remains authoritative")
  );
  assert.ok(
    source.includes("must not create or mutate payment, receipt, journal")
  );
});

test("Phase 9F: release gate contains a release blocker section", () => {
  const source = readFileSync(gatePath, "utf8");
  assert.ok(source.includes("## 7. Release blockers"));
  assert.ok(source.includes("Any migration detected unexpectedly"));
  assert.ok(source.includes("Any frontend build failure"));
});
