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
  item("Command Center", "Today Work / Operations", ROUTES.admin.todayWork, "Daily exception and action queue."),
  item("Command Center", "Operations Command Center", ROUTES.admin.operationsCommandCenter, "Cross-module operational controls."),
  item("Command Center", "Global Search", ROUTES.admin.globalSearch, "Search across customers, contracts, payments, and operations."),
  item("Command Center", "Notifications", ROUTES.admin.notifications, "In-app system alerts, job outcomes, and operational signals."),
  item("Command Center", "AI Assistant", ROUTES.admin.aiAssistant, "Read-only internal knowledge assistant with source citations."),
  item("Command Center", "AI Readiness", ROUTES.admin.aiReadiness, "AI feature flags, retrieval posture, and safety readiness checks."),
  item("Command Center", "ERP Home", ROUTES.admin.erp, "Unified ERP command center."),

  item("Sales & Contracts", "Sales Workspace", ROUTES.admin.salesWorkspace, "Sales pipeline and fulfillment handoff."),
  item("Sales & Contracts", "Customers", ROUTES.admin.customers, "Customer register."),
  item("Sales & Contracts", "Products", ROUTES.admin.products, "Product catalog used by contract and sale workflows."),
  item("Sales & Contracts", "Product Workspace", ROUTES.admin.productsWorkspace, "Product operations workspace."),
  item("Sales & Contracts", "Product Masters", ROUTES.admin.productsMasters, "Product category, subcategory, and UOM setup."),
  item("Sales & Contracts", "Advance EMI / Subscriptions", `${ROUTES.admin.subscriptions}?plan_type=EMI`, "Advance EMI subscription register."),
  item("Sales & Contracts", "Create Advance EMI Contract", ROUTES.admin.subscriptionsAdvanceEmiCreate, "Create an Advance EMI contract."),
  item("Sales & Contracts", "Subscription Requests", ROUTES.admin.subscriptionRequests, "Admin subscription request queue.", {
    badgeSource: "queue.subscription_requests_pending",
  }),
  item("Sales & Contracts", "Contract Amendments", ROUTES.admin.contractAmendments, "Admin decision register for amendment requests.", {
    children: [
      item("Sales & Contracts", "Product Recontract Report", ROUTES.admin.contractAmendmentsRecontractReport, "Read-only evidence report for recontract previews and addendum eligibility."),
    ],
  }),
  item("Sales & Contracts", "Batches", ROUTES.admin.batches, "Batch lifecycle and draw scope."),
  item("Sales & Contracts", "Lucky IDs", ROUTES.admin.luckyIds, "Lucky ID register."),
  item("Sales & Contracts", "Lucky Draws", ROUTES.admin.luckyDraws, "Lucky draw schedule and execution."),
  item("Sales & Contracts", "Partners", ROUTES.admin.partnersWorkspace, "Partner workflow for Advance EMI operations.", {
    children: [
      item("Sales & Contracts", "Partner Register", ROUTES.admin.partners, "Partner directory."),
      item("Sales & Contracts", "Partner Payment Requests", ROUTES.admin.partnerPaymentRequests, "Partner payment request queue.", {
        badgeSource: "queue.partner_payment_requests_pending",
      }),
      item("Sales & Contracts", "Partner Collections", ROUTES.admin.partnersCollectionRequests, "Partner collection queue.", {
        badgeSource: "queue.partner_collection_requests_pending",
      }),
    ],
  }),
  item("Sales & Contracts", "Direct Sale", ROUTES.admin.billingDirectSaleWorkspace, "Direct-sale billing workspace and register."),
  item("Sales & Contracts", "Create Direct Sale Invoice", ROUTES.admin.billingDirectSaleCreate, "Open full-page direct-sale invoice creation."),
  item("Sales & Contracts", "Billing / Invoices / Receipts", ROUTES.admin.billing, "Billing cockpit for invoices, receipts, document registers, and returns.", {
    children: [
      item("Sales & Contracts", "Invoices", ROUTES.admin.billingInvoices, "Invoice register."),
      item("Sales & Contracts", "Receipts", ROUTES.admin.billingReceipts, "Receipt register."),
      item("Sales & Contracts", "Document Register", ROUTES.admin.billingRegister, "Billing document register."),
      item("Sales & Contracts", "Credit Notes", ROUTES.admin.billingCreditNotes, "Credit note register."),
      item("Sales & Contracts", "Debit Notes", ROUTES.admin.billingDebitNotes, "Debit note register."),
    ],
  }),
  item("Sales & Contracts", "Deliveries", ROUTES.admin.deliveries, "Delivery register for subscription and direct-sale handoffs."),

  item("Rent / Lease", "Rent/Lease Cockpit", ROUTES.admin.rentLease, "Rent and lease cockpit."),
  item("Rent / Lease", "Rent Contracts", `${ROUTES.admin.subscriptions}?plan_type=RENT`, "Rent contract register."),
  item("Rent / Lease", "Lease Contracts", `${ROUTES.admin.subscriptions}?plan_type=LEASE`, "Lease contract register."),
  item("Rent / Lease", "Create Rent", ROUTES.admin.subscriptionsRentCreate, "Create a rent contract."),
  item("Rent / Lease", "Create Lease", ROUTES.admin.subscriptionsLeaseCreate, "Create a lease contract."),
  item("Rent / Lease", "Deposit Operations", `${ROUTES.admin.financeDeposits}?plan_type=RENT`, "Security deposit operations for rent and lease."),
  item("Rent / Lease", "Unified Collection", `${ROUTES.admin.financeCollect}?workflow=rent-lease`, "Collect rent or lease demands through the existing collection workspace."),
  item("Rent / Lease", "Monthly Demands", `${ROUTES.admin.emis}?plan_type=RENT_LEASE`, "Rent and lease monthly demand visibility."),
  item("Rent / Lease", "Account Mapping / Deposit Mapping", ROUTES.admin.accountingSetup, "Finance account, COA, and deposit mapping setup."),
  item("Rent / Lease", "Possession / Handover", `${ROUTES.admin.deliveries}?plan_type=RENT_LEASE`, "Rent and lease possession and handover queue."),
  item("Rent / Lease", "Return Inspections", `${ROUTES.admin.serviceDeskReturns}?plan_type=RENT_LEASE`, "Rent and lease return inspection queue."),
  item("Rent / Lease", "Delivery Documents", ROUTES.admin.deliveryWorkspace, "Handover and delivery document workflow."),

  item("Accounting & Finance", "Finance Workspace", ROUTES.admin.finance, "Finance operations workspace."),
  item("Accounting & Finance", "Collection", ROUTES.admin.financeCollect, "Unified collection workspace."),
  item("Accounting & Finance", "Payments", ROUTES.admin.payments, "Payment register."),
  item("Accounting & Finance", "Outstandings", ROUTES.admin.outstandings, "Unified collectible dues across EMI, rent, lease, direct sale, and invoices."),
  item("Accounting & Finance", "Settlements", ROUTES.admin.settlements, "Bank statement and UPI settlement evidence imports with manual allocations."),
  item("Accounting & Finance", "Reconciliation", ROUTES.admin.financeCanonicalReconciliation, "Reconciliation queue.", {
    badgeSource: "queue.reconciliation_pending",
  }),
  item("Accounting & Finance", "Accounting Control Center", ROUTES.admin.accountingControlCenter, "Accounting KPIs and controls."),
  item("Accounting & Finance", "Accounting Setup", ROUTES.admin.accountingSetup, "Finance account to COA mappings."),
  item("Accounting & Finance", "Chart of Accounts", ROUTES.admin.accountingChartOfAccounts, "Chart of accounts."),
  item("Accounting & Finance", "Finance Accounts", ROUTES.admin.accountingFinanceAccounts, "Finance account register."),
  item("Accounting & Finance", "Journals", ROUTES.admin.accountingJournals, "Journal entry register."),
  item("Accounting & Finance", "Books", ROUTES.admin.accountingBooks, "Money movement control center.", {
    children: [
      item("Accounting & Finance", "Cash Book", ROUTES.admin.accountingBooksCash, "Cash book."),
      item("Accounting & Finance", "Bank Book", ROUTES.admin.accountingBooksBank, "Bank book."),
      item("Accounting & Finance", "UPI Book", ROUTES.admin.accountingBooksUpi, "UPI book."),
      item("Accounting & Finance", "Sales Book", ROUTES.admin.accountingBooksSales, "Sales book."),
      item("Accounting & Finance", "Purchase Book", ROUTES.admin.accountingBooksPurchase, "Purchase book."),
    ],
  }),
  item("Accounting & Finance", "GST / Tax Invoices", ROUTES.admin.accountingGst, "GST workspace and tax invoice register.", {
    children: [
      item("Accounting & Finance", "Tax Invoices", ROUTES.admin.accountingTaxInvoices, "Tax invoice register."),
      item("Accounting & Finance", "Credit Notes", ROUTES.admin.accountingCreditNotes, "Accounting credit note register."),
      item("Accounting & Finance", "Debit Notes", ROUTES.admin.accountingDebitNotes, "Accounting debit note register."),
    ],
  }),
  item("Accounting & Finance", "Trial Balance", ROUTES.admin.accountingTrialBalance, "Trial balance report."),
  item("Accounting & Finance", "Profit & Loss", ROUTES.admin.accountingProfitLoss, "Profit and loss report."),
  item("Accounting & Finance", "Balance Sheet", ROUTES.admin.accountingBalanceSheet, "Balance sheet report."),
  item("Accounting & Finance", "Commissions", ROUTES.admin.financeCommissions, "Commission register."),
  item("Accounting & Finance", "Payout Batches", ROUTES.admin.financePayoutBatches, "Partner payout batches."),
  item("Accounting & Finance", "Deposits", ROUTES.admin.financeDeposits, "Security deposits and refunds.", {
    badgeSource: "queue.deposit_refunds_pending",
  }),
  item("Accounting & Finance", "Reversal Control", ROUTES.admin.financeReversalControl, "Audited admin pipeline for cancellation, reversal, returns, refunds, and customer-credit decisions."),
  item("Accounting & Finance", "Reversal Reconciliation", ROUTES.admin.financeReversalReconciliation, "Queue for unresolved reversal, refund, stock return, and delivery return links."),

  item("Inventory", "Inventory Dashboard", ROUTES.admin.inventory, "Inventory operations workspace."),
  item("Inventory", "Items / Products", ROUTES.admin.inventoryItems, "Inventory item master."),
  item("Inventory", "Stock on Hand", ROUTES.admin.inventoryStockOnHand, "Current stock posture."),
  item("Inventory", "Stock Ledger", ROUTES.admin.inventoryLedger, "Stock ledger."),
  item("Inventory", "Movements", ROUTES.admin.inventoryMovements, "Stock movement register."),
  item("Inventory", "Adjustments", ROUTES.admin.inventoryAdjustments, "Stock adjustment workflow."),
  item("Inventory", "Opening Stock", ROUTES.admin.inventoryOpeningStock, "Opening stock setup."),
  item("Inventory", "Locations", ROUTES.admin.inventoryLocations, "Stock locations."),
  item("Inventory", "Valuation", ROUTES.admin.inventoryValuation, "Inventory valuation visibility."),
  item("Inventory", "Demand Planning", ROUTES.admin.inventoryDemandPlanning, "Inventory demand planning."),
  item("Inventory", "Purchase Needs", ROUTES.admin.inventoryPurchaseNeeds, "Purchase need planning."),
  item("Inventory", "Readiness", ROUTES.admin.inventoryReadiness, "Inventory readiness checks."),
  item("Inventory", "Profiles", ROUTES.admin.inventoryProfiles, "Inventory profiles."),

  item("Purchase & Vendors", "Vendors", ROUTES.admin.vendors, "Vendor register and operations."),
  item("Purchase & Vendors", "Vendor Products", ROUTES.admin.vendorsProducts, "Vendor product catalog."),
  item("Purchase & Vendors", "Purchase Requests", ROUTES.admin.purchaseRequests, "Purchase request register."),
  item("Purchase & Vendors", "Purchase Orders", ROUTES.admin.purchaseOrders, "Purchase order register."),
  item("Purchase & Vendors", "Purchase Receipts", ROUTES.admin.purchaseReceipts, "Purchase receipt register."),
  item("Purchase & Vendors", "Purchase Bills", ROUTES.admin.purchaseBills, "Purchase bill register."),
  item("Purchase & Vendors", "Vendor Ledger", ROUTES.admin.vendorsLedger, "Vendor payable ledger entries."),
  item("Purchase & Vendors", "Vendor Outstanding", ROUTES.admin.vendorsOutstanding, "Vendor payable outstanding summary."),
  item("Purchase & Vendors", "Vendor Settlements", ROUTES.admin.accountingVendorSettlements, "Vendor settlement workflow."),
  item("Purchase & Vendors", "Vendor Returns", ROUTES.admin.purchaseVendorReturns, "Vendor return register."),
  item("Purchase & Vendors", "Quotes / Sourcing", ROUTES.admin.vendorsQuotes, "Vendor quote requests and sourcing.", {
    children: [
      item("Purchase & Vendors", "Vendor Sourcing", ROUTES.admin.vendorsSourcing, "Read-only sourcing suggestions based on location and score."),
      item("Purchase & Vendors", "Online Enquiries", ROUTES.admin.onlineEnquiries, "Customer purchase intents for sourcing and RFQs."),
    ],
  }),

  item("Manufacturing", "Manufacturing Dashboard", ROUTES.admin.manufacturing, "Manufacturing operations."),
  item("Manufacturing", "BOMs", ROUTES.admin.manufacturingBoms, "Bill of materials."),
  item("Manufacturing", "Production Jobs", ROUTES.admin.manufacturingJobs, "Production jobs."),

  item("CRM / Parties", "CRM Workspace", ROUTES.admin.crmWorkspace, "Lead, customer, and support operating board."),
  item("CRM / Parties", "Leads", ROUTES.admin.crmLeads, "Lead register."),
  item("CRM / Parties", "Pipeline", ROUTES.admin.crmPipeline, "Lead pipeline."),
  item("CRM / Parties", "Follow-ups", ROUTES.admin.crmFollowUps, "Follow-up tasks."),
  item("CRM / Parties", "KYC", ROUTES.admin.crmKyc, "KYC review queue.", {
    badgeSource: "queue.customer_kyc_pending",
  }),
  item("CRM / Parties", "Party Master", ROUTES.admin.crmParties, "Party-centric 360 records across customers, partners, vendors, and staff."),
  item("CRM / Parties", "Online Enquiries", ROUTES.admin.onlineEnquiries, "Public enquiry queue."),
  item("CRM / Parties", "Support Requests", ROUTES.admin.supportRequests, "Customer support intake."),

  item("Service Desk", "Cases", ROUTES.admin.serviceDesk, "Service desk cases."),
  item("Service Desk", "Complaints", ROUTES.admin.serviceDeskComplaints, "Complaint register."),
  item("Service Desk", "Returns", ROUTES.admin.serviceDeskReturns, "Return queue."),
  item("Service Desk", "Tickets", ROUTES.admin.serviceDeskTickets, "Service ticket register."),

  item("HR & Staff", "HR Dashboard", ROUTES.admin.hr, "Daily HR command center."),
  item("HR & Staff", "Staff", ROUTES.admin.hrStaff, "Create and manage staff profiles."),
  item("HR & Staff", "Attendance", ROUTES.admin.hrAttendance, "Mark and review attendance."),
  item("HR & Staff", "Payroll", ROUTES.admin.hrPayroll, "Payroll periods and salary sheets."),
  item("HR & Staff", "Salary Payments", ROUTES.admin.hrSalaryPayments, "Salary payment register."),
  item("HR & Staff", "Leave", ROUTES.admin.hrLeave, "Approve or reject leave requests."),
  item("HR & Staff", "Expenses", ROUTES.admin.hrExpenses, "Employee expense claims."),
  item("HR & Staff", "Staff Documents", ROUTES.admin.hrStaffDocuments, "Manage staff KYC and agreement documents."),

  item("Reports & Analysis", "Reports Center", ROUTES.admin.reportsCenter, "SME report catalog and report launch center."),
  item("Reports & Analysis", "Reports", ROUTES.admin.reports, "Classic operational report shortcuts."),
  item("Reports & Analysis", "Revenue", ROUTES.admin.reportsRevenue, "Revenue report."),
  item("Reports & Analysis", "Collections", ROUTES.admin.reportsCollections, "Collections report."),
  item("Reports & Analysis", "Overdue", ROUTES.admin.reportsOverdue, "Overdue report."),
  item("Reports & Analysis", "Customer Analytics", ROUTES.admin.reportsCustomerAnalytics, "Customer analytics."),
  item("Reports & Analysis", "Batch Performance", ROUTES.admin.reportsBatchPerformance, "Batch performance report."),
  item("Reports & Analysis", "Partner Reports", ROUTES.admin.reportsPartners, "Partner performance report."),
  item("Reports & Analysis", "Waiver Loss", ROUTES.admin.reportsWaiverLoss, "Waiver and loss visibility."),
  item("Reports & Analysis", "BI Dashboards", ROUTES.admin.bi, "Read-only chart and trend control center."),

  item("Settings", "Settings", ROUTES.admin.settings, "Settings cockpit."),
  item("Settings", "Staff Users", ROUTES.admin.settingsUsers, "Internal staff users."),
  item("Settings", "Roles & Permissions", ROUTES.admin.settingsRolesPermissions, "Role setup and access control."),
  item("Settings", "Business Profile", ROUTES.admin.settingsBusinessSetupProfile, "Business profile."),
  item("Settings", "Business Setup", ROUTES.admin.settingsBusinessSetup, "Business setup entry point."),
  item("Settings", "Business Setup Checklist", ROUTES.admin.settingsBusinessSetupChecklist, "Setup readiness checklist."),
  item("Settings", "Branches", ROUTES.admin.branches, "Branch configuration."),
  item("Settings", "Counters / Cash Desks", ROUTES.admin.counters, "Cash counter and desk configuration."),
  item("Settings", "Finance Setup", ROUTES.admin.settingsFinance, "Finance setup."),
  item("Settings", "Document Numbering", ROUTES.admin.settingsBusinessSetupDocumentNumbering, "Invoice and receipt sequence readiness and configuration."),
  item("Settings", "Public Site Settings", ROUTES.admin.settingsBusinessSetupPublicSite, "Public site settings."),
  item("Settings", "Brand & Business Data Center", ROUTES.admin.brandData, "Public business profile, social links, and media reference center."),
  item("Settings", "Setup Readiness", ROUTES.admin.setupReadiness, "Business readiness center for master data, finance accounts, collections, documents, and recontract gates."),
  item("Settings", "Imports / Backups", ROUTES.admin.settingsImports, "Import, export, and readiness tools."),
  item("Settings", "Policies", ROUTES.admin.settingsPolicies, "Policy settings."),
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
