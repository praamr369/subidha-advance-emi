import { expect, test } from "@playwright/test";

import { authStatePath } from "./helpers/smoke-data";

test.use({ storageState: authStatePath("admin") });

const leaseContractFixture = {
  id: 802,
  subscription_number: "LEASE-PRINT-802",
  contract_reference: "SUB/LEASE/2026/0001",
  customer: 501,
  customer_id: 501,
  customer_name: "Lease Contract Customer",
  customer_phone: "9000000802",
  product: 302,
  product_id: 302,
  product_name: "Subidha Lease Recliner",
  product_code: "LEASE-RECLINER-01",
  plan_type: "LEASE",
  tenure_months: 12,
  start_date: "2026-05-24",
  total_amount: "72000.00",
  monthly_amount: "6000.00",
  status: "ACTIVE",
  branch_name: "Asansol Main Branch",
  branch_code: "ASN-MAIN",
  fulfillment_status: "HANDED_OVER",
  delivery_status: "DELIVERED",
  created_at: "2026-05-24T09:00:00+05:30",
  financial_summary: {
    paid_amount: "12000.00",
    pending_amount: "60000.00",
    remaining_amount: "60000.00",
    outstanding_amount: "60000.00",
  },
  rent_profile: null,
  lease_profile: {
    security_deposit_percent: "25.00",
    security_deposit_amount: "18000.00",
    refundable_security_deposit: "18000.00",
    buyout_amount: "15000.00",
    ownership_transfer_allowed: true,
    return_condition_status: "NOT_ASSESSED",
    deduction_amount: "0.00",
    refund_amount: "0.00",
    refund_status: "PENDING",
    return_inspection_notes: "Return inspection will be recorded at closure.",
    handover_notes: "Asset handed over with remote and warranty booklet.",
    contract_terms_snapshot: "Customer must keep the leased asset in usable condition and return all accessories at closure.",
    created_at: "2026-05-24T09:00:00+05:30",
    updated_at: "2026-05-24T09:00:00+05:30",
  },
  documents: [],
  deliveries: [],
  emis: [],
};

const customerFixture = {
  id: 501,
  name: "Lease Contract Customer",
  phone: "9000000802",
  email: "lease.contract@example.com",
  address: "Court More, GT Road",
  city: "Asansol",
};

const possessionFixture = {
  id: 601,
  subscription: 802,
  product: 302,
  customer: 501,
  status: "HANDED_OVER",
  handover_date: "2026-05-24",
  expected_return_date: "2027-05-24",
  actual_return_date: null,
  handover_condition_notes: "New condition at handover.",
  return_condition_notes: "",
  serial_number: "RL-ASN-000802",
};

const emptyPage = { count: 0, next: null, previous: null, results: [] };

async function mockRentLeaseContractApis(page: Parameters<typeof test>[0]["page"]) {
  await page.route("**/admin/subscriptions/802/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(leaseContractFixture),
    });
  });
  await page.route("**/admin/customers/501/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(customerFixture),
    });
  });
  await page.route("**/admin/contracts/802/possession/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(possessionFixture),
    });
  });
  await page.route("**/admin/subscriptions/802/timeline/", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(emptyPage) });
  });
  await page.route("**/admin/payments/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(emptyPage) });
  });
}

test("rent lease contract print route renders branded agreement", async ({ page }) => {
  await mockRentLeaseContractApis(page);

  await page.goto("/admin/rent-lease/contracts/802/contract/print");

  await expect(page.getByText("Subidha Furniture").first()).toBeVisible();
  await expect(page.getByText("RENT / LEASE AGREEMENT")).toBeVisible();
  await expect(page.getByText("SUB/LEASE/2026/0001").first()).toBeVisible();
  await expect(page.getByText("Lease Contract Customer").first()).toBeVisible();
  await expect(page.getByText("Subidha Lease Recliner").first()).toBeVisible();
  await expect(page.getByText("LEASE-RECLINER-01").first()).toBeVisible();
  await expect(page.getByText("RL-ASN-000802").first()).toBeVisible();
  await expect(page.getByText("Monthly Lease").first()).toBeVisible();
  await expect(page.getByText("Security Deposit").first()).toBeVisible();
  await expect(page.getByText("Refundable Deposit").first()).toBeVisible();
  await expect(page.getByText("Customer Signature")).toBeVisible();
  await expect(page.getByText("Authorized Signature")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print / Save PDF" })).toBeVisible();
});

test("rent lease subscription detail exposes rent lease contract print link", async ({ page }) => {
  await mockRentLeaseContractApis(page);

  await page.goto("/admin/subscriptions/802");

  const contractLink = page.getByRole("link", { name: "Rent / Lease Contract PDF / Print" }).first();
  await expect(contractLink).toBeVisible();
  await expect(contractLink).toHaveAttribute("href", "/admin/rent-lease/contracts/802/contract/print");
});
