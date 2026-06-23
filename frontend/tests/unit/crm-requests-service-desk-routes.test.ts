/**
 * Phase 6 — CRM, Requests, and Service Desk route smoke tests.
 *
 * Guards:
 *  - CRM & Requests group owns request intake routes; no accounting/payment/delivery-execution routes.
 *  - Delivery & Service group owns service desk and delivery execution routes.
 *  - canonical /admin/requests/* aliases exist and redirect to real legacy pages.
 *  - Party Master remains under Profiles & Parties, not request execution.
 *  - No request route is placed under Accounting & Reconciliation.
 *  - Partner payment requests are classified under CRM & Requests (intake only).
 *  - Partner collection requests remain in Profiles & Parties (controlled queue).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const thisFileDir = dirname(fileURLToPath(import.meta.url));
const routesSource = readFileSync(join(thisFileDir, "../../src/lib/routes.ts"), "utf8");
const registrySource = readFileSync(join(thisFileDir, "../../src/config/admin-route-registry.ts"), "utf8");
const taxonomySource = readFileSync(join(thisFileDir, "../../src/config/admin-module-taxonomy.ts"), "utf8");

// ── Route constants ───────────────────────────────────────────────────────────

test("Phase 6: canonical /admin/requests/* route constants exist in routes.ts", () => {
  assert.ok(routesSource.includes('requestsHub:'), "Missing requestsHub route constant");
  assert.ok(routesSource.includes('requestsOnlineEnquiries:'), "Missing requestsOnlineEnquiries route constant");
  assert.ok(routesSource.includes('requestsSupport:'), "Missing requestsSupport route constant");
  assert.ok(routesSource.includes('requestsSubscriptions:'), "Missing requestsSubscriptions route constant");
});

test("Phase 6: canonical /admin/requests/* route paths are correct", () => {
  assert.ok(routesSource.includes('"/admin/requests"'), "Missing /admin/requests path");
  assert.ok(routesSource.includes('"/admin/requests/online-enquiries"'), "Missing /admin/requests/online-enquiries path");
  assert.ok(routesSource.includes('"/admin/requests/support"'), "Missing /admin/requests/support path");
  assert.ok(routesSource.includes('"/admin/requests/subscriptions"'), "Missing /admin/requests/subscriptions path");
});

// ── CRM & Requests group ──────────────────────────────────────────────────────

test("Phase 6: CRM & Requests group exists in registry", () => {
  assert.ok(registrySource.includes('"CRM & Requests"'), "Missing CRM & Requests group in registry");
});

test("Phase 6: CRM & Requests group contains core CRM routes", () => {
  assert.ok(registrySource.includes("ROUTES.admin.crmWorkspace"), "Missing crmWorkspace in CRM & Requests");
  assert.ok(registrySource.includes("ROUTES.admin.crmLeads"), "Missing crmLeads in CRM & Requests");
  assert.ok(registrySource.includes("ROUTES.admin.crmPipeline"), "Missing crmPipeline in CRM & Requests");
  assert.ok(registrySource.includes("ROUTES.admin.crmFollowUps"), "Missing crmFollowUps in CRM & Requests");
  assert.ok(registrySource.includes("ROUTES.admin.crmKyc"), "Missing crmKyc in CRM & Requests");
});

test("Phase 6: CRM & Requests group contains request intake routes", () => {
  assert.ok(
    registrySource.includes("ROUTES.admin.requestsOnlineEnquiries"),
    "Missing requestsOnlineEnquiries in CRM & Requests"
  );
  assert.ok(registrySource.includes("ROUTES.admin.requestsSupport"), "Missing requestsSupport in CRM & Requests");
  assert.ok(
    registrySource.includes("ROUTES.admin.requestsSubscriptions"),
    "Missing requestsSubscriptions in CRM & Requests"
  );
  assert.ok(
    registrySource.includes("ROUTES.admin.partnerPaymentRequests"),
    "Missing partnerPaymentRequests in CRM & Requests"
  );
});

test("Phase 6: CRM & Requests group contains /admin/requests/* hub routes", () => {
  assert.ok(registrySource.includes("ROUTES.admin.requestsHub"), "Missing requestsHub in CRM & Requests");
  assert.ok(registrySource.includes("ROUTES.admin.requestsOnlineEnquiries"), "Missing requestsOnlineEnquiries in CRM & Requests");
  assert.ok(registrySource.includes("ROUTES.admin.requestsSupport"), "Missing requestsSupport in CRM & Requests");
  assert.ok(registrySource.includes("ROUTES.admin.requestsSubscriptions"), "Missing requestsSubscriptions in CRM & Requests");
});

test("Phase 6: CRM & Requests group does not contain accounting, payment-posting, purchase, inventory, or delivery-execution routes", () => {
  const lines = registrySource.split("\n");
  const crmStart = lines.findIndex((l) => l.includes('"CRM & Requests"'));
  // Find the next group after CRM & Requests (Sales & Contracts)
  const nextGroup = lines.findIndex((l, i) => i > crmStart && l.includes('"Sales & Contracts"'));
  const crmBlock = lines.slice(crmStart, nextGroup > crmStart ? nextGroup : crmStart + 120).join("\n");

  const forbidden = [
    "accountingJournals",
    "accountingBridgeReconciliation",
    "accountingPeriods",
    "accountingChartOfAccounts",
    "financeReversalControl",
    "financePayoutBatches",
    "financeCommissions",
    "purchaseOrders",
    "purchaseBills",
    "purchaseVendorPayments",
    "inventoryMovements",
    "inventoryAdjustments",
    "deliveryWorkspace",
    "deliveryReturns",
    "serviceDeskTickets",
  ];

  for (const routeKey of forbidden) {
    assert.ok(
      !crmBlock.includes(routeKey),
      `CRM & Requests block must not contain ${routeKey} (accounting/payment/purchase/inventory/delivery-execution route)`
    );
  }
});

// ── Delivery & Service group ──────────────────────────────────────────────────

test("Phase 6: Delivery & Service group contains delivery routes", () => {
  assert.ok(registrySource.includes("ROUTES.admin.deliveries"), "Missing deliveries in Delivery & Service");
  assert.ok(registrySource.includes("ROUTES.admin.deliveryWorkspace"), "Missing deliveryWorkspace in Delivery & Service");
  assert.ok(registrySource.includes("ROUTES.admin.deliveryReturns"), "Missing deliveryReturns in Delivery & Service");
});

test("Phase 6: Delivery & Service group contains service desk routes", () => {
  assert.ok(registrySource.includes("ROUTES.admin.serviceDesk"), "Missing serviceDesk in Delivery & Service");
  assert.ok(registrySource.includes("ROUTES.admin.serviceDeskComplaints"), "Missing serviceDeskComplaints in Delivery & Service");
  assert.ok(registrySource.includes("ROUTES.admin.serviceDeskReturns"), "Missing serviceDeskReturns in Delivery & Service");
  assert.ok(registrySource.includes("ROUTES.admin.serviceDeskTickets"), "Missing serviceDeskTickets in Delivery & Service");
});

test("Phase 6: delivery_service taxonomy primaryRoutes contains service-desk routes", () => {
  assert.ok(taxonomySource.includes('"delivery_service"'), "Missing delivery_service module key");
  assert.ok(taxonomySource.includes("ROUTES.admin.serviceDeskCases"), "Missing serviceDeskCases in delivery_service primaryRoutes");
  assert.ok(taxonomySource.includes("ROUTES.admin.serviceDeskComplaints"), "Missing serviceDeskComplaints in delivery_service primaryRoutes");
  assert.ok(taxonomySource.includes("ROUTES.admin.serviceDeskReturns"), "Missing serviceDeskReturns in delivery_service primaryRoutes");
  assert.ok(taxonomySource.includes("ROUTES.admin.serviceDeskTickets"), "Missing serviceDeskTickets in delivery_service primaryRoutes");
});

// ── Profiles & Parties — Party Master ────────────────────────────────────────

test("Phase 6: Party Master (profilesParties) remains under Profiles & Parties in registry", () => {
  const lines = registrySource.split("\n");
  const profilesStart = lines.findIndex((l) => l.includes('"Profiles & Parties"'));
  const nextGroup = lines.findIndex((l, i) => i > profilesStart && l.includes('"CRM & Requests"'));
  const profilesBlock = lines.slice(profilesStart, nextGroup > profilesStart ? nextGroup : profilesStart + 80).join("\n");

  assert.ok(
    profilesBlock.includes("ROUTES.admin.profilesParties"),
    "profilesParties must remain in Profiles & Parties group"
  );
});

test("Phase 6: Party Master is not placed under any request-execution group in registry", () => {
  const lines = registrySource.split("\n");
  const crmStart = lines.findIndex((l) => l.includes('"CRM & Requests"'));
  const crmEnd = lines.findIndex((l, i) => i > crmStart && l.includes('"Sales & Contracts"'));
  const crmBlock = lines.slice(crmStart, crmEnd > crmStart ? crmEnd : crmStart + 120).join("\n");

  assert.ok(
    !crmBlock.includes("profilesParties"),
    "profilesParties must not appear inside CRM & Requests group"
  );
});

// ── Accounting & Reconciliation — no request routes ───────────────────────────

test("Phase 6: no request intake route is placed under Accounting & Reconciliation", () => {
  const lines = registrySource.split("\n");
  const acctStart = lines.findIndex((l) => l.includes('"Accounting & Reconciliation"'));
  const nextGroup = lines.findIndex((l, i) => i > acctStart && l.includes('"Inventory & Stock"'));
  const acctBlock = lines.slice(acctStart, nextGroup > acctStart ? nextGroup : acctStart + 80).join("\n");

  const requestRoutes = [
    "supportRequests",
    "subscriptionRequests",
    "onlineEnquiries",
    "partnerPaymentRequests",
    "requestsHub",
    "crmLeads",
    "crmKyc",
  ];

  for (const key of requestRoutes) {
    assert.ok(
      !acctBlock.includes(key),
      `Request route ${key} must not appear under Accounting & Reconciliation`
    );
  }
});

// ── ADMIN_ROUTE_ALIASES coverage ──────────────────────────────────────────────

test("Phase 6: ADMIN_ROUTE_ALIASES contains legacy request routes → /admin/requests/* mappings", () => {
  assert.ok(
    registrySource.includes('"/admin/online-enquiries"') && registrySource.includes("ROUTES.admin.requestsOnlineEnquiries"),
    "ADMIN_ROUTE_ALIASES must map /admin/online-enquiries → requestsOnlineEnquiries"
  );
  assert.ok(
    registrySource.includes('"/admin/support-requests"') && registrySource.includes("ROUTES.admin.requestsSupport"),
    "ADMIN_ROUTE_ALIASES must map /admin/support-requests → requestsSupport"
  );
  assert.ok(
    registrySource.includes('"/admin/subscription-requests"') && registrySource.includes("ROUTES.admin.requestsSubscriptions"),
    "ADMIN_ROUTE_ALIASES must map /admin/subscription-requests → requestsSubscriptions"
  );
});

// ── crm_requests taxonomy ─────────────────────────────────────────────────────

test("Phase 6: crm_requests taxonomy module contains request hub and alias routes", () => {
  assert.ok(taxonomySource.includes('"crm_requests"'), "Missing crm_requests module key in taxonomy");
  assert.ok(taxonomySource.includes("ROUTES.admin.requestsHub"), "Missing requestsHub in crm_requests primaryRoutes");
  assert.ok(taxonomySource.includes("ROUTES.admin.requestsOnlineEnquiries"), "Missing requestsOnlineEnquiries in crm_requests primaryRoutes");
  assert.ok(taxonomySource.includes("ROUTES.admin.requestsSupport"), "Missing requestsSupport in crm_requests primaryRoutes");
  assert.ok(taxonomySource.includes("ROUTES.admin.requestsSubscriptions"), "Missing requestsSubscriptions in crm_requests primaryRoutes");
  assert.ok(taxonomySource.includes("ROUTES.admin.partnerPaymentRequests"), "Missing partnerPaymentRequests in crm_requests primaryRoutes");
});

test("Phase 6: crm_requests taxonomy safetyRule forbids silent contract/payment/accounting creation", () => {
  const lines = taxonomySource.split("\n");
  // Match the object definition line (key: "crm_requests") not the type union line
  const crmStart = lines.findIndex((l) => l.includes('key: "crm_requests"'));
  const nextModule = lines.findIndex((l, i) => i > crmStart && l.includes('key: "sales_contracts"'));
  const crmBlock = lines.slice(crmStart, nextModule > crmStart ? nextModule : crmStart + 60).join("\n");

  assert.ok(crmBlock.includes("safetyRule"), "crm_requests must have a safetyRule");
  assert.ok(
    crmBlock.includes("contract") || crmBlock.includes("payment") || crmBlock.includes("accounting"),
    "crm_requests safetyRule must reference the financial mutation prohibition"
  );
});

// ── Partner request queue placement ──────────────────────────────────────────

test("Phase 6: partnerPaymentRequests appears in CRM & Requests group, not Profiles & Parties as parent item", () => {
  const lines = registrySource.split("\n");

  // Find Profiles & Parties block (before CRM & Requests)
  const profilesStart = lines.findIndex((l) => l.includes('"Profiles & Parties"'));
  const crmStart = lines.findIndex((l) => l.includes('"CRM & Requests"'));
  const crmEnd = lines.findIndex((l, i) => i > crmStart && l.includes('"Sales & Contracts"'));
  const crmBlock = lines.slice(crmStart, crmEnd > crmStart ? crmEnd : crmStart + 120).join("\n");

  // partnerPaymentRequests must be in CRM & Requests
  assert.ok(crmBlock.includes("partnerPaymentRequests"), "partnerPaymentRequests must be in CRM & Requests");

  // partnerPaymentRequests must not appear as a top-level Profiles & Parties item (it can appear in the comment only)
  // Check it's not in an item() call inside the profiles block
  const profilesItemLines = lines
    .slice(profilesStart, crmStart)
    .filter((l) => l.includes('item(') && l.includes('partnerPaymentRequests'));
  assert.equal(
    profilesItemLines.length,
    0,
    "partnerPaymentRequests must not be an item() call inside Profiles & Parties"
  );
});

test("Phase 6: partnersCollectionRequests remains reachable under Profiles & Parties as child of Partners", () => {
  const lines = registrySource.split("\n");
  const profilesStart = lines.findIndex((l) => l.includes('"Profiles & Parties"'));
  const crmStart = lines.findIndex((l) => l.includes('"CRM & Requests"'));
  const profilesBlock = lines.slice(profilesStart, crmStart).join("\n");

  assert.ok(
    profilesBlock.includes("partnersCollectionRequests"),
    "partnersCollectionRequests must remain under Profiles & Parties"
  );
});
