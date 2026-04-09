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
      { label: "Analytics", href: ROUTES.admin.analytics },
      { label: "Reports", href: ROUTES.admin.reports },
      { label: "Support", href: ROUTES.admin.supportRequests },
    ],
  },
  {
    key: "sales-onboarding",
    title: "Sales & Onboarding",
    href: ROUTES.admin.subscriptionRequests,
    description:
      "Lead intake, contract requests, customer onboarding, and subscription creation.",
    operationalFocus:
      "Move demand safely from lead or request into a real customer and contract record.",
    masterDataDirection:
      "Reuses the shared customer and product master; does not duplicate pricing or contract math.",
    routes: [
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
    title: "Collections & EMI",
    href: ROUTES.admin.collections,
    description:
      "Collections, payment review, EMI follow-up, reminders, and reconciliation attention.",
    operationalFocus:
      "Run daily collection operations while preserving the existing EMI and payment source of truth.",
    masterDataDirection:
      "Depends on subscription, EMI, payment, and reconciliation data; never recalculates or replaces their semantics.",
    routes: [
      { label: "Collections", href: ROUTES.admin.collections },
      { label: "Payments", href: ROUTES.admin.payments },
      { label: "EMI Register", href: ROUTES.admin.emis },
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
      { label: "Locations", href: ROUTES.admin.inventoryLocations },
      { label: "Opening Stock", href: ROUTES.admin.inventoryOpeningStock },
      { label: "Batches", href: ROUTES.admin.batches },
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
      "Separate billing documents, accounting books, GST-ready registers, and bridge controls.",
    operationalFocus:
      "Extend the platform beyond EMI-only operations without creating a second uncontrolled truth source.",
    masterDataDirection:
      "Billing mirrors contract state and accounting consumes approved source events through controlled bridges only.",
    routes: [
      { label: "Billing", href: ROUTES.admin.billing },
      { label: "Document Register", href: ROUTES.admin.billingRegister },
      { label: "Direct Sales", href: ROUTES.admin.billingDirectSales },
      { label: "Contracts", href: ROUTES.admin.billingContracts },
      { label: "Accounting", href: ROUTES.admin.accounting },
      { label: "Books", href: ROUTES.admin.accountingBooks },
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
    title: "Billing mirrors",
    description:
      "Billing contracts and documents mirror subscription and delivery state without rewriting EMI truth.",
    href: ROUTES.admin.billingContracts,
  },
  {
    title: "Finance masters",
    description:
      "Chart of accounts, finance accounts, vendors, and periods stay inside the separate accounting subsystem.",
    href: ROUTES.admin.accountingChartOfAccounts,
  },
];
