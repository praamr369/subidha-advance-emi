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
  { label: "Setup Checklist", href: ROUTES.admin.settingsBusinessSetupChecklist, group: "Command Center", permission: "ADMIN", description: "Pre-production setup checklist", status: "active" },

  { label: "Customers", href: ROUTES.admin.customers, group: "Customer & CRM", permission: "ADMIN", description: "Customer register", status: "active" },
  { label: "Customer KYC", href: ROUTES.admin.customers, group: "Customer & CRM", permission: "ADMIN", description: "Customer KYC review", status: "active", badgeSource: "queue.customer_kyc_pending" },
  { label: "Customer Referrals", href: ROUTES.admin.customers, group: "Customer & CRM", permission: "ADMIN", description: "Referral surfaces", status: "active" },
  { label: "Leads", href: ROUTES.admin.leads, group: "Customer & CRM", permission: "ADMIN", description: "Lead intake queue", status: "active" },
  { label: "CRM Parties", href: ROUTES.admin.crmParties, group: "Customer & CRM", permission: "ADMIN", description: "Party master", status: "active" },
  { label: "Support Requests", href: ROUTES.admin.supportRequests, group: "Customer & CRM", permission: "ADMIN", description: "Support triage", status: "active", badgeSource: "queue.support_requests_pending" },

  { label: "Advance EMI Contracts", href: `${ROUTES.admin.subscriptions}?plan_type=EMI`, group: "Contracts", permission: "ADMIN", description: "Advance EMI contract list", status: "active" },
  { label: "Rent Contracts", href: `${ROUTES.admin.subscriptions}?plan_type=RENT`, group: "Contracts", permission: "ADMIN", description: "Rent contract list", status: "active" },
  { label: "Lease Contracts", href: `${ROUTES.admin.subscriptions}?plan_type=LEASE`, group: "Contracts", permission: "ADMIN", description: "Lease contract list", status: "active" },
  { label: "Subscription Requests", href: ROUTES.admin.subscriptionRequests, group: "Contracts", permission: "ADMIN", description: "Pending subscription requests", status: "active", badgeSource: "queue.subscription_requests_pending" },
  { label: "Contract Lifecycle", href: ROUTES.admin.subscriptions, group: "Contracts", permission: "ADMIN", description: "Lifecycle control", status: "active" },
  { label: "Amendments", href: ROUTES.admin.subscriptions, group: "Contracts", permission: "ADMIN", description: "Amendment surfaces", status: "active" },
  { label: "Product Possession", href: ROUTES.admin.subscriptions, group: "Contracts", permission: "ADMIN", description: "Possession workflow", status: "active" },
  { label: "Return Inspections", href: ROUTES.admin.operationsCommandCenter, group: "Contracts", permission: "ADMIN", description: "Return inspection review", status: "active", badgeSource: "queue.return_inspections_pending" },

  { label: "Partners", href: ROUTES.admin.partners, group: "Partner Operations", permission: "ADMIN", description: "Partner directory", status: "active" },
  { label: "Partner Customers", href: ROUTES.admin.partners, group: "Partner Operations", permission: "ADMIN", description: "Partner customer visibility", status: "active" },
  { label: "Partner Subscription Requests", href: ROUTES.admin.subscriptionRequests, group: "Partner Operations", permission: "ADMIN", description: "Partner-origin requests", status: "active" },
  { label: "Partner Payment Requests", href: ROUTES.admin.partnerPaymentRequests, group: "Partner Operations", permission: "ADMIN", description: "Partner payment request queue", status: "active", badgeSource: "queue.partner_payment_requests_pending" },
  { label: "Partner Collections", href: ROUTES.admin.partnerPaymentRequests, group: "Partner Operations", permission: "ADMIN", description: "Partner collection queue", status: "active", badgeSource: "queue.partner_collection_requests_pending" },
  { label: "Partner Commissions", href: ROUTES.admin.financeCommissions, group: "Partner Operations", permission: "ADMIN", description: "Commission register", status: "active" },
  { label: "Partner Payout Batches", href: ROUTES.admin.financePayoutBatches, group: "Partner Operations", permission: "ADMIN", description: "Payout batch execution", status: "active" },
  { label: "Partner Performance", href: "/admin/reports/partners", group: "Partner Operations", permission: "ADMIN", description: "Partner BI report", status: "active" },

  { label: "Invoices", href: ROUTES.admin.billingInvoices, group: "Billing & Finance", permission: "ADMIN", description: "Invoice register", status: "active" },
  { label: "Receipts", href: ROUTES.admin.billingReceipts, group: "Billing & Finance", permission: "ADMIN", description: "Receipt register", status: "active" },
  { label: "Direct Sales", href: ROUTES.admin.billingDirectSales, group: "Billing & Finance", permission: "ADMIN", description: "Direct sale desk", status: "active" },
  { label: "Credit Notes", href: ROUTES.admin.billingCreditNotes, group: "Billing & Finance", permission: "ADMIN", description: "Credit notes", status: "active" },
  { label: "Debit Notes", href: ROUTES.admin.billingDebitNotes, group: "Billing & Finance", permission: "ADMIN", description: "Debit notes", status: "active" },
  { label: "Payment Collection", href: ROUTES.admin.collections, group: "Billing & Finance", permission: "ADMIN", description: "Collection workspace", status: "active" },
  { label: "Reconciliation", href: ROUTES.admin.reconciliation, group: "Billing & Finance", permission: "ADMIN", description: "Reconciliation queue", status: "active", badgeSource: "queue.reconciliation_pending" },
  { label: "Deposits", href: "/admin/finance/deposits", group: "Billing & Finance", permission: "ADMIN", description: "Deposit register", status: "active" },
  { label: "Finance Accounts", href: ROUTES.admin.settingsBusinessSetupFinanceAccounts, group: "Billing & Finance", permission: "ADMIN", description: "Finance account setup", status: "active" },
  { label: "Chart of Accounts", href: ROUTES.admin.accountingChartOfAccounts, group: "Billing & Finance", permission: "ADMIN", description: "COA register", status: "active" },
  { label: "Account Mapping Setup", href: ROUTES.admin.accountingSetup, group: "Billing & Finance", permission: "ADMIN", description: "Finance account to COA mapping setup", status: "active" },
  { label: "Journal Entries", href: ROUTES.admin.accountingJournals, group: "Billing & Finance", permission: "ADMIN", description: "Journal register", status: "active" },
  { label: "Cash Book", href: ROUTES.admin.accountingBooksCash, group: "Billing & Finance", permission: "ADMIN", description: "Cash book", status: "active" },
  { label: "Bank Book", href: ROUTES.admin.accountingBooksBank, group: "Billing & Finance", permission: "ADMIN", description: "Bank book", status: "active" },
  { label: "UPI Book", href: ROUTES.admin.accountingBooksUpi, group: "Billing & Finance", permission: "ADMIN", description: "UPI book", status: "active" },
  { label: "Trial Balance", href: ROUTES.admin.accountingTrialBalance, group: "Billing & Finance", permission: "ADMIN", description: "Trial balance", status: "active" },
  { label: "Profit & Loss", href: ROUTES.admin.accountingProfitLoss, group: "Billing & Finance", permission: "ADMIN", description: "P&L report", status: "active" },
  { label: "Balance Sheet", href: ROUTES.admin.accountingBalanceSheet, group: "Billing & Finance", permission: "ADMIN", description: "Balance sheet report", status: "active" },

  { label: "Products", href: ROUTES.admin.products, group: "Inventory & Products", permission: "ADMIN", description: "Product catalog", status: "active" },
  { label: "Categories", href: ROUTES.admin.products, group: "Inventory & Products", permission: "ADMIN", description: "Product categories", status: "active" },
  { label: "Inventory Items", href: ROUTES.admin.inventoryItems, group: "Inventory & Products", permission: "ADMIN", description: "Inventory item list", status: "active" },
  { label: "Stock On Hand", href: ROUTES.admin.inventoryStockOnHand, group: "Inventory & Products", permission: "ADMIN", description: "Current stock view", status: "active" },
  { label: "Stock Movements", href: ROUTES.admin.inventoryMovements, group: "Inventory & Products", permission: "ADMIN", description: "Stock movement register", status: "active" },
  { label: "Stock Adjustments", href: ROUTES.admin.inventoryAdjustments, group: "Inventory & Products", permission: "ADMIN", description: "Stock adjustment queue", status: "active" },
  { label: "Stock Ledger", href: ROUTES.admin.inventoryLedger, group: "Inventory & Products", permission: "ADMIN", description: "Stock ledger", status: "active" },
  { label: "Stock Valuation", href: ROUTES.admin.inventoryValuation, group: "Inventory & Products", permission: "ADMIN", description: "Inventory valuation", status: "active" },
  { label: "Low Stock", href: ROUTES.admin.inventoryStockOnHand, group: "Inventory & Products", permission: "ADMIN", description: "Low stock focus", status: "active" },
  { label: "Purchase Suggestions", href: ROUTES.admin.inventoryValuation, group: "Inventory & Products", permission: "ADMIN", description: "Purchase suggestion signals", status: "active" },

  { label: "Vendors", href: ROUTES.admin.accountingVendors, group: "Purchase / Vendor", permission: "ADMIN", description: "Vendor master", status: "active" },
  { label: "Purchase Bills", href: ROUTES.admin.accountingPurchaseBills, group: "Purchase / Vendor", permission: "ADMIN", description: "Purchase bill register", status: "active" },
  { label: "Vendor Settlements", href: ROUTES.admin.accountingVendorSettlements, group: "Purchase / Vendor", permission: "ADMIN", description: "Vendor payout settlements", status: "active" },

  { label: "Raw Materials", href: ROUTES.admin.inventoryItems, group: "Manufacturing / Quality / Maintenance", permission: "ADMIN", description: "Raw material register", status: "active" },
  { label: "Production Jobs", href: ROUTES.admin.manufacturingJobs, group: "Manufacturing / Quality / Maintenance", permission: "ADMIN", description: "Production job queue", status: "active" },
  { label: "Quality Checks", href: ROUTES.admin.serviceDeskComplaints, group: "Manufacturing / Quality / Maintenance", permission: "ADMIN", description: "Quality issue checks", status: "active" },
  { label: "Maintenance Requests", href: ROUTES.admin.serviceDeskTickets, group: "Manufacturing / Quality / Maintenance", permission: "ADMIN", description: "Maintenance ticket queue", status: "active" },

  { label: "Deliveries", href: ROUTES.admin.deliveries, group: "Delivery & Returns", permission: "ADMIN", description: "Delivery management", status: "active" },
  { label: "Delivery Requests", href: ROUTES.admin.deliveries, group: "Delivery & Returns", permission: "ADMIN", description: "Delivery request queue", status: "active" },
  { label: "Handover Notes", href: ROUTES.admin.deliveries, group: "Delivery & Returns", permission: "ADMIN", description: "Delivery handover records", status: "active" },
  { label: "Rent/Lease Returns", href: ROUTES.admin.serviceDeskReturns, group: "Delivery & Returns", permission: "ADMIN", description: "Return workflow queue", status: "active" },
  { label: "Return Inspections", href: ROUTES.admin.operationsCommandCenter, group: "Delivery & Returns", permission: "ADMIN", description: "Inspection action queue", status: "active", badgeSource: "queue.return_inspections_pending" },
  { label: "Blocked Deliveries", href: ROUTES.admin.deliveries, group: "Delivery & Returns", permission: "ADMIN", description: "Blocked stock deliveries", status: "active", badgeSource: "queue.delivery_blocked" },

  { label: "Batches", href: ROUTES.admin.batches, group: "Lucky Plan", permission: "ADMIN", description: "Batch lifecycle", status: "active" },
  { label: "Lucky IDs", href: ROUTES.admin.luckyIds, group: "Lucky Plan", permission: "ADMIN", description: "Lucky ID register", status: "active" },
  { label: "Lucky Draws", href: ROUTES.admin.luckyDraws, group: "Lucky Plan", permission: "ADMIN", description: "Draw schedule", status: "active" },
  { label: "Winners", href: ROUTES.admin.luckyDraws, group: "Lucky Plan", permission: "ADMIN", description: "Winner outcomes", status: "active" },
  { label: "Waiver/Loss Report", href: "/admin/reports/waiver-loss", group: "Lucky Plan", permission: "ADMIN", description: "Waiver and loss report", status: "active" },

  { label: "Staff Users", href: ROUTES.admin.settingsUsers, group: "Staff & Branch", permission: "ADMIN", description: "Internal users", status: "active" },
  { label: "Branches", href: ROUTES.admin.branches, group: "Staff & Branch", permission: "ADMIN", description: "Branch configuration", status: "active" },
  { label: "Counters / Cash Desks", href: ROUTES.admin.counters, group: "Staff & Branch", permission: "ADMIN", description: "Cash counters", status: "active" },
  { label: "Roles & Permissions", href: "/admin/settings/roles", group: "Staff & Branch", permission: "ADMIN", description: "Role policy", status: "active" },

  { label: "Business Profile", href: ROUTES.admin.settingsBusinessSetupProfile, group: "Business Settings", permission: "ADMIN", description: "Business profile settings", status: "active" },
  { label: "Business Setup", href: ROUTES.admin.settingsBusinessSetup, group: "Business Settings", permission: "ADMIN", description: "Business setup wizard", status: "active" },
  { label: "Accounting Setup", href: ROUTES.admin.accountingSetup, group: "Business Settings", permission: "ADMIN", description: "Finance account to COA setup", status: "active" },
  { label: "System Readiness", href: ROUTES.admin.settingsBusinessSetupChecklist, group: "Business Settings", permission: "ADMIN", description: "Readiness and checklist", status: "active" },
  { label: "Backup / Export", href: ROUTES.admin.accountingItrPack, group: "Business Settings", permission: "ADMIN", description: "Operational data export", status: "active" },
];
