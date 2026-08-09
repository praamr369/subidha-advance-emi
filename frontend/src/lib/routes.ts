export const ROUTES = {
  public: {
    home: "/",
    products: "/products",
    apply: "/apply",
    about: "/about",
    luckyPlan: "/lucky-plan",
    howItWorks: "/how-it-works",
    policies: "/policies",
    terms: "/terms",
    privacy: "/privacy",
    refundCancellation: "/refund-cancellation",
    warranty: "/warranty",
    deliveryPolicy: "/delivery-policy",
    rentalLeasePolicy: "/rental-lease-policy",
    luckyPlanPolicy: "/lucky-plan-policy",
    directSalePolicy: "/direct-sale-policy",
    paymentPolicy: "/payment-policy",
    servicePolicy: "/service-policy",
    grievance: "/grievance",
    dataRequests: "/data-requests",
    businessCompliance: "/business-compliance",
    udyamMsme: "/udyam-msme",
    rent: "/rent",
    lease: "/lease",
    directSale: "/direct-sale",
    visionTrust: "/vision-trust",
    winners: "/winners",
    winnerHistory: "/winner-history",
    fairDraw: "/lucky-plan/fair-draw",
    verifyDraw: "/lucky-plan/verify",
    contact: "/contact",
    blog: "/blog",
    faq: "/faq",
    rulebook: "/rulebook",
    customers: "/customers",
    partners: "/partners",
    legalDisclaimer: "/legal/disclaimer",
    legalTerms: "/legal/terms",
    legalPrivacy: "/legal/privacy",
    legalPolicies: "/legal/policies",
    contracts: "/contracts",
    contractsAdvanceEmi: "/contracts/advance-emi",
    contractsRent: "/contracts/rent",
    contractsLease: "/contracts/lease",
    login: "/login",
    register: "/register",
    unauthorized: "/unauthorized",
  },

  admin: {
    root: "/admin",
    dashboard: "/admin",
    today: "/admin/today",

    // ── Compatibility-alias topology (Phase 9A audit) ─────────────────────────
    // Most canonical "new" routes are thin page-level redirect aliases that
    // point BACK to the legacy route that still hosts the real page. The legacy
    // path is the content owner (classification: keep_temporarily); the canonical
    // path is the alias (classification: alias). These are intentionally preserved
    // and must NOT be deleted in Phase 9A. Request hub routes are the exception:
    // the /admin/requests/* paths are now the real pages, and the legacy request
    // routes redirect forward to them. Direction (canonical → target):
    //   /admin/profiles/customers        → /admin/customers
    //   /admin/profiles/partners         → /admin/partners
    //   /admin/profiles/vendors          → /admin/vendors
    //   /admin/profiles/branches         → /admin/branches
    //   /admin/profiles/staff            → /admin/hr/staff
    //   /admin/profiles/parties          → /admin/crm/parties
    //   /admin/lucky-plan/batches        → /admin/batches
    //   /admin/lucky-plan/lucky-ids      → /admin/lucky-ids
    //   /admin/lucky-plan/draws          → /admin/lucky-draws
    //   /admin/finance/outstandings      → /admin/outstandings
    //   /admin/finance/customer-advances → /admin/customer-advances
    //   /admin/online-enquiries          → /admin/requests/online-enquiries
    //   /admin/support-requests          → /admin/requests/support
    //   /admin/subscription-requests     → /admin/requests/subscriptions
    // Phase 9B (deferred): move more page content into the canonical path, then
    // flip each redirect so the legacy path becomes the alias (migrate_then_alias).
    profiles: "/admin/profiles",
    profilesCustomers: "/admin/customers", // repointed: unified profile lives on the role page
    profilesPartners: "/admin/partners", // repointed
    profilesVendors: "/admin/vendors", // repointed
    profilesStaff: "/admin/hr/staff", // repointed
    profilesBranches: "/admin/branches", // repointed
    profilesParties: "/admin/crm/parties", // repointed

    analytics: "/admin/bi", // repointed: BI dashboard is the analytics index (churn/risk sub-pages keep their own routes)
    analyticsRiskMonitor: "/admin/analytics/risk-monitor",
    analyticsChurnAnalysis: "/admin/analytics/churn-analysis",
    operations: "/admin/operations",
    erp: "/admin/erp",
    todayWork: "/admin/operations/today-work",
    globalSearch: "/admin/global-search",
    notifications: "/admin/notifications",
    bi: "/admin/bi",
    biProfitability: "/admin/bi/profitability",
    biCustomers: "/admin/bi/customers",
    biBatches: "/admin/bi/batches",
    biCashflow: "/admin/bi/cashflow",
    biInventory: "/admin/bi/inventory",
    biHr: "/admin/bi/hr",
    crmWorkspace: "/admin/crm",
    crmAnalytics: "/admin/crm/analytics",
    salesWorkspace: "/admin/billing/direct-sale", // was /admin/sales — now redirected
    serviceWorkspace: "/admin/service-desk", // was /admin/service — now redirected
    workspace: "/admin/erp", // was /admin/workspace — now redirected
    hr: "/admin/hr",
    hrStaff: "/admin/hr/staff",
    hrStaffProfile: "/admin/hr/staff",
    hrAttendance: "/admin/hr/attendance",
    hrPayroll: "/admin/hr/payroll",
    hrSalaryPayments: "/admin/hr/salary-payments",
    hrStaffAdvances: "/admin/hr/staff-advances",
    hrLeave: "/admin/hr/leave",
    hrExpenses: "/admin/hr/expenses",
    hrStaffDocuments: "/admin/hr/staff-documents",
    operationsCommandCenter: "/admin/operations/command-center",
    aiAssistant: "/admin/ai",
    aiSources: "/admin/ai/sources",
    aiQueryLog: "/admin/ai/query-log",
    aiReadiness: "/admin/ai/readiness",
    partnerPaymentRequests: "/admin/partners/collection-requests", // Unified with partnersCollectionRequests
    auditLogs: "/admin/audit-logs",
    auditEvents: "/admin/audit-logs", // repointed: canonical audit page is /admin/audit-logs
    settings: "/admin/settings",
    settingsNavigation: "/admin/settings/navigation",
    settingsUsers: "/admin/settings/users",
    settingsRolesPermissions: "/admin/settings/roles-permissions",
    settingsBusinessSetup: "/admin/settings/business-setup",
    settingsBusinessSetupProfile: "/admin/settings/business-setup/profile",
    settingsBusinessSetupChecklist: "/admin/settings/business-setup/checklist",
    settingsBusinessSetupBranchesDesks: "/admin/settings/business-setup/branches-desks",
    settingsBusinessSetupChartAccounts: "/admin/accounting/chart-of-accounts",
    settingsBusinessSetupStaff: "/admin/settings/business-setup/staff",
    settingsBusinessSetupPrintBranding: "/admin/settings/business-setup/print-branding",
    settingsBusinessSetupEmailSmtp: "/admin/settings/business-setup/email-smtp",
    settingsBusinessSetupFinanceAccounts: "/admin/accounting/finance-accounts",
    settingsBusinessSetupDocumentNumbering: "/admin/settings/business-setup/document-numbering",
    settingsBusinessSetupPublicSite: "/admin/settings/business-setup/brand-data-center",
    settingsBusinessSetupBrandDataCenter: "/admin/settings/business-setup/brand-data-center",
    reviews: "/admin/reviews",
    payables: "/admin/payables",
    settingsBusinessSetupDryRuns: "/admin/settings/business-setup/dry-runs",
    settingsBusinessSetupReset: "/admin/settings/business-setup/reset",
    settingsBusinessSetupDataMigration: "/admin/settings/business-setup/data-migration",
    settingsCompliancePolicies: "/admin/settings/compliance-policies",
    settingsLegalControls: "/admin/settings/legal-controls",
    complianceKyc: "/admin/compliance/kyc",
    revenueWorkbench: "/admin/revenue-workbench",
    financeControl: "/admin/finance-control",
    settingsFinance: "/admin/settings/finance",
    settingsImports: "/admin/settings/imports",
    settingsMasters: "/admin/settings/masters",
    setupReadiness: "/admin/setup/readiness",
    brandData: "/admin/settings/business-setup/brand-data-center",
    branches: "/admin/branches",
    counters: "/admin/counters",
    branchReporting: "/admin/branch-reporting",

    collections: "/admin/collections",
    collectionControlCenter: "/admin/collections/control-center",
    outstandings: "/admin/outstandings",
    finance: "/admin/finance",
    financeDailyClose: "/admin/finance/daily-close",
    financeCollect: "/admin/finance/collect",
    financeOutstandings: "/admin/outstandings", // repointed: canonical customer outstandings page
    financeCustomerCredits: "/admin/finance/customer-credits",
    financeCustomerAdvances: "/admin/finance/customer-credits", // repointed: advances tracked as customer credits
    financeCanonicalReconciliation: "/admin/accounting/bridge-reconciliation",
    financeReconciliation: "/admin/finance/reconciliation",
    financeCommissions: "/admin/finance/commissions",
    financeSettledCommissions: "/admin/finance/commissions/settled",
    financePayoutBatches: "/admin/finance/payout-batches",
    financeDeposits: "/admin/finance/deposits",
    financeRefunds: "/admin/finance/refunds",
    financeReversalControl: "/admin/finance/reversal-control",
    financeReversalReconciliation: "/admin/finance/reversal-reconciliation",
    settlements: "/admin/settlements",
    settlementsDayCloses: "/admin/settlements/day-closes",
    settlementsCashierVariance: "/admin/settlements/cashier-variance",
    settlementsUpiImports: "/admin/settlements/upi-imports",
    settlementsBankImports: "/admin/settlements/bank-imports",
    reconciliation: "/admin/accounting/bridge-reconciliation",
    reportsCenter: "/admin/reports", // was /admin/reports-center — now redirected
    reports: "/admin/reports",
    reportsRevenue: "/admin/reports/revenue",
    reportsCollections: "/admin/reports/collections",
    reportsOverdue: "/admin/reports/overdue",
    reportsCustomerAnalytics: "/admin/reports/customer-analytics",
    reportsBatchPerformance: "/admin/reports/batch-performance",
    reportsPartners: "/admin/reports/partners",
    reportsWaiverLoss: "/admin/reports/waiver-loss",
    reportsMoneyInOut: "/admin/reports/money-in-out",
    leads: "/admin/crm/leads", // was /admin/leads — now redirected
    supportRequests: "/admin/requests/support", // was /admin/support-requests — now canonical is requests/support
    customers: "/admin/customers",
    deliveries: "/admin/deliveries",
    delivery: "/admin/deliveries", // repointed: no /admin/delivery page; canonical is /admin/deliveries
    deliveryCreate: "/admin/deliveries", // repointed: deliveries are spawned from sale/contract cases, no standalone create page. TODO: confirm
    deliveryWorkspace: "/admin/deliveries", // repointed: no dedicated workspace page. TODO: confirm
    deliveryReturns: "/admin/deliveries", // repointed: no customer-returns page (vendor returns live under purchases). TODO: confirm
    deliveryPODCapture: "/admin/deliveries/pod-capture",
    deliveryPODArchive: "/admin/deliveries/pod-archive",
    logisticsCockpit: "/admin/logistics",
    rentLease: "/admin/rent-lease",
    subscriptions: "/admin/subscriptions",
    subscriptionsCreate: "/admin/subscriptions/create",
    subscriptionsAdvanceEmiCreate: "/admin/subscriptions/advance-emi/create",
    subscriptionsRentCreate: "/admin/subscriptions/rent/create",
    subscriptionsLeaseCreate: "/admin/subscriptions/lease/create",
    contractAmendments: "/admin/contract-amendments",
    contractAmendmentsNew: "/admin/contract-amendments/new",
    contractAmendmentsRecontractReport: "/admin/contract-amendments/recontract-report",
    subscriptionRequests: "/admin/requests/product-requests", // was /admin/subscription-requests — now canonical is requests/subscriptions
    payments: "/admin/payments",
    paymentsCreate: "/admin/payments/create",
    paymentsHistory: "/admin/payments/history",
    paymentReconciliation: "/admin/payments/reconciliation", // redirects to /admin/accounting/bridge-reconciliation?view=payments
    emis: "/admin/emis",
    emisPending: "/admin/emis/pending",
    emisOverdue: "/admin/emis/overdue",
    batches: "/admin/batches",
    batchesCreate: "/admin/batches/create",
    products: "/admin/products",
    brochures: "/admin/brochures",
    brochureSettings: "/admin/brochures/settings",
    brochureEnquiries: "/admin/brochures/enquiries",
    brochureQuotations: "/admin/brochures/quotations",
    productsCreate: "/admin/products/create",
    productsImport: "/admin/products/import",
    productsWorkspace: "/admin/products/workspace",
    productsMasters: "/admin/products/masters",
    pimProducts: "/admin/products", // repointed: no /admin/pim/products page; canonical product catalog is /admin/products
    pimProductsCreate: "/admin/pim/products/create",
    pimCategories: "/admin/pim/categories",
    pimCategoriesManage: "/admin/pim/categories/manage",
    partners: "/admin/partners",
    partnersWorkspace: "/admin/partners/workspace",
    partnersCollectionRequests: "/admin/partners/collection-requests",
    reminders: "/admin/reminders",
    remindersPaymentReminders: "/admin/reminders/payment-reminders",
    notificationTemplates: "/admin/reminders/templates",
    luckyIds: "/admin/lucky-ids",
    luckyDraws: "/admin/lucky-draws",

    luckyPlanControl: "/admin/lucky-plan",
    luckyPlanBatches: "/admin/lucky-ids", // repointed: no batches page; lucky-ids is the closest register. TODO: confirm
    luckyPlanLuckyIds: "/admin/lucky-ids", // repointed: canonical page is /admin/lucky-ids
    luckyPlanDraws: "/admin/lucky-draws", // repointed: canonical page is /admin/lucky-draws
    luckyPlanWinners: "/admin/lucky-plan/winners",
    luckyPlanAnalytics: "/admin/lucky-plan/analytics",

    crm: "/admin/crm",
    crmLeads: "/admin/crm/leads",
    crmFollowUps: "/admin/crm/follow-ups",
    crmKyc: "/admin/crm/kyc",
    crmCustomerDetail: "/admin/crm/customers",
    crmParties: "/admin/crm/parties",
    crmLeaderboard: "/admin/crm/leaderboard",

    defaulters: "/admin/defaulters",
    schemes: "/admin/schemes",
    gstrReport: "/admin/reports/gstr",
    amlScreening: "/admin/crm/aml",
    kycReverification: "/admin/crm/kyc/reverification-queue",
    kycExpiryNotifications: "/admin/crm/kyc/expiry-notifications",
    crmDisputes: "/admin/crm/disputes",
    partialPaymentTool: "/admin/reports/partial-payment",
    scheduledReportExport: "/admin/reports/scheduled-export",
    batchAlerts: "/admin/reports/batch-alerts",

    // Phase 6: canonical /admin/requests/* request hub routes
    // These are thin redirect aliases that keep legacy routes intact.
    requestsHub: "/admin/requests",
    requestsOnlineEnquiries: "/admin/requests/online-requests",
    requestsSupport: "/admin/requests/support",
    requestsSubscriptions: "/admin/requests/subscriptions",
    requestsOnlineRequests: "/admin/requests/online-requests",

    // P2D: Enterprise Control
    controlRoot: "/admin/control",
    controlApprovals: "/admin/control/approvals",
    controlPolicies: "/admin/control/policies",
    controlExceptions: "/admin/control/exceptions",
    controlCashSessions: "/admin/control/cash-sessions",
    controlDailyClose: "/admin/control/daily-close",
    controlMonthEndClose: "/admin/control/month-end-close",
    dataQuality: "/admin/data-quality",

    billing: "/admin/billing",
    billingDirectSales: "/admin/billing/direct-sale", // was /admin/billing/direct-sales — duplicate
    billingDirectSaleWorkspace: "/admin/billing/direct-sale",
    billingDirectSaleCreate: "/admin/billing/direct-sale/create",
    salesDirectSaleCreate: "/admin/billing/direct-sale/create",
    billingRegister: "/admin/billing/register",
    billingDailyBook: "/admin/billing/dailybook",
    billingCashBook: "/admin/billing/cashbook",
    billingInvoices: "/admin/billing/invoices",
    billingReceipts: "/admin/billing/receipts",
    billingContracts: "/admin/billing/contracts",
    billingCreditNotes: "/admin/billing/credit-notes",
    billingDebitNotes: "/admin/billing/debit-notes",
    billingDocuments: "/admin/billing/documents",
    billingReversals: "/admin/billing/reversals",
    billingReversalWorkbench: "/admin/billing/reversal-workbench",


    inventory: "/admin/inventory",
    inventoryItems: "/admin/inventory/items",
    inventoryLots: "/admin/inventory/lots",
    inventoryLocations: "/admin/inventory/locations",
    inventoryLedger: "/admin/inventory/ledger",
    inventoryMovements: "/admin/inventory/movements",
    inventoryValuation: "/admin/inventory/valuation",
    inventoryWorkspace: "/admin/inventory/workspace",
    inventoryAdjustments: "/admin/inventory/adjustments",
    inventoryOpeningStock: "/admin/inventory/opening-stock",
    inventoryStockOnHand: "/admin/inventory/stock-on-hand",
    inventoryDemandPlanning: "/admin/inventory/demand-planning",
    inventoryPurchaseNeeds: "/admin/inventory/purchase-needs",
    inventoryReadiness: "/admin/inventory/readiness",
    inventoryProfiles: "/admin/inventory/profiles",
    inventoryFinishedGoods: "/admin/inventory/finished-goods",
    inventoryRawMaterials: "/admin/inventory/raw-materials",
    inventoryAccessories: "/admin/inventory/accessories",
    inventoryServiceCatalog: "/admin/inventory/service-catalog",
    inventoryAccessoryVariantGroups: "/admin/inventory/accessory-variant-groups",
    inventoryStockNeeds: "/admin/inventory/stock-needs",
    inventoryReservations: "/admin/inventory/reservations",
    vendors: "/admin/vendors",
    vendorsCategories: "/admin/vendors/categories",
    vendorsQuotes: "/admin/vendors/quotes",
    vendorsSourcing: "/admin/vendors/sourcing",
    onlineEnquiries: "/admin/requests/online-requests", // was /admin/online-enquiries — now canonical is requests/online-requests
    vendorsLedger: "/admin/vendors/ledger",
    vendorsOutstanding: "/admin/vendors/outstanding",
    vendorsPurchases: "/admin/vendors/purchases",
    vendorsProducts: "/admin/vendors/products",
    vendorsSettlements: "/admin/vendors/settlements",
    purchases: "/admin/purchases",
    purchaseOrders: "/admin/purchases/orders",
    purchaseReceipts: "/admin/purchases/receipts",
    purchaseBills: "/admin/purchases/bills",
    purchaseRequests: "/admin/purchases/requests",
    purchaseVendorAgreements: "/admin/purchases/vendor-agreements",
    purchaseVendorPayables: "/admin/vendors/outstanding", // repointed: payables = vendor outstanding
    purchaseVendorPayments: "/admin/vendors/payments", // repointed: canonical vendor payments page
    purchaseVendorReturns: "/admin/purchases/vendor-returns",

    manufacturing: "/admin/manufacturing",
    manufacturingBoms: "/admin/manufacturing/boms",
    manufacturingJobs: "/admin/manufacturing/jobs",

    serviceDesk: "/admin/service-desk",
    serviceDeskCases: "/admin/service-desk/cases",
    serviceDeskComplaints: "/admin/service-desk/complaints",
    serviceDeskReturns: "/admin/service-desk/returns",
    serviceDeskTickets: "/admin/service-desk/tickets",
    warrantyClaims: "/admin/warranty/claims",
    warrantyServiceSchedule: "/admin/warranty/service-schedule",

    accounting: "/admin/accounting",
    accountingControlCenter: "/admin/accounting",
    accountingSetup: "/admin/accounting/setup",
    accountingChartOfAccounts: "/admin/accounting/chart-of-accounts",
    accountingFinanceAccounts: "/admin/accounting/finance-accounts",
    accountingJournals: "/admin/accounting/journals",
    accountingReconciliation: "/admin/accounting/bridge-reconciliation",
    accountingBridgeReconciliation: "/admin/accounting/bridge-reconciliation",
    accountingPeriods: "/admin/accounting/periods",
    accountingBooks: "/admin/accounting/books",
    accountingBooksCash: "/admin/accounting/books/cash",
    accountingBooksBank: "/admin/accounting/books/bank",
    accountingBooksUpi: "/admin/accounting/books/bank", // repointed: two-account model settles UPI into the bank book. TODO: confirm dedicated UPI book intended
    accountingBooksSales: "/admin/accounting/books/sales",
    accountingBooksPurchase: "/admin/accounting/books/purchase",
    accountingGst: "/admin/accounting/gst",
    accountingTaxInvoices: "/admin/accounting/gst/tax-invoices",
    accountingCreditNotes: "/admin/accounting/gst/credit-notes",
    accountingDebitNotes: "/admin/accounting/gst/debit-notes",
    accountingTds: "/admin/accounting/tds",
    accountingTcs: "/admin/accounting/tcs",
    accountingFinanceComplete: "/admin/accounting/finance-complete",
    accountingTrialBalance: "/admin/accounting/reports/trial-balance",
    accountingProfitLoss: "/admin/accounting/reports/profit-loss",
    accountingBalanceSheet: "/admin/accounting/reports/balance-sheet",
    accountingAssets: "/admin/accounting/assets",
    accountingDepreciation: "/admin/accounting/depreciation",
    accountingPurchaseBills: "/admin/accounting/purchase-bills",
    accountingVendors: "/admin/accounting/vendors",
    accountingVendorSettlements: "/admin/accounting/vendor-settlements",
    accountingExpenses: "/admin/accounting/expenses",
    accountingBridges: "/admin/accounting/bridge-reconciliation",
    accountingExports: "/admin/accounting/exports",
    accountingItrPack: "/admin/accounting/exports/itr-pack",
    accountingExportReports: "/admin/accounting/exports/reports",
    accountingFinancialIntelligence: "/admin/accounting/financial-intelligence",
    accountingTrialBalanceCheck: "/admin/accounting/trial-balance-check",
    accountingLiabilityReconciliation: "/admin/accounting/liability-reconciliation",
    // Session 4: HR Consolidation - Routes moved to HR module
    accountingStaff: "/admin/hr/staff", // Redirects to HR (backward compat)
    accountingStaffLedger: "/admin/accounting/staff-ledger", // Financial report - keep in accounting
    accountingExpenseClaims: "/admin/hr/expenses", // repointed: canonical HR expenses page
    accountingAttendance: "/admin/hr/attendance", // Redirects to HR (backward compat)
    accountingLeave: "/admin/hr/leave", // Redirects to HR (backward compat)
    accountingSalary: "/admin/hr/payroll", // Redirects to HR (backward compat)
    closeCockpit: "/admin/close-cockpit",

    // P5: Growth & Offers
    growth: "/admin/growth",
    growthPlanTemplates: "/admin/growth/plan-templates",
    growthOfferPackages: "/admin/growth/offer-packages",
    growthRequests: "/admin/growth/requests",
    growthPartnerPerformance: "/admin/growth/partner-performance",
    growthRetention: "/admin/growth/retention",
  },

  partner: {
    root: "/partner",
    dashboard: "/partner",
    customers: "/partner/customers",
    subscriptions: "/partner/subscriptions",
    subscriptionRequests: "/partner/subscription-requests",
    collections: "/partner/collections",
    collectionRequests: "/partner/collection-requests",
    payments: "/partner/payments",
    commissions: "/partner/commissions",
    payouts: "/partner/payouts",
    catalog: "/partner/catalog",
    contractAmendments: "/partner/contract-amendments",
    kycRequests: "/partner/kyc-requests",
    serviceDesk: "/partner/service-desk",
    reports: "/partner/reports",
    notifications: "/partner/notifications",
    profile: "/partner/profile",
  },

  customer: {
    root: "/customer",
    dashboard: "/customer/dashboard",
    subscriptions: "/customer/subscriptions",
    subscriptionPrepayment: "/customer/subscriptions/:id/prepay-advance-delivery",
    contractAmendments: "/customer/contract-amendments",
    payments: "/customer/payments",
    deliveries: "/customer/deliveries",
    directSales: "/customer/direct-sales",
    support: "/customer/support",
    supportNew: "/customer/support/new",
    notifications: "/customer/notifications",
    profile: "/customer/profile",
  },

  cashier: {
    root: "/cashier",
    dashboard: "/cashier",
    collect: "/cashier/collect",
    collectionControlCenter: "/cashier/collections/control-center",
    payments: "/cashier/payments",
    dayClose: "/cashier/day-close",
    notifications: "/cashier/notifications",
  },

  staff: {
    root: "/staff",
    dashboard: "/staff",
    profile: "/staff/profile",
    attendance: "/staff/attendance",
    payslips: "/staff/payslips",
    salary: "/staff/salary",
    leave: "/staff/leave",
  },

  vendor: {
    root: "/vendor",
    dashboard: "/vendor",
    quotes: "/vendor/quotes",
    orders: "/vendor/orders",
    ledger: "/vendor/ledger",
    outstanding: "/vendor/outstanding",
    purchaseReturns: "/vendor/purchase-returns",
    products: "/vendor/products",
    documents: "/vendor/documents",
    notifications: "/vendor/notifications",
    profile: "/vendor/profile",
  },
};
