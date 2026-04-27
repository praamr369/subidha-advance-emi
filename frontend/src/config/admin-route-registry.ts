import { ROUTES } from "@/lib/routes";

export type AdminRouteRegistryItem = {
  label: string;
  href: string;
  group: string;
  permission: "ADMIN";
  description: string;
  status: "active" | "deferred";
  badgeSource?: string;
};

export const ADMIN_ROUTE_REGISTRY: AdminRouteRegistryItem[] = [
  { label: "Dashboard", href: ROUTES.admin.dashboard, group: "Command Center", permission: "ADMIN", description: "Executive dashboard", status: "active" },
  { label: "Operations Command Center", href: ROUTES.admin.operationsCommandCenter, group: "Command Center", permission: "ADMIN", description: "Cross-module queue control", status: "active" },
  { label: "Accounting Control Center", href: "/admin/accounting/control-center", group: "Command Center", permission: "ADMIN", description: "Accounting KPIs and controls", status: "active" },
  { label: "Reports & Analytics", href: ROUTES.admin.reports, group: "Command Center", permission: "ADMIN", description: "Operational reports and BI", status: "active" },

  { label: "Customers", href: ROUTES.admin.customers, group: "Customer & CRM", permission: "ADMIN", description: "Customer register", status: "active" },
  { label: "KYC Verification", href: ROUTES.admin.customers, group: "Customer & CRM", permission: "ADMIN", description: "Customer KYC review", status: "active", badgeSource: "queue.customer_kyc_pending" },
  { label: "Leads", href: ROUTES.admin.leads, group: "Customer & CRM", permission: "ADMIN", description: "Lead intake queue", status: "active" },
  { label: "Support Requests", href: ROUTES.admin.supportRequests, group: "Customer & CRM", permission: "ADMIN", description: "Support triage", status: "active", badgeSource: "queue.support_requests_pending" },

  { label: "Advance EMI", href: `${ROUTES.admin.subscriptions}?plan_type=EMI`, group: "Contracts", permission: "ADMIN", description: "Advance EMI contract list", status: "active", badgeSource: "queue.overdue_payments" },
  { label: "Rent", href: `${ROUTES.admin.subscriptions}?plan_type=RENT`, group: "Contracts", permission: "ADMIN", description: "Rent contract list", status: "active" },
  { label: "Lease", href: `${ROUTES.admin.subscriptions}?plan_type=LEASE`, group: "Contracts", permission: "ADMIN", description: "Lease contract list", status: "active" },
  { label: "Subscription Requests", href: ROUTES.admin.subscriptionRequests, group: "Contracts", permission: "ADMIN", description: "Pending subscription requests", status: "active", badgeSource: "queue.subscription_requests_pending" },
  { label: "Contract Lifecycle", href: ROUTES.admin.subscriptions, group: "Contracts", permission: "ADMIN", description: "Lifecycle control", status: "active" },

  { label: "Partners", href: ROUTES.admin.partners, group: "Partner Operations", permission: "ADMIN", description: "Partner directory", status: "active" },
  { label: "Partner Customers", href: ROUTES.admin.partners, group: "Partner Operations", permission: "ADMIN", description: "Partner customer visibility", status: "active" },
  { label: "Partner Subscription Requests", href: ROUTES.admin.subscriptionRequests, group: "Partner Operations", permission: "ADMIN", description: "Partner-origin requests", status: "active" },
  { label: "Partner Payment Requests", href: ROUTES.admin.partnerPaymentRequests, group: "Partner Operations", permission: "ADMIN", description: "Partner payment request queue", status: "active", badgeSource: "queue.partner_payment_requests_pending" },
  { label: "Partner Collections", href: ROUTES.admin.partnerPaymentRequests, group: "Partner Operations", permission: "ADMIN", description: "Partner collection queue", status: "active", badgeSource: "queue.partner_collection_requests_pending" },
  { label: "Commissions", href: ROUTES.admin.financeCommissions, group: "Partner Operations", permission: "ADMIN", description: "Commission register", status: "active" },
  { label: "Payouts", href: ROUTES.admin.financePayoutBatches, group: "Partner Operations", permission: "ADMIN", description: "Payout batch execution", status: "active" },
  { label: "Partner Performance", href: "/admin/reports/partners", group: "Partner Operations", permission: "ADMIN", description: "Partner BI report", status: "active" },

  { label: "Invoices", href: ROUTES.admin.billingInvoices, group: "Finance & Billing", permission: "ADMIN", description: "Invoice register", status: "active" },
  { label: "Receipts", href: ROUTES.admin.billingReceipts, group: "Finance & Billing", permission: "ADMIN", description: "Receipt register", status: "active" },
  { label: "Direct Sales", href: ROUTES.admin.billingDirectSales, group: "Finance & Billing", permission: "ADMIN", description: "Direct sale desk", status: "active" },
  { label: "Deposits", href: "/admin/finance/deposits", group: "Finance & Billing", permission: "ADMIN", description: "Deposit register", status: "active" },
  { label: "Reconciliation", href: ROUTES.admin.reconciliation, group: "Finance & Billing", permission: "ADMIN", description: "Reconciliation queue", status: "active", badgeSource: "queue.reconciliation_pending" },
  { label: "Account Mapping", href: ROUTES.admin.accountingSetup, group: "Finance & Billing", permission: "ADMIN", description: "Finance account to COA mapping setup", status: "active" },
  { label: "Finance Accounts", href: ROUTES.admin.settingsBusinessSetupFinanceAccounts, group: "Finance & Billing", permission: "ADMIN", description: "Finance account setup", status: "active" },
  { label: "Chart of Accounts", href: ROUTES.admin.accountingChartOfAccounts, group: "Finance & Billing", permission: "ADMIN", description: "COA register", status: "active" },

  { label: "Products", href: ROUTES.admin.products, group: "Inventory", permission: "ADMIN", description: "Product catalog", status: "active" },
  { label: "Stock", href: ROUTES.admin.inventoryStockOnHand, group: "Inventory", permission: "ADMIN", description: "Current stock view", status: "active" },
  { label: "Low Stock", href: ROUTES.admin.inventoryStockOnHand, group: "Inventory", permission: "ADMIN", description: "Low stock focus", status: "active" },
  { label: "Stock Movement", href: ROUTES.admin.inventoryMovements, group: "Inventory", permission: "ADMIN", description: "Stock movement register", status: "active" },

  { label: "Deliveries", href: ROUTES.admin.deliveries, group: "Delivery", permission: "ADMIN", description: "Delivery management", status: "active" },
  { label: "Delivery Requests", href: ROUTES.admin.deliveries, group: "Delivery", permission: "ADMIN", description: "Delivery request queue", status: "active" },
  { label: "Returns", href: ROUTES.admin.serviceDeskReturns, group: "Delivery", permission: "ADMIN", description: "Return workflow queue", status: "active" },
  { label: "Inspection", href: ROUTES.admin.operationsCommandCenter, group: "Delivery", permission: "ADMIN", description: "Inspection action queue", status: "active", badgeSource: "queue.return_inspections_pending" },

  { label: "Batches", href: ROUTES.admin.batches, group: "Lucky Plan", permission: "ADMIN", description: "Batch lifecycle", status: "active" },
  { label: "Lucky IDs", href: ROUTES.admin.luckyIds, group: "Lucky Plan", permission: "ADMIN", description: "Lucky ID register", status: "active" },
  { label: "Draws", href: ROUTES.admin.luckyDraws, group: "Lucky Plan", permission: "ADMIN", description: "Draw schedule", status: "active" },
  { label: "Winners", href: ROUTES.admin.luckyDraws, group: "Lucky Plan", permission: "ADMIN", description: "Winner outcomes", status: "active" },

  { label: "Staff", href: ROUTES.admin.settingsUsers, group: "Admin", permission: "ADMIN", description: "Internal users", status: "active" },
  { label: "Branch", href: ROUTES.admin.branches, group: "Admin", permission: "ADMIN", description: "Branch configuration", status: "active" },
  { label: "Settings", href: ROUTES.admin.settings, group: "Admin", permission: "ADMIN", description: "System settings", status: "active" },
];
