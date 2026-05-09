import { ROUTES } from "@/lib/routes";

export type AdminEnterpriseRouteLink = {
  label: string;
  href: string;
};

export type AdminEnterpriseModule = {
  key: string;
  title: string;
  href: string;
  description: string;
  operationalFocus: string;
  masterDataDirection: string;
  routes: AdminEnterpriseRouteLink[];
};

export const ADMIN_ENTERPRISE_MODULES: AdminEnterpriseModule[] = [
  {
    key: "control-center",
    title: "Control Center",
    href: ROUTES.admin.dashboard,
    description:
      "Operational cockpit for admin watchlists, analytics, reports, and support visibility.",
    operationalFocus:
      "Cross-module posture, daily action queues, and controlled escalation.",
    masterDataDirection:
      "Consumes signals from every operational module but does not own customer, product, payment, or accounting truth.",
    routes: [
      { label: "Dashboard", href: ROUTES.admin.dashboard },
      { label: "Operations", href: ROUTES.admin.operations },
      { label: "Analytics", href: `${ROUTES.admin.reports}?live=1` },
      { label: "Branch Reporting", href: ROUTES.admin.branchReporting },
      { label: "Reports", href: ROUTES.admin.reports },
      { label: "Support", href: ROUTES.admin.supportRequests },
      { label: "Service Desk", href: ROUTES.admin.serviceDesk },
    ],
  },
  {
    key: "branch-control",
    title: "Branch Control",
    href: ROUTES.admin.branches,
    description:
      "Shared branch, warehouse, and counter governance for multi-branch stock, collection, and reporting control.",
    operationalFocus:
      "Define branches, assign counters to finance books, and keep branch-wise visibility explicit across collection, stock, and branch reporting.",
    masterDataDirection:
      "Acts as a shared governance layer above inventory locations, finance accounts, payments, billing, workforce, and reporting without replacing those source records.",
    routes: [
      { label: "Branches", href: ROUTES.admin.branches },
      { label: "Counters", href: ROUTES.admin.counters },
      { label: "Branch Reporting", href: ROUTES.admin.branchReporting },
    ],
  },
  {
    key: "after-sales-service",
    title: "After-Sales & Service",
    href: ROUTES.admin.serviceDesk,
    description:
      "Complaint escalation, furniture returns, exchanges, and after-sales service operations with explicit stock and finance orchestration.",
    operationalFocus:
      "Run return approval, delivery return, service work, and note posting without free-editing invoices, stock, or journals.",
    masterDataDirection:
      "Consumes party, billing, delivery, product, and inventory references while leaving those source modules authoritative.",
    routes: [
      { label: "Service Desk", href: ROUTES.admin.serviceDesk },
      { label: "Complaints", href: ROUTES.admin.serviceDeskComplaints },
      { label: "Returns", href: ROUTES.admin.serviceDeskReturns },
      { label: "Service Tickets", href: ROUTES.admin.serviceDeskTickets },
    ],
  },
  {
    key: "sales-onboarding",
    title: "Sales & Onboarding",
    href: ROUTES.admin.crm,
    description:
      "Lead intake, party continuity, contract requests, customer onboarding, and subscription creation.",
    operationalFocus:
      "Keep lead-to-party continuity intact while moving demand safely into real customer, direct-sale, or contract records.",
    masterDataDirection:
      "CRM reuses the shared customer, vendor, partner, staff, and product masters without replacing their source records.",
    routes: [
      { label: "CRM", href: ROUTES.admin.crm },
      { label: "Party Directory", href: ROUTES.admin.crmParties },
      { label: "Leads", href: ROUTES.admin.leads },
      {
        label: "Subscription Requests",
        href: ROUTES.admin.subscriptionRequests,
      },
      { label: "Customers", href: ROUTES.admin.customers },
      { label: "Subscriptions", href: ROUTES.admin.subscriptions },
    ],
  },
  {
    key: "collections-emi",
    title: "Collections & Advance EMI",
    href: ROUTES.admin.collections,
    description:
      "Collections, payment review, advance EMI follow-up, reminders, and reconciliation attention.",
    operationalFocus:
      "Run daily collection operations while preserving the existing advance EMI and payment source of truth.",
    masterDataDirection:
      "Depends on subscription, advance EMI, payment, and reconciliation data; never recalculates or replaces their semantics.",
    routes: [
      { label: "Collections", href: ROUTES.admin.collections },
      { label: "Payments", href: ROUTES.admin.payments },
      { label: "Advance EMI Register", href: ROUTES.admin.emis },
      { label: "Reconciliation", href: ROUTES.admin.reconciliation },
    ],
  },
  {
    key: "fulfillment",
    title: "Fulfillment",
    href: ROUTES.admin.deliveries,
    description:
      "Delivery execution, lucky ID control, and draw workflow administration.",
    operationalFocus:
      "Keep delivery, draw, and contract lifecycle concerns separate but operationally linked.",
    masterDataDirection:
      "Consumes subscription, batch, and product truth without rewriting contract or payment history.",
    routes: [
      { label: "Deliveries", href: ROUTES.admin.deliveries },
      { label: "Lucky IDs", href: ROUTES.admin.luckyIds },
      { label: "Lucky Draws", href: ROUTES.admin.luckyDraws },
    ],
  },
  {
    key: "catalog-inventory",
    title: "Catalog & Inventory",
    href: ROUTES.admin.inventory,
    description:
      "Shared product master, batches, stock control, and inventory readiness for future ERP use.",
    operationalFocus:
      "Normalize master data once, then let inventory consume it through explicit stock workflows.",
    masterDataDirection:
      "Product category, subcategory, SKU, and unit live in the shared product master and flow outward into inventory and billing.",
    routes: [
      { label: "Products", href: ROUTES.admin.products },
      { label: "Inventory", href: ROUTES.admin.inventory },
      { label: "Manufacturing", href: ROUTES.admin.manufacturing },
      { label: "Locations", href: ROUTES.admin.inventoryLocations },
      { label: "Opening Stock", href: ROUTES.admin.inventoryOpeningStock },
      { label: "Batches", href: ROUTES.admin.batches },
    ],
  },
  {
    key: "manufacturing-operations",
    title: "Manufacturing",
    href: ROUTES.admin.manufacturing,
    description:
      "BOM governance, production jobs, raw-material issue, WIP tracking, finished-goods receipt, and scrap capture through explicit operational posting.",
    operationalFocus:
      "Run furniture production without free-editing stock or journals; every issue and receipt stays source-linked to a production job.",
    masterDataDirection:
      "Consumes product master and inventory profiles for raw materials and finished goods while leaving stock ledger and accounting bridge as separate truths.",
    routes: [
      { label: "Overview", href: ROUTES.admin.manufacturing },
      { label: "BOM Register", href: ROUTES.admin.manufacturingBoms },
      { label: "Production Jobs", href: ROUTES.admin.manufacturingJobs },
    ],
  },
  {
    key: "partner-finance",
    title: "Partner Finance",
    href: ROUTES.admin.financeCommissions,
    description:
      "Commission exposure, partner payout operations, and settlement control.",
    operationalFocus:
      "Run partner-facing finance separately from customer collections and accounting books.",
    masterDataDirection:
      "Depends on operational commission and payout history; it does not replace those records with accounting abstractions.",
    routes: [
      { label: "Partners", href: ROUTES.admin.partners },
      { label: "Commissions", href: ROUTES.admin.financeCommissions },
      { label: "Payout Queue", href: ROUTES.admin.financeSettledCommissions },
      { label: "Payout Batches", href: ROUTES.admin.financePayoutBatches },
    ],
  },
  {
    key: "billing-accounting",
    title: "Billing & Accounting",
    href: ROUTES.admin.billing,
    description:
      "Separate billing documents, procurement, expense, workforce, accounting books, and bridge controls.",
    operationalFocus:
      "Extend the platform beyond EMI-only operations without creating a second uncontrolled truth source for billing, procurement, salary, or books.",
    masterDataDirection:
      "Billing mirrors contract state, while procurement, expense, and payroll source events flow into accounting through controlled bridges only.",
    routes: [
      { label: "Billing", href: ROUTES.admin.billing },
      { label: "Document Register", href: ROUTES.admin.billingRegister },
      { label: "Direct Sales", href: ROUTES.admin.billingDirectSales },
      { label: "Contracts", href: ROUTES.admin.billingContracts },
      { label: "Vendors", href: ROUTES.admin.accountingVendors },
      { label: "Purchase Bills", href: ROUTES.admin.accountingPurchaseBills },
      { label: "Expenses", href: ROUTES.admin.accountingExpenses },
      { label: "Staff", href: ROUTES.admin.accountingStaff },
      { label: "Attendance", href: ROUTES.admin.accountingAttendance },
      { label: "Leave", href: ROUTES.admin.accountingLeave },
      { label: "Salary", href: ROUTES.admin.accountingSalary },
      { label: "Expense Claims", href: ROUTES.admin.accountingExpenseClaims },
      { label: "Staff Ledger", href: ROUTES.admin.accountingStaffLedger },
      { label: "Accounting", href: ROUTES.admin.accounting },
      { label: "Books", href: ROUTES.admin.accountingBooks },
      { label: "Bridges", href: ROUTES.admin.accountingBridges },
    ],
  },
  {
    key: "governance",
    title: "Governance",
    href: ROUTES.admin.settings,
    description:
      "Audit visibility, settings, access governance, imports, and finance configuration.",
    operationalFocus:
      "Keep controls, imports, and staff administration explicit and reviewable.",
    masterDataDirection:
      "Owns configuration and admin controls, not business-event truth.",
    routes: [
      { label: "Settings", href: ROUTES.admin.settings },
      { label: "Masters", href: ROUTES.admin.settingsMasters },
      { label: "Imports", href: ROUTES.admin.settingsImports },
      { label: "Audit Logs", href: ROUTES.admin.auditLogs },
    ],
  },
];

