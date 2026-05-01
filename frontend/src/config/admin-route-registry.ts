import { ROUTES } from "@/lib/routes";

export type AdminRouteRegistryItem = {
  label: string;
  href: string;
  group: string;
  permission: "ADMIN";
  description: string;
  status: "active" | "deferred";
  badgeSource?: string;
  children?: AdminRouteRegistryItem[];
};

function item(
  group: string,
  label: string,
  href: string,
  description: string,
  options: Partial<Pick<AdminRouteRegistryItem, "badgeSource" | "children" | "status">> = {}
): AdminRouteRegistryItem {
  return {
    label,
    href,
    group,
    permission: "ADMIN",
    description,
    status: options.status ?? "active",
    badgeSource: options.badgeSource,
    children: options.children,
  };
}

export const ADMIN_ROUTE_TREE: AdminRouteRegistryItem[] = [
  item("Command Center", "Admin Dashboard", ROUTES.admin.dashboard, "Daily overview, critical KPIs, urgent queues, and quick actions."),
  item("Command Center", "ERP Home", ROUTES.admin.erp, "Unified CRM and ERP command center."),
  item("Command Center", "Today's Work", ROUTES.admin.todayWork, "Daily exception and action queue."),
  item("Command Center", "Operations Command Center", ROUTES.admin.operationsCommandCenter, "Cross-module operational controls."),
  item("Command Center", "Reports & Analytics", ROUTES.admin.reports, "Business reports and analytics."),
  item("Command Center", "Reports center (ERP)", ROUTES.admin.reportsCenter, "Curated read-only reports with CSV/PDF export and filters."),
  item("Command Center", "BI Control Center", ROUTES.admin.bi, "Read-only chart and trend control center."),
  item("Command Center", "AI Assistant", ROUTES.admin.aiAssistant, "Read-only internal knowledge assistant with source citations."),
  item("Command Center", "AI Readiness", ROUTES.admin.aiReadiness, "AI feature flags, retrieval posture, and safety readiness checks."),
  item("Command Center", "Global Search", ROUTES.admin.globalSearch, "Search across customers, contracts, payments, and operations."),
  item("Command Center", "Notifications", ROUTES.admin.notifications, "In-app system alerts, job outcomes, and operational signals."),

  item("Staff & Business Setup", "Staff Workspace", ROUTES.admin.hr, "Daily HR command center for staff, attendance, leave, expenses, and payroll."),
  item("Staff & Business Setup", "Staff Register", ROUTES.admin.hrStaff, "Create and manage staff profiles."),
  item("Staff & Business Setup", "Attendance", ROUTES.admin.hrAttendance, "Mark and review attendance."),
  item("Staff & Business Setup", "Salary / Payroll", ROUTES.admin.hrPayroll, "Payroll periods, salary sheets, and payable posture."),
  item("Staff & Business Setup", "Salary Payments", ROUTES.admin.hrSalaryPayments, "Salary payment register."),
  item("Staff & Business Setup", "Leave Requests", ROUTES.admin.hrLeave, "Approve or reject leave requests."),
  item("Staff & Business Setup", "Expense Claims", ROUTES.admin.hrExpenses, "Approve or reject employee expense claims."),
  item("Staff & Business Setup", "Staff Documents", ROUTES.admin.hrStaffDocuments, "Manage staff KYC and agreement documents."),
  item("Staff & Business Setup", "Roles & Permissions", ROUTES.admin.settingsRolesPermissions, "Role setup and access control."),
  item("Staff & Business Setup", "Branches", ROUTES.admin.branches, "Branch configuration."),
  item("Staff & Business Setup", "Counters / Cash Desks", ROUTES.admin.counters, "Cash counter and desk configuration."),

  item("CRM", "CRM Workspace", ROUTES.admin.crmWorkspace, "Lead, customer, and support operating board."),
  item("CRM", "Party 360", ROUTES.admin.crmParties, "Party-centric 360 records across customers, partners, vendors, and staff."),
  item("CRM", "Customers", ROUTES.admin.customers, "Customer register."),
  item("CRM", "Leads / Enquiries", ROUTES.admin.leads, "Lead and enquiry pipeline."),
  item("CRM", "Follow-ups", ROUTES.admin.remindersPaymentReminders, "Follow-up and payment reminder tasks."),
  item("CRM", "KYC Verification", `${ROUTES.admin.customers}?kyc_status=PENDING`, "Customer KYC review queue.", {
    badgeSource: "queue.customer_kyc_pending",
  }),
  item("CRM", "Support / Service Cases", ROUTES.admin.supportRequests, "Customer support and service intake."),

  item("Sales", "Sales Workspace", ROUTES.admin.salesWorkspace, "Sales pipeline and fulfillment handoff."),
  item("Sales", "Direct Sales", ROUTES.admin.billingDirectSaleWorkspace, "Direct-sale billing workspace and register."),
  item(
    "Sales",
    "Create Direct Sale Invoice",
    `${ROUTES.admin.billingDirectSaleWorkspace}?mode=create`,
    "Open full-page direct-sale invoice creation."
  ),
  item("Sales", "Invoices", ROUTES.admin.billingInvoices, "Invoice register."),
  item("Sales", "Receipts", ROUTES.admin.billingReceipts, "Receipt register."),
  item("Sales", "Document Register", ROUTES.admin.billingRegister, "Billing document register."),
  item("Sales", "Payment Collection", ROUTES.admin.financeCollect, "Admin payment collection entry point."),

  item("Subscriptions", "Subscription Workflows", ROUTES.admin.subscriptions, "Advance EMI, rent, lease, and partner subscription workflow landing."),
  item("Subscriptions", "Advance EMI", `${ROUTES.admin.subscriptions}?plan_type=EMI&workflow=advance`, "Advance EMI contract workflow.", {
    children: [
      item("Subscriptions", "Create Advance EMI Contract", ROUTES.admin.subscriptionsAdvanceEmiCreate, "Create an Advance EMI contract."),
      item("Subscriptions", "Batch Register", ROUTES.admin.batches, "Batch lifecycle and draw scope."),
      item("Subscriptions", "Lucky ID Register", ROUTES.admin.luckyIds, "Lucky ID register."),
      item("Subscriptions", "Subscription Register", `${ROUTES.admin.subscriptions}?plan_type=EMI`, "Advance EMI subscription register."),
      item("Subscriptions", "Subscribed Customers", `${ROUTES.admin.customers}?has_subscription=true`, "Customers with subscriptions."),
      item("Subscriptions", "EMI Schedule / EMI Register", ROUTES.admin.emis, "EMI schedule and register."),
      item("Subscriptions", "Payments", `${ROUTES.admin.payments}?plan_type=EMI`, "Advance EMI payment register."),
      item("Subscriptions", "Lucky Draws", ROUTES.admin.luckyDraws, "Lucky draw schedule and execution."),
      item("Subscriptions", "Winners", `${ROUTES.admin.luckyDraws}?status=COMPLETED`, "Winner outcomes."),
      item("Subscriptions", "Waiver / Loss Report", ROUTES.admin.reportsWaiverLoss, "Waiver and loss visibility."),
      item("Subscriptions", "Delivery Requests", `${ROUTES.admin.deliveries}?source=subscription`, "Delivery requests for subscriptions."),
    ],
  }),
  item("Subscriptions", "Rent", `${ROUTES.admin.subscriptions}?plan_type=RENT&workflow=rent`, "Rent contract workflow.", {
    children: [
      item("Subscriptions", "Create Rent Contract", ROUTES.admin.subscriptionsRentCreate, "Create a rent contract."),
      item("Subscriptions", "Rent Contract Register", `${ROUTES.admin.subscriptions}?plan_type=RENT`, "Rent contract register."),
      item("Subscriptions", "Rent Monthly Demands", `${ROUTES.admin.emis}?plan_type=RENT`, "Rent monthly demands."),
      item("Subscriptions", "Rent Payments", `${ROUTES.admin.payments}?plan_type=RENT`, "Rent payment register."),
      item("Subscriptions", "Security Deposits", `${ROUTES.admin.financeDeposits}?plan_type=RENT`, "Rent security deposits."),
      item("Subscriptions", "Possession / Handover", `${ROUTES.admin.deliveries}?plan_type=RENT`, "Rent handover workflow."),
      item("Subscriptions", "Return Inspections", `${ROUTES.admin.serviceDeskReturns}?plan_type=RENT`, "Rent return inspections."),
    ],
  }),
  item("Subscriptions", "Lease", `${ROUTES.admin.subscriptions}?plan_type=LEASE&workflow=lease`, "Lease contract workflow.", {
    children: [
      item("Subscriptions", "Create Lease Contract", ROUTES.admin.subscriptionsLeaseCreate, "Create a lease contract."),
      item("Subscriptions", "Lease Contract Register", `${ROUTES.admin.subscriptions}?plan_type=LEASE`, "Lease contract register."),
      item("Subscriptions", "Lease Monthly Demands", `${ROUTES.admin.emis}?plan_type=LEASE`, "Lease monthly demands."),
      item("Subscriptions", "Lease Payments", `${ROUTES.admin.payments}?plan_type=LEASE`, "Lease payment register."),
      item("Subscriptions", "Security Deposits", `${ROUTES.admin.financeDeposits}?plan_type=LEASE`, "Lease security deposits."),
      item("Subscriptions", "Possession / Handover", `${ROUTES.admin.deliveries}?plan_type=LEASE`, "Lease handover workflow."),
      item("Subscriptions", "Return Inspections", `${ROUTES.admin.serviceDeskReturns}?plan_type=LEASE`, "Lease return inspections."),
    ],
  }),
  item("Subscriptions", "Partner Operations", ROUTES.admin.partnersWorkspace, "Partner workflow for Advance EMI operations.", {
    children: [
      item("Subscriptions", "Partner Register", ROUTES.admin.partners, "Partner directory."),
      item("Subscriptions", "Partner Customers", `${ROUTES.admin.customers}?source=partner`, "Partner-linked customers."),
      item("Subscriptions", "Partner Subscription Requests", `${ROUTES.admin.subscriptionRequests}?source=partner`, "Partner-origin subscription requests.", {
        badgeSource: "queue.subscription_requests_pending",
      }),
      item("Subscriptions", "Partner Payment Requests", ROUTES.admin.partnerPaymentRequests, "Partner payment request queue.", {
        badgeSource: "queue.partner_payment_requests_pending",
      }),
      item("Subscriptions", "Partner Collections", ROUTES.admin.partnersCollectionRequests, "Partner collection queue.", {
        badgeSource: "queue.partner_collection_requests_pending",
      }),
      item("Subscriptions", "Commissions", ROUTES.admin.financeCommissions, "Commission register."),
      item("Subscriptions", "Payout Batches", ROUTES.admin.financePayoutBatches, "Partner payout batches."),
      item("Subscriptions", "Partner Performance", ROUTES.admin.reportsPartners, "Partner performance report."),
    ],
  }),

  item("Product & Inventory", "Product Workspace", ROUTES.admin.productsWorkspace, "Product operations workspace."),
  item("Product & Inventory", "Products", ROUTES.admin.products, "Product catalog."),
  item("Product & Inventory", "Categories", ROUTES.admin.productsMasters, "Product category and master setup."),
  item("Product & Inventory", "Inventory Workspace", ROUTES.admin.inventory, "Inventory operations workspace."),
  item("Product & Inventory", "Stock On Hand", ROUTES.admin.inventoryStockOnHand, "Current stock posture."),
  item("Product & Inventory", "Stock Movements", ROUTES.admin.inventoryMovements, "Stock movement register."),
  item("Product & Inventory", "Stock Adjustments", ROUTES.admin.inventoryAdjustments, "Stock adjustment workflow."),
  item("Product & Inventory", "Stock Ledger", ROUTES.admin.inventoryLedger, "Stock ledger."),
  item("Product & Inventory", "Low Stock", `${ROUTES.admin.inventoryStockOnHand}?below_reorder=1`, "Low stock focus."),
  item("Product & Inventory", "Purchase Suggestions", ROUTES.admin.inventoryValuation, "Purchase and valuation visibility."),
  item("Product & Inventory", "Vendors", ROUTES.admin.accountingVendors, "Vendor register."),
  item("Product & Inventory", "Purchase Bills", ROUTES.admin.accountingPurchaseBills, "Purchase bill register."),

  item("Manufacturing / Quality / Maintenance", "Manufacturing Workspace", ROUTES.admin.manufacturing, "Manufacturing operations."),
  item("Manufacturing / Quality / Maintenance", "BOM", ROUTES.admin.manufacturingBoms, "Bill of materials."),
  item("Manufacturing / Quality / Maintenance", "Production Jobs", ROUTES.admin.manufacturingJobs, "Production jobs."),
  item("Manufacturing / Quality / Maintenance", "Maintenance Requests", ROUTES.admin.serviceDeskTickets, "Maintenance request queue."),
  item("Manufacturing / Quality / Maintenance", "Service Desk Cases", ROUTES.admin.serviceDesk, "Service desk cases."),

  item("Delivery & Returns", "Delivery Workspace", ROUTES.admin.delivery, "Delivery and returns workspace."),
  item("Delivery & Returns", "Create Delivery", ROUTES.admin.deliveryCreate, "Create a delivery record."),
  item("Delivery & Returns", "Delivery Requests", `${ROUTES.admin.deliveries}?queue=requests`, "Delivery request queue.", {
    badgeSource: "queue.blocked_deliveries",
  }),
  item("Delivery & Returns", "Deliveries", `${ROUTES.admin.deliveries}?view=register`, "Delivery register."),
  item("Delivery & Returns", "Handover Notes / Documents", ROUTES.admin.deliveryWorkspace, "Handover and delivery document workflow."),
  item("Delivery & Returns", "Blocked Deliveries", `${ROUTES.admin.deliveries}?status=BLOCKED`, "Blocked delivery queue.", {
    badgeSource: "queue.blocked_deliveries",
  }),
  item("Delivery & Returns", "Rent/Lease Returns", ROUTES.admin.deliveryReturns, "Rent and lease return queue."),
  item("Delivery & Returns", "Return Inspections", `${ROUTES.admin.serviceDeskReturns}?stage=inspection`, "Return inspection queue.", {
    badgeSource: "queue.return_inspections_pending",
  }),
  item("Delivery & Returns", "Damaged Returns", `${ROUTES.admin.serviceDeskReturns}?condition=damaged`, "Damaged returns."),

  item("Finance & Accounting", "Finance Workspace", ROUTES.admin.finance, "Finance operations workspace."),
  item("Finance & Accounting", "Accounting Control Center", ROUTES.admin.accountingControlCenter, "Accounting KPIs and controls."),
  item("Finance & Accounting", "Collections", ROUTES.admin.collections, "Collections register."),
  item("Finance & Accounting", "Dues", ROUTES.admin.emisPending, "Due EMI and demand queue."),
  item("Finance & Accounting", "Overdue", ROUTES.admin.emisOverdue, "Overdue queue.", {
    badgeSource: "queue.overdue_payments",
  }),
  item("Finance & Accounting", "Payment Collection", ROUTES.admin.financeCollect, "Collect customer payment."),
  item("Finance & Accounting", "Reconciliation", ROUTES.admin.financeCanonicalReconciliation, "Reconciliation queue.", {
    badgeSource: "queue.reconciliation_pending",
  }),
  item("Finance & Accounting", "Deposits", ROUTES.admin.financeDeposits, "Security deposits and refunds.", {
    badgeSource: "queue.deposit_refunds_pending",
  }),
  item("Finance & Accounting", "Credit Notes", ROUTES.admin.billingCreditNotes, "Credit note register."),
  item("Finance & Accounting", "Debit Notes", ROUTES.admin.billingDebitNotes, "Debit note register."),
  item("Finance & Accounting", "Finance Accounts", ROUTES.admin.settingsBusinessSetupFinanceAccounts, "Finance account setup."),
  item("Finance & Accounting", "Chart of Accounts", ROUTES.admin.accountingChartOfAccounts, "Chart of accounts."),
  item("Finance & Accounting", "Account Mapping Setup", ROUTES.admin.accountingSetup, "Finance account to COA mappings."),
  item("Finance & Accounting", "Journal Entries", ROUTES.admin.accountingJournals, "Journal entry register."),
  item("Finance & Accounting", "Money Movements", ROUTES.admin.accountingBooks, "Money movement control center."),
  item("Finance & Accounting", "Cash Book", ROUTES.admin.accountingBooksCash, "Cash book."),
  item("Finance & Accounting", "Bank Book", ROUTES.admin.accountingBooksBank, "Bank book."),
  item("Finance & Accounting", "UPI Book", ROUTES.admin.accountingBooksUpi, "UPI book."),
  item("Finance & Accounting", "Document Sequences", ROUTES.admin.billingRegister, "Billing document register."),
  item("Finance & Accounting", "Tax Invoices", ROUTES.admin.accountingTaxInvoices, "Tax invoice register."),
  item("Finance & Accounting", "Vendor Settlements", ROUTES.admin.accountingVendorSettlements, "Vendor settlement workflow."),
  item("Finance & Accounting", "Accounting Periods", ROUTES.admin.accountingPeriods, "Accounting periods."),
  item("Finance & Accounting", "P&L", ROUTES.admin.accountingProfitLoss, "Profit and loss report."),
  item("Finance & Accounting", "Balance Sheet", ROUTES.admin.accountingBalanceSheet, "Balance sheet report."),
  item("Finance & Accounting", "Trial Balance", ROUTES.admin.accountingTrialBalance, "Trial balance report."),
  item("Settings & Setup", "Staff Users", ROUTES.admin.settingsUsers, "Internal staff users."),
  item("Settings & Setup", "Business Profile", ROUTES.admin.settingsBusinessSetupProfile, "Business profile."),
  item("Settings & Setup", "Business Setup Checklist", ROUTES.admin.settingsBusinessSetupChecklist, "Setup readiness checklist."),
  item(
    "Settings & Setup",
    "Document Numbering",
    ROUTES.admin.settingsBusinessSetupDocumentNumbering,
    "Invoice and receipt sequence readiness and configuration."
  ),
  item("Settings & Setup", "Accounting Setup", ROUTES.admin.settingsBusinessSetup, "Accounting and business setup entry point."),
  item("Settings & Setup", "Public Site Settings", ROUTES.admin.settingsBusinessSetupPublicSite, "Public site settings."),
  item("Settings & Setup", "Backup / Export / System Readiness", ROUTES.admin.settingsImports, "Import, export, and readiness tools."),
];

