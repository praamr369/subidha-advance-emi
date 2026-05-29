import { expect, test, type Page } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

const mockAmendment = {
  id: 99,
  amendment_no: "AMD-DECISION-001",
  contract_type: "EMI_SUBSCRIPTION",
  subscription: 1001,
  subscription_number: "SUB-DECISION-001",
  customer: 501,
  customer_name: "Decision Customer",
  customer_phone: "9111111111",
  requested_by_username: "smoke.customer",
  requested_role: "CUSTOMER",
  amendment_type: "CONTACT_CORRECTION",
  status: "APPROVED",
  requested_values: { new_phone: "9222222222" },
  approved_values: { approved_phone: "9222222222" },
  reason: "Decision smoke.",
  approved_by_username: "smoke.admin",
  approved_at: "2026-05-26T14:00:00Z",
  created_at: "2026-05-26T10:00:00Z",
  workflow_capability: {
    category: "NON_FINANCIAL",
    can_execute_directly: true,
  },
  audit_timeline: [
    { event: "Request created", status: "COMPLETED", timestamp: "2026-05-26T10:00:00Z" }
  ],
  decision_sheet_summary: {
    workflow_category: "NON_FINANCIAL"
  }
};

async function mockApis(page: Page) {
  await page.route("**/api/v1/admin/contract-amendments/99/?", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockAmendment) });
  });
  await page.route("**/api/v1/admin/business-profile/**", async (route) => {
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Use fallback branding." }) });
  });
}

test.describe("admin amendment decision sheet print", () => {
  test.use({ storageState: authStatePath("admin") });

  test("renders decision sheet properly and hides print toolbar when printing", async ({ page }) => {
    await mockApis(page);
    await page.goto("/admin/contract-amendments/99/decision-sheet/print");

    await expect(page.getByText("CONTRACT AMENDMENT DECISION SHEET")).toBeVisible();
    await expect(page.getByText("AMD-DECISION-001")).toBeVisible();
    await expect(page.getByText("This document is read-only evidence. It does not create payment, receipt, accounting, reconciliation, stock, delivery, lucky draw, waiver, commission, payout, rent/lease demand, deposit, or contract mutation.")).toBeVisible();

    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("button", { name: "Print / Save PDF" })).toHaveCount(0);
    await page.emulateMedia({ media: "screen" });
  });
});