export const ADMIN_MASTER_DATA_LANES = [
  {
    title: "Product master",
    description:
      "Product, category, subcategory, SKU, and unit stay normalized in the canonical product register.",
    href: ROUTES.admin.products,
  },
  {
    title: "Inventory profiles",
    description:
      "Inventory items and stock locations attach to the shared product master instead of redefining it.",
    href: ROUTES.admin.inventoryItems,
  },
  {
    title: "Manufacturing BOMs",
    description:
      "Manufacturing BOMs and production jobs consume the shared inventory master without creating a duplicate item catalog.",
    href: ROUTES.admin.manufacturingBoms,
  },
  {
    title: "Billing mirrors",
    description:
      "Billing contracts and documents mirror subscription and delivery state without rewriting EMI truth.",
    href: ROUTES.admin.billingContracts,
  },
  {
    title: "Finance masters",
    description:
      "Chart of accounts, finance accounts, vendors, branch counters, and periods stay inside the controlled finance and branch-governance layers.",
    href: ROUTES.admin.accountingChartOfAccounts,
  },
  {
    title: "Branch governance",
    description:
      "Branches and counters add shared operational ownership across stock locations, collections, billing, and reporting without collapsing those modules into one table.",
    href: ROUTES.admin.branches,
  },
  {
    title: "Workforce master",
    description:
      "Staff profiles and attendance stay in the workforce register and feed salary operations without changing auth or subscription truth.",
    href: ROUTES.admin.accountingStaff,
  },
  {
    title: "Party directory",
    description:
      "CRM party master links leads, customers, partners, vendors, and staff without replacing the role-specific source records.",
    href: ROUTES.admin.crmParties,
  },
];