export const ADMIN_ROUTE_ALIASES: Record<string, string> = {
  "/admin/workspace": ROUTES.admin.erp,
  "/admin/lucky-draw": ROUTES.admin.luckyDraws,
  "/admin/lucky-draw/history": ROUTES.admin.luckyDraws,
  "/admin/emi/overdue": ROUTES.admin.emisOverdue,
  "/admin/subscriptions/create": ROUTES.admin.subscriptionsAdvanceEmiCreate,
  "/admin/payments/history": ROUTES.admin.payments,
  "/admin/payments/create": ROUTES.admin.financeCollect,
  "/admin/payments/reconciliation": ROUTES.admin.financeCanonicalReconciliation,
  "/admin/finance/commisions": ROUTES.admin.financeCommissions,
  "/admin/partners/commisions": ROUTES.admin.financeCommissions,
  "/admin/partners/commissions": ROUTES.admin.financeCommissions,
  "/admin/partner/commisions": ROUTES.admin.financeCommissions,
  "/admin/partner/commissions": ROUTES.admin.financeCommissions,
};

function flattenTree(items: AdminRouteRegistryItem[]): AdminRouteRegistryItem[] {
  return items.flatMap((row) => [
    row,
    ...(row.children ? flattenTree(row.children) : []),
  ]);
}

export const ADMIN_ROUTE_REGISTRY: AdminRouteRegistryItem[] = flattenTree(ADMIN_ROUTE_TREE);
