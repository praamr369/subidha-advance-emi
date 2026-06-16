import test from "node:test";
import assert from "node:assert/strict";

import {
  emiInstallmentLabel,
  isEmiCollectible,
  ordinal,
  resolveOutstandingAmount,
} from "../../src/lib/emi-installment";
import type { AdminEmiCollectionCandidate } from "../../src/services/payments";

function emi(
  overrides: Partial<AdminEmiCollectionCandidate>
): AdminEmiCollectionCandidate {
  return {
    id: 999,
    subscription: 1,
    amount: "190.00",
    status: "PENDING",
    ...overrides,
  };
}

test("ordinal handles common and teen cases", () => {
  assert.equal(ordinal(1), "1st");
  assert.equal(ordinal(2), "2nd");
  assert.equal(ordinal(3), "3rd");
  assert.equal(ordinal(4), "4th");
  assert.equal(ordinal(11), "11th");
  assert.equal(ordinal(13), "13th");
  assert.equal(ordinal(15), "15th");
});

test("dropdown label shows installment ordinal, not raw db id", () => {
  const label = emiInstallmentLabel(
    emi({ id: 16, installment_no: 1, total_installments: 15 })
  );
  assert.equal(label, "1st EMI of 15");
  assert.ok(!label.includes("#16"));
});

test("db ids 16-30 map to 1st-15th installment labels", () => {
  const labels: string[] = [];
  for (let i = 0; i < 15; i += 1) {
    const dbId = 16 + i;
    const installmentNo = i + 1;
    labels.push(
      emiInstallmentLabel(
        emi({ id: dbId, month_no: installmentNo, total_installments: 15 })
      )
    );
  }
  assert.equal(labels[0], "1st EMI of 15");
  assert.equal(labels[1], "2nd EMI of 15");
  assert.equal(labels[2], "3rd EMI of 15");
  assert.equal(labels[14], "15th EMI of 15");
});

test("prefers backend installment_label when present", () => {
  assert.equal(
    emiInstallmentLabel(emi({ id: 22, installment_label: "7th EMI of 15" })),
    "7th EMI of 15"
  );
});

test("derives total installments from subscription tenure when emi omits it", () => {
  assert.equal(
    emiInstallmentLabel(emi({ id: 16, month_no: 2 }), {
      id: 1,
      tenure_months: 15,
    }),
    "2nd EMI of 15"
  );
});

test("only falls back to raw id when no installment number exists at all", () => {
  assert.equal(emiInstallmentLabel(emi({ id: 41 })), "EMI #41");
});

test("backend outstanding is trusted, including explicit zero", () => {
  assert.equal(resolveOutstandingAmount(emi({ outstanding_amount: "190.00" })), "190.00");
  assert.equal(resolveOutstandingAmount(emi({ outstanding_amount: "0.00" })), "0.00");
});

test("unknown outstanding resolves to null (rendered Not available), never fabricated zero", () => {
  // Placeholder-style EMI: no outstanding field and a zero/blank nominal amount.
  assert.equal(resolveOutstandingAmount(emi({ amount: "0.00" })), null);
  assert.equal(resolveOutstandingAmount(emi({ amount: "" })), null);
  assert.equal(resolveOutstandingAmount(null), null);
});

test("PAID and WAIVED EMIs are not collectible", () => {
  assert.equal(isEmiCollectible(emi({ status: "PENDING" })), true);
  assert.equal(isEmiCollectible(emi({ status: "PARTIAL" })), true);
  assert.equal(isEmiCollectible(emi({ status: "PAID" })), false);
  assert.equal(isEmiCollectible(emi({ status: "WAIVED" })), false);
});
