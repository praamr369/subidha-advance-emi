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

// ── Navigation v2 — 14 canonical modules ─────────────────────────────────────
//
// Group order here matches the canonical business module taxonomy:
//   docs/architecture/admin-module-taxonomy.md
//   docs/architecture/admin-route-migration-map.md
//
// Rules:
//  - All routes must remain reachable (no path deletions).
//  - Items moved between groups here are navigation-only changes.
//  - Items marked migrate_then_alias in the migration map still point to the
//    current legacy paths until canonical path aliases are created (Phase 2+).
//  - Manufacturing is kept as group 15 (not in canonical 14) until a decision
//    to merge or expand it is made.

export const ADMIN_ROUTE_TREE: AdminRouteRegistryItem[] = [
  // ── 1. Command Center ─────────────────────────────────────────────────────
  item("Command Center", "Admin Dashboard", ROUTES.admin.dashboard, "Daily overview, critical KPIs, urgent queues, and quick actions."),
  item("Command Center", "Today Work / Operations", ROUTES.admin.todayWork, "Daily exception and action queue."),
  item("Command Center", "Operations Command Center", ROUTES.admin.operationsCommandCenter, "Cross-module operational controls."),
  item("Command Center", "Global Search", ROUTES.admin.globalSearch, "Search across customers, contracts, payments, and operations."),
  item("Command Center", "Notifications", ROUTES.admin.notifications, "In-app system alerts, job outcomes, and operational signals."),
  item("Command Center", "AI Assistant", ROUTES.admin.aiAssistant, "Read-only internal knowledge assistant with source citations."),
  item("Command Center", "AI Readiness", ROUTES.admin.aiReadiness, "AI feature flags, retrieval posture, and safety readiness checks."),
  item("Command Center", "ERP Home", ROUTES.admin.erp, "Unified ERP command center."),

  // ── 2. Profiles & Parties ─────────────────────────────────────────────────
  // Phase 2: canonical /admin/profiles/* routes are now live as redirect aliases.
  // Old paths remain active; new canonical paths are linked here.
  // Legacy → canonical:
  //   /admin/customers       → /admin/profiles/customers (migrate_then_alias)
  //   /admin/partners        → /admin/profiles/partners  (migrate_then_alias)
  //   /admin/vendors         → /admin/profiles/vendors   (migrate_then_alias)
  //   /admin/hr/staff        → /admin/profiles/staff     (keep_temporarily)
  //   /admin/branches        → /admin/profiles/branches  (migrate_then_alias)
  //   /admin/crm/parties     → /admin/profiles/parties   (migrate_then_alias)
  item("Profiles & Parties", "Profiles Hub", ROUTES.admin.profiles, "Master identity landing page for all profile sub-modules."),
  item("Profiles & Parties", "Customers", ROUTES.admin.profilesCustomers, "Customer register and identity cockpit."),
  item("Profiles & Parties", "Partners", ROUTES.admin.profilesPartners, "Partner register and identity cockpit.", {
    children: [
      // Phase 6: partner collection requests remain here as a controlled approval queue under Partners.
      // Approval or rejection updates request status only; no commission/payout/payment records are created
      // from this page. Documented: kept in Profiles & Parties (not CRM & Requests) because the
      // approve/reject action is partner-relationship-owned, not a generic inbound request queue.
      // Partner payment requests (intake queue only) are classified under CRM & Requests (Phase 6).
      item("Profiles & Parties", "Partner Collections", ROUTES.admin.partnersCollectionRequests, "Controlled approval queue for partner-submitted collection reports. Approve or reject request status only.", {
        badgeSource: "queue.partner_collection_requests_pending",
      }),
    ],
  }),
  item("Profiles & Parties", "Vendors", ROUTES.admin.profilesVendors, "Vendor identity register. Procurement operations remain under Purchases & Vendors."),
  item("Profiles & Parties", "Staff Profiles", ROUTES.admin.profilesStaff, "Staff identity and HR context. Payroll operations remain under HR & Staff."),
  item("Profiles & Parties", "Branches", ROUTES.admin.profilesBranches, "Branch identity and operational status."),
  item("Profiles & Parties", "Party Master", ROUTES.admin.profilesParties, "Party-centric 360 records across customers, partners, vendors, and staff."),

  // ── 3. CRM & Requests ─────────────────────────────────────────────────────
  // Phase 6: CRM & Requests owns demand, follow-up, KYC queues, public enquiries,
  // support intake, subscription request approval, and partner payment intake.
  //
  // What this group answers:
  //   - Who is interested? Who needs follow-up? Which KYC/request is pending?
  //   - Which public enquiry or subscription request needs action?
  //   - What is the next allowed non-financial step?
  //
  // What this group must NOT do:
  //   - Create contracts, payments, journals, stock movements, or commission records.
  //   - Auto-convert subscription requests to contracts.
  //   - Auto-post payment or reconciliation records from request review.
  //
  // /admin/requests/* canonical hub (Phase 6 thin aliases → existing legacy pages):
  item("CRM & Requests", "Requests Hub", ROUTES.admin.requestsHub, "Unified request intake hub. Request intake only — no financial posting from this page."),
  item("CRM & Requests", "CRM Workspace", ROUTES.admin.crmWorkspace, "Lead, customer, and support operating board."),
  item("CRM & Requests", "Leads", ROUTES.admin.crmLeads, "Lead register."),
  item("CRM & Requests", "Pipeline", ROUTES.admin.crmPipeline, "Lead pipeline."),
  item("CRM & Requests", "Follow-ups", ROUTES.admin.crmFollowUps, "Follow-up tasks."),
  item("CRM & Requests", "KYC", ROUTES.admin.crmKyc, "KYC review queue.", {
    badgeSource: "queue.customer_kyc_pending",
  }),
  // Legacy routes (direct paths remain canonical for daily use):
  item("CRM & Requests", "Online Enquiries", ROUTES.admin.onlineEnquiries, "Public enquiry queue. Request intake — no procurement or payment posting from this page."),
  item("CRM & Requests", "Support Requests", ROUTES.admin.supportRequests, "Customer support intake. Request intake — service execution remains in Service Desk."),
  item("CRM & Requests", "Subscription Requests", ROUTES.admin.subscriptionRequests, "Controlled approval queue for subscription requests. Approval follows existing backend workflow — no silent contract/payment creation.", {
    badgeSource: "queue.subscription_requests_pending",
  }),
  // Phase 6: partner payment requests moved here from Profiles & Parties — intake queue only.
  // The page links to collection workspace for review context; no payment is posted from this page.
  item("CRM & Requests", "Partner Payment Requests", ROUTES.admin.partnerPaymentRequests, "Request intake queue for partner-submitted payment reports. No financial posting from this page.", {
    badgeSource: "queue.partner_payment_requests_pending",
  }),
  // Phase 6: canonical /admin/requests/* alias routes — thin server redirects to existing legacy pages.
  item("CRM & Requests", "Online Enquiries (via /requests)", ROUTES.admin.requestsOnlineEnquiries, "Canonical alias → /admin/online-enquiries. Keeps legacy route intact."),
  item("CRM & Requests", "Support (via /requests)", ROUTES.admin.requestsSupport, "Canonical alias → /admin/support-requests. Keeps legacy route intact."),
  item("CRM & Requests", "Subscriptions (via /requests)", ROUTES.admin.requestsSubscriptions, "Canonical alias → /admin/subscription-requests. Keeps legacy route intact."),

  // ── 4. Sales & Contracts ──────────────────────────────────────────────────
  // Rent/lease contract items are included here (canonical route family:
  // /admin/subscriptions, /admin/rent-lease). Collection/delivery sub-tasks
  // for rent/lease live under Collections & Cashier and Delivery & Service.
  item("Sales & Contracts", "Sales Workspace", ROUTES.admin.salesWorkspace, "Sales pipeline and fulfillment handoff."),
  item("Sales & Contracts", "Advance EMI / Subscriptions", `${ROUTES.admin.subscriptions}?plan_type=EMI`, "Advance EMI subscription register."),
  item("Sales & Contracts", "Create Advance EMI Contract", ROUTES.admin.subscriptionsAdvanceEmiCreate, "Create an Advance EMI contract."),
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
  item("Sales & Contracts", "Contract Amendments", ROUTES.admin.contractAmendments, "Admin decision register for amendment requests.", {
    children: [
      item("Sales & Contracts", "Product Recontract Report", ROUTES.admin.contractAmendmentsRecontractReport, "Read-only evidence report for recontract previews and addendum eligibility."),
    ],
  }),
  item("Sales & Contracts", "Products", ROUTES.admin.products, "Product catalog used by contract and sale workflows."),
  item("Sales & Contracts", "Product Workspace", ROUTES.admin.productsWorkspace, "Product operations workspace."),
  item("Sales & Contracts", "Product Masters", ROUTES.admin.productsMasters, "Product category, subcategory, and UOM setup."),
  // Rent / lease contract sub-section
  item("Sales & Contracts", "Rent/Lease Cockpit", ROUTES.admin.rentLease, "Rent and lease cockpit."),
  item("Sales & Contracts", "Rent Contracts", `${ROUTES.admin.subscriptions}?plan_type=RENT`, "Rent contract register."),
  item("Sales & Contracts", "Lease Contracts", `${ROUTES.admin.subscriptions}?plan_type=LEASE`, "Lease contract register."),
  item("Sales & Contracts", "Create Rent", ROUTES.admin.subscriptionsRentCreate, "Create a rent contract."),
  item("Sales & Contracts", "Create Lease", ROUTES.admin.subscriptionsLeaseCreate, "Create a lease contract."),
  item("Sales & Contracts", "Monthly Demands", `${ROUTES.admin.emis}?plan_type=RENT_LEASE`, "Rent and lease monthly demand visibility."),

  // ── 5. Lucky Plan Control ─────────────────────────────────────────────────
  // Phase 3: canonical /admin/lucky-plan/* routes are now live as redirect aliases.
  // Legacy paths remain active:
  //   /admin/batches      → /admin/lucky-plan/batches  (migrate_then_alias)
  //   /admin/lucky-ids    → /admin/lucky-plan/lucky-ids (migrate_then_alias)
  //   /admin/lucky-draws  → /admin/lucky-plan/draws    (migrate_then_alias)
  // Winners route is a documented gap (no dedicated backend endpoint exists).
  item("Lucky Plan Control", "Lucky Plan Control", ROUTES.admin.luckyPlanControl, "Lucky Plan hub: batches, Lucky IDs, draws, and winner audit evidence."),
  item("Lucky Plan Control", "Batches", ROUTES.admin.luckyPlanBatches, "Batch lifecycle and draw scope."),
  item("Lucky Plan Control", "Lucky IDs", ROUTES.admin.luckyPlanLuckyIds, "Lucky ID register and 00–99 allocation grid."),
  item("Lucky Plan Control", "Lucky Draws", ROUTES.admin.luckyPlanDraws, "Draw schedule and execution: commit, reveal, winner evidence."),
  item("Lucky Plan Control", "Winners", ROUTES.admin.luckyPlanWinners, "Winner visibility and EMI waiver audit trail. (Gap: no dedicated winners endpoint yet; see page for detail.)"),

  // ── 6. Collections & Cashier ──────────────────────────────────────────────
  item("Collections & Cashier", "Collection", ROUTES.admin.financeCollect, "Unified collection workspace."),
  item("Collections & Cashier", "Payments", ROUTES.admin.payments, "Payment register."),
  item("Collections & Cashier", "Settlements", ROUTES.admin.settlements, "Bank statement and UPI settlement evidence imports with manual allocations."),
  item("Collections & Cashier", "Day Closes", ROUTES.admin.settlementsDayCloses, "Cashier day close."),

  // ── 7. Finance Operations ─────────────────────────────────────────────────
  // Finance Operations = source-of-money workflow records.
  // Answers: who owes money, who gets money, what came in/out, what is pending.
  // Does NOT include COA, journals, accounting periods, trial balance, P&L,
  // or balance sheet — those are Accounting & Reconciliation.
  item("Finance Operations", "Finance Workspace", ROUTES.admin.finance, "Finance source workflow workspace: receivables, payables, deposits, commissions, payouts, and reversals."),
  item("Finance Operations", "Outstandings", ROUTES.admin.financeOutstandings, "Unified collectible dues across EMI, rent, lease, direct sale, and invoices. Finance source workflow."),
  item("Finance Operations", "Customer Advances", ROUTES.admin.financeCustomerAdvances, "Customer advance liability source records. Finance source workflow."),
  item("Finance Operations", "Deposits", ROUTES.admin.financeDeposits, "Security deposit source records: receipt, refund posture, damage recovery. Finance source workflow.", {
    badgeSource: "queue.deposit_refunds_pending",
  }),
  item("Finance Operations", "Commissions", ROUTES.admin.financeCommissions, "Commission source register: partner earnings from subscription and sale workflows."),
  item("Finance Operations", "Payout Batches", ROUTES.admin.financePayoutBatches, "Partner payout batches: source payout obligations before accounting bridge."),
  item("Finance Operations", "Reversal Control", ROUTES.admin.financeReversalControl, "Audited admin pipeline for cancellation, reversal, returns, refunds, and customer-credit decisions."),
  item("Finance Operations", "Reversal Reconciliation", ROUTES.admin.financeReversalReconciliation, "Queue for unresolved reversal, refund, stock return, and delivery return links."),

  // ── 8. Accounting & Reconciliation ────────────────────────────────────────
  item("Accounting & Reconciliation", "Reconciliation", ROUTES.admin.financeCanonicalReconciliation, "Reconciliation queue.", {
    badgeSource: "queue.reconciliation_pending",
  }),
  item("Accounting & Reconciliation", "Accounting Control Center", ROUTES.admin.accountingControlCenter, "Accounting KPIs and controls."),
  item("Accounting & Reconciliation", "Accounting Setup", ROUTES.admin.accountingSetup, "Finance account to COA mappings."),
  item("Accounting & Reconciliation", "Chart of Accounts", ROUTES.admin.accountingChartOfAccounts, "Chart of accounts."),
  item("Accounting & Reconciliation", "Finance Accounts", ROUTES.admin.accountingFinanceAccounts, "Finance account register."),
  item("Accounting & Reconciliation", "Journals", ROUTES.admin.accountingJournals, "Journal entry register."),
  item("Accounting & Reconciliation", "Books", ROUTES.admin.accountingBooks, "Money movement control center.", {
    children: [
      item("Accounting & Reconciliation", "Cash Book", ROUTES.admin.accountingBooksCash, "Cash book."),
      item("Accounting & Reconciliation", "Bank Book", ROUTES.admin.accountingBooksBank, "Bank book."),
      item("Accounting & Reconciliation", "UPI Book", ROUTES.admin.accountingBooksUpi, "UPI book."),
      item("Accounting & Reconciliation", "Sales Book", ROUTES.admin.accountingBooksSales, "Sales book."),
      item("Accounting & Reconciliation", "Purchase Book", ROUTES.admin.accountingBooksPurchase, "Purchase book."),
    ],
  }),
  item("Accounting & Reconciliation", "GST / Tax Invoices", ROUTES.admin.accountingGst, "GST workspace and tax invoice register.", {
    children: [
      item("Accounting & Reconciliation", "Tax Invoices", ROUTES.admin.accountingTaxInvoices, "Tax invoice register."),
      item("Accounting & Reconciliation", "Credit Notes", ROUTES.admin.accountingCreditNotes, "Accounting credit note register."),
      item("Accounting & Reconciliation", "Debit Notes", ROUTES.admin.accountingDebitNotes, "Accounting debit note register."),
    ],
  }),
  item("Accounting & Reconciliation", "Accounting Periods", ROUTES.admin.accountingPeriods, "Period locks, close readiness, and year-end close governance."),
  item("Accounting & Reconciliation", "Trial Balance", ROUTES.admin.accountingTrialBalance, "Trial balance report."),
  item("Accounting & Reconciliation", "Profit & Loss", ROUTES.admin.accountingProfitLoss, "Profit and loss report."),
  item("Accounting & Reconciliation", "Balance Sheet", ROUTES.admin.accountingBalanceSheet, "Balance sheet report."),

  // ── 9. Inventory & Stock ──────────────────────────────────────────────────
  item("Inventory & Stock", "Inventory Dashboard", ROUTES.admin.inventory, "Inventory operations workspace."),
  item("Inventory & Stock", "Items / Products", ROUTES.admin.inventoryItems, "Inventory item master."),
  item("Inventory & Stock", "Stock on Hand", ROUTES.admin.inventoryStockOnHand, "Current stock posture."),
  item("Inventory & Stock", "Stock Ledger", ROUTES.admin.inventoryLedger, "Stock ledger."),
  item("Inventory & Stock", "Movements", ROUTES.admin.inventoryMovements, "Stock movement register."),
  item("Inventory & Stock", "Adjustments", ROUTES.admin.inventoryAdjustments, "Stock adjustment workflow."),
  item("Inventory & Stock", "Opening Stock", ROUTES.admin.inventoryOpeningStock, "Opening stock setup."),
  item("Inventory & Stock", "Locations", ROUTES.admin.inventoryLocations, "Stock locations."),
  item("Inventory & Stock", "Valuation", ROUTES.admin.inventoryValuation, "Inventory valuation visibility."),
  item("Inventory & Stock", "Demand Planning", ROUTES.admin.inventoryDemandPlanning, "Inventory demand planning."),
  item("Inventory & Stock", "Purchase Needs", ROUTES.admin.inventoryPurchaseNeeds, "Purchase need planning."),
  item("Inventory & Stock", "Readiness", ROUTES.admin.inventoryReadiness, "Inventory readiness checks."),
  item("Inventory & Stock", "Profiles", ROUTES.admin.inventoryProfiles, "Inventory profiles."),

  // ── 10. Purchases & Vendors ───────────────────────────────────────────────
  // Purchase source workflow: vendor profile → request → order → receipt → stock increase
  //   → purchase bill → vendor payable → vendor payment → accounting bridge → reconciliation.
  // Vendor identity/profile remains under Profiles & Parties (/admin/profiles/vendors).
  // /admin/vendors is the procurement operations register (keep_temporarily per migration map).
  item("Purchases & Vendors", "Purchases Hub", ROUTES.admin.purchases, "Purchase source workflow: request → order → receipt → bill → payable → payment. Vendor procurement chain."),
  item("Purchases & Vendors", "Purchase Requests", ROUTES.admin.purchaseRequests, "Purchase request register. First step in the purchase source workflow."),
  item("Purchases & Vendors", "Purchase Orders", ROUTES.admin.purchaseOrders, "Purchase order register. Authorised procurement commitments."),
  item("Purchases & Vendors", "Purchase Receipts", ROUTES.admin.purchaseReceipts, "Purchase receipt register. Goods receipt creates stock ledger IN entries."),
  item("Purchases & Vendors", "Purchase Bills", ROUTES.admin.purchaseBills, "Purchase bill register. Bills create vendor payable obligations."),
  item("Purchases & Vendors", "Vendor Payables", ROUTES.admin.purchaseVendorPayables, "Vendor payable source: payable obligations from entered purchase bills."),
  item("Purchases & Vendors", "Vendor Payments", ROUTES.admin.purchaseVendorPayments, "Vendor payment register: payments against vendor payable source records."),
  item("Purchases & Vendors", "Vendor Returns", ROUTES.admin.purchaseVendorReturns, "Vendor return register."),
  item("Purchases & Vendors", "Vendors", ROUTES.admin.vendors, "Vendor procurement register. Vendor identity/profile is under Profiles & Parties."),
  item("Purchases & Vendors", "Vendor Products", ROUTES.admin.vendorsProducts, "Vendor product catalog."),
  item("Purchases & Vendors", "Vendor Ledger", ROUTES.admin.vendorsLedger, "Vendor payable ledger entries."),
  item("Purchases & Vendors", "Vendor Outstanding", ROUTES.admin.vendorsOutstanding, "Vendor payable outstanding summary."),
  item("Purchases & Vendors", "Vendor Settlements", ROUTES.admin.accountingVendorSettlements, "Vendor settlement workflow."),
  item("Purchases & Vendors", "Quotes / Sourcing", ROUTES.admin.vendorsQuotes, "Vendor quote requests and sourcing.", {
    children: [
      item("Purchases & Vendors", "Vendor Sourcing", ROUTES.admin.vendorsSourcing, "Read-only sourcing suggestions based on location and score."),
    ],
  }),

  // ── 11. Manufacturing ─────────────────────────────────────────────────────
  // Not in canonical 14; kept until a module decision is made.
  item("Manufacturing", "Manufacturing Dashboard", ROUTES.admin.manufacturing, "Manufacturing operations."),
  item("Manufacturing", "BOMs", ROUTES.admin.manufacturingBoms, "Bill of materials."),
  item("Manufacturing", "Production Jobs", ROUTES.admin.manufacturingJobs, "Production jobs."),

  // ── 12. Delivery & Service ────────────────────────────────────────────────
  // Includes rent/lease possession, handover, and return inspection routes.
  item("Delivery & Service", "Deliveries", ROUTES.admin.deliveries, "Delivery register for subscription and direct-sale handoffs."),
  item("Delivery & Service", "Delivery Workspace", ROUTES.admin.deliveryWorkspace, "Handover and delivery document workflow."),
  item("Delivery & Service", "Delivery Returns", ROUTES.admin.deliveryReturns, "Delivery return workflow."),
  item("Delivery & Service", "Possession / Handover", `${ROUTES.admin.deliveries}?plan_type=RENT_LEASE`, "Rent and lease possession and handover queue."),
  item("Delivery & Service", "Return Inspections", `${ROUTES.admin.serviceDeskReturns}?plan_type=RENT_LEASE`, "Rent and lease return inspection queue."),
  item("Delivery & Service", "Cases", ROUTES.admin.serviceDesk, "Service desk cases."),
  item("Delivery & Service", "Complaints", ROUTES.admin.serviceDeskComplaints, "Complaint register."),
  item("Delivery & Service", "Returns", ROUTES.admin.serviceDeskReturns, "Return queue."),
  item("Delivery & Service", "Tickets", ROUTES.admin.serviceDeskTickets, "Service ticket register."),

  // ── 13. HR & Staff ────────────────────────────────────────────────────────
  // Phase 7: HR & Staff owns people operations only.
  // Answers: who works for the business? Is the staff profile complete?
  //          Is onboarding complete? Is attendance configured? Is payroll setup complete?
  //          Which salary sheet/payment workflow applies? Which documents/KYC are attached?
  // Does NOT own: payroll journal auto-posting, accounting bridge reconciliation,
  //               reconciliation evidence — those belong to Accounting & Reconciliation.
  item("HR & Staff", "HR Dashboard", ROUTES.admin.hr, "Staff HR workspace: daily command center for staff profiles, onboarding workflow, attendance, payroll setup, and salary payment source. No payroll accounting posting from this group."),
  item("HR & Staff", "Staff", ROUTES.admin.hrStaff, "Staff profile source: recruit, onboard, and manage staff records. Payroll setup and salary payment remain separate controlled workflows. No payroll/accounting posting from staff creation."),
  item("HR & Staff", "Attendance", ROUTES.admin.hrAttendance, "Attendance source workflow: mark and review attendance records. Attendance does not auto-generate payroll sheets or salary payments."),
  item("HR & Staff", "Payroll", ROUTES.admin.hrPayroll, "Payroll setup: configure staff pay basis, salary effective dates, and payroll periods. Salary sheets and salary payments are separate steps. No payroll journal posting from this page."),
  item("HR & Staff", "Salary Payments", ROUTES.admin.hrSalaryPayments, "Salary payment source: record and view salary payments against existing salary sheets. Payroll accounting bridge status and reconciliation evidence are in Accounting & Reconciliation."),
  item("HR & Staff", "Leave", ROUTES.admin.hrLeave, "Onboarding workflow — leave: approve or reject staff leave requests through the existing leave workflow."),
  item("HR & Staff", "Expenses", ROUTES.admin.hrExpenses, "Employee expense claims: approve or reject claims through the existing expense workflow. No journal posting from this page."),
  item("HR & Staff", "Staff Documents", ROUTES.admin.hrStaffDocuments, "Staff documents and KYC: upload, maintain, and toggle active/inactive status. Document verify/reject requires backend support — documented as a gap."),

  // ── 14. BI & Reports ──────────────────────────────────────────────────────
  item("BI & Reports", "BI Dashboards", ROUTES.admin.bi, "Read-only chart and trend control center."),
  item("BI & Reports", "Reports Center", ROUTES.admin.reportsCenter, "SME report catalog and report launch center."),
  item("BI & Reports", "Reports", ROUTES.admin.reports, "Classic operational report shortcuts."),
  item("BI & Reports", "Revenue", ROUTES.admin.reportsRevenue, "Revenue report."),
  item("BI & Reports", "Collections", ROUTES.admin.reportsCollections, "Collections report."),
  item("BI & Reports", "Overdue", ROUTES.admin.reportsOverdue, "Overdue report."),
  item("BI & Reports", "Customer Analytics", ROUTES.admin.reportsCustomerAnalytics, "Customer analytics."),
  item("BI & Reports", "Batch Performance", ROUTES.admin.reportsBatchPerformance, "Batch performance report."),
  item("BI & Reports", "Partner Reports", ROUTES.admin.reportsPartners, "Partner performance report."),
  item("BI & Reports", "Waiver Loss", ROUTES.admin.reportsWaiverLoss, "Waiver and loss visibility."),

  // ── 15. Settings & Governance ─────────────────────────────────────────────
  item("Settings & Governance", "Settings", ROUTES.admin.settings, "Settings cockpit."),
  item("Settings & Governance", "Staff Users", ROUTES.admin.settingsUsers, "Internal staff users."),
  item("Settings & Governance", "Roles & Permissions", ROUTES.admin.settingsRolesPermissions, "Role setup and access control."),
  item("Settings & Governance", "Business Profile", ROUTES.admin.settingsBusinessSetupProfile, "Business profile."),
  item("Settings & Governance", "Business Setup", ROUTES.admin.settingsBusinessSetup, "Fresh-start readiness, finance setup, branch/counter setup, documents, inventory onboarding."),
  item("Settings & Governance", "Business Setup Checklist", ROUTES.admin.settingsBusinessSetupChecklist, "Setup readiness checklist."),
  item("Settings & Governance", "Counters / Cash Desks", ROUTES.admin.counters, "Cash counter and desk configuration."),
  item("Settings & Governance", "Finance Setup", ROUTES.admin.settingsFinance, "Finance setup."),
  item("Settings & Governance", "Document Numbering", ROUTES.admin.settingsBusinessSetupDocumentNumbering, "Invoice and receipt sequence readiness and configuration."),
  item("Settings & Governance", "Public Site Settings", ROUTES.admin.settingsBusinessSetupPublicSite, "Public site settings."),
  item("Settings & Governance", "Brand & Business Data Center", ROUTES.admin.brandData, "Public business profile, social links, and media reference center."),
  item("Settings & Governance", "Imports / Backups", ROUTES.admin.settingsImports, "Import, export, and readiness tools."),
  item("Settings & Governance", "Policies", ROUTES.admin.settingsPolicies, "Policy settings."),
  // Audit logs were missing from navigation — added here (gap filled)
  item("Settings & Governance", "Audit Logs", ROUTES.admin.auditLogs, "System-wide audit trail."),
  item("Settings & Governance", "Audit Events", ROUTES.admin.auditEvents, "Granular audit event log."),
];

export const ADMIN_ROUTE_ALIASES: Record<string, string> = {
  "/admin/setup/readiness": ROUTES.admin.settingsBusinessSetup,
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
  // Phase 4: Finance Operations canonical alias — old /admin/outstandings still works directly.
  // /admin/finance/outstandings is the new canonical navigation entry point.
  "/admin/finance/reconciliation": ROUTES.admin.financeCanonicalReconciliation,
  // Phase 6: canonical /admin/requests/* aliases → existing legacy request pages.
  // Legacy paths remain live and unchanged; these are additive thin redirects only.
  [ROUTES.admin.requestsOnlineEnquiries]: ROUTES.admin.onlineEnquiries,
  [ROUTES.admin.requestsSupport]: ROUTES.admin.supportRequests,
  [ROUTES.admin.requestsSubscriptions]: ROUTES.admin.subscriptionRequests,
};

function flattenTree(items: AdminRouteRegistryItem[]): AdminRouteRegistryItem[] {
  return items.flatMap((row) => [
    row,
    ...(row.children ? flattenTree(row.children) : []),
  ]);
}

export const ADMIN_ROUTE_REGISTRY: AdminRouteRegistryItem[] = flattenTree(ADMIN_ROUTE_TREE);
