import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const rootDir = process.cwd();

function read(rel: string): string {
  return readFileSync(join(rootDir, rel), "utf8");
}

const billingServiceSource = read("src/services/billing.ts");
const invoicesPageSource = read("src/app/(dashboard)/admin/billing/invoices/page.tsx");
const cellSource = read("src/app/(dashboard)/admin/billing/invoices/InvoiceDeliveryCell.tsx");
const detailPageSource = read("src/app/(dashboard)/admin/billing/documents/[id]/page.tsx");
const panelSource = read("src/app/(dashboard)/admin/billing/documents/[id]/InvoiceDeliveryPanel.tsx");

// --- The billing service exposes the real delivery rail endpoints ------------

test("billing service wires the invoice delivery endpoints", () => {
  assert.ok(billingServiceSource.includes("getInvoiceDeliveryReadiness"));
  assert.ok(billingServiceSource.includes("createDeliveryFromInvoice"));
  assert.ok(billingServiceSource.includes("confirmInvoiceDelivery"));
  assert.ok(billingServiceSource.includes("/delivery-readiness/"));
  assert.ok(billingServiceSource.includes("/create-delivery/"));
  assert.ok(billingServiceSource.includes("/confirm-delivery/"));
});

test("billing service declares the canonical delivery status union", () => {
  for (const token of [
    "NOT_REQUIRED",
    "PENDING_DELIVERY",
    "PARTIALLY_DELIVERED",
    "DELIVERED",
    "RETURNED",
    "CANCELLED",
    "BLOCKED",
  ]) {
    assert.ok(billingServiceSource.includes(token), `missing status ${token}`);
  }
  assert.ok(billingServiceSource.includes("delivery_summary"));
});

// --- The invoices list page renders a delivery status column -----------------

test("invoices page renders the delivery status cell", () => {
  assert.ok(invoicesPageSource.includes("InvoiceDeliveryCell"));
  assert.ok(invoicesPageSource.includes('header: "Delivery"'));
  assert.ok(invoicesPageSource.includes("onChanged={loadPage}"));
});

// --- The delivery cell only shows backend-driven state (no fakes) -------------

test("delivery cell shows status from backend summary only", () => {
  assert.ok(cellSource.includes("invoice.delivery_summary"));
  // Action availability is gated by backend flags, never assumed.
  assert.ok(cellSource.includes("summary.can_create_delivery"));
  assert.ok(cellSource.includes("summary.can_confirm_delivery"));
  assert.ok(cellSource.includes("summary.delivery_id"));
});

test("delivery cell exposes create, view, and confirm actions conditionally", () => {
  assert.ok(cellSource.includes("Create Delivery"));
  assert.ok(cellSource.includes("View Delivery"));
  assert.ok(cellSource.includes("Confirm Delivery"));
});

test("delivery cell surfaces blockers and loading/error states", () => {
  assert.ok(cellSource.includes('status === "BLOCKED"'));
  assert.ok(cellSource.includes("blockers"));
  assert.ok(cellSource.includes("Creating…"));
  assert.ok(cellSource.includes("Confirming…"));
  assert.ok(cellSource.includes("setError"));
});

test("delivery cell never hard-codes a delivered state", () => {
  // It must not fabricate a delivered badge independent of backend status.
  assert.ok(!/delivery_status\s*[:=]\s*["']DELIVERED["']/.test(cellSource));
});

// --- The invoice detail page wires the richer delivery panel -----------------

test("invoice detail page renders the delivery panel", () => {
  assert.ok(detailPageSource.includes("InvoiceDeliveryPanel"));
  assert.ok(detailPageSource.includes("invoiceId={invoice.id}"));
});

test("delivery panel loads readiness and renders empty/loading/error states", () => {
  assert.ok(panelSource.includes("getInvoiceDeliveryReadiness"));
  assert.ok(panelSource.includes("Loading delivery readiness…"));
  assert.ok(panelSource.includes("No delivery information available."));
  assert.ok(panelSource.includes("Delivery blockers"));
  assert.ok(panelSource.includes("Stock Location"));
});
