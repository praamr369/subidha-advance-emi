import { ROUTES } from "@/lib/routes";

export type AdminCanonicalModule =
  | "command_center"
  | "profiles_parties"
  | "crm_requests"
  | "sales_contracts"
  | "lucky_plan"
  | "collections_cashier"
  | "finance_operations"
  | "accounting_reconciliation"
  | "inventory_stock"
  | "purchases_vendors"
  | "delivery_service"
  | "hr_staff"
  | "bi_reports"
  | "settings_governance";

export type AdminModuleEffect = "none" | "profile" | "request" | "contract" | "money" | "stock" | "accounting" | "payroll" | "read_only" | "settings";

export type AdminModuleRouteStatus = "keep" | "alias" | "migrate_then_alias" | "keep_temporarily" | "delete_later";

export type AdminModuleDefinition = {
  key: AdminCanonicalModule;
  label: string;
  description: string;
  canonicalRoot: string;
  effect: AdminModuleEffect;
  safetyRule: string;
  primaryRoutes: string[];
  legacyRoutes?: Array<{ from: string; to: string; status: AdminModuleRouteStatus; note: string }>;
  uiPattern: "role_center" | "object_pages" | "work_queue" | "control_center" | "pos_speed" | "audit_first" | "read_only_bi";
};

export const ADMIN_MODULE_TAXONOMY: AdminModuleDefinition[] = [
  {
    key: "command_center",
    label: "Command Center",
    canonicalRoot: ROUTES.admin.dashboard,
    description: "Daily owner/admin cockpit for urgent queues, cross-module posture, and exception navigation.",
    effect: "none",
    safetyRule: "Command pages should link to controlled workflows and must not mutate financial source records implicitly.",
    uiPattern: "role_center",
    primaryRoutes: [ROUTES.admin.dashboard, ROUTES.admin.operations, ROUTES.admin.todayWork, ROUTES.admin.operationsCommandCenter, ROUTES.admin.globalSearch, ROUTES.admin.notifications],
  },
  {
    key: "profiles_parties",
    label: "Profiles & Parties",
    canonicalRoot: "/admin/profiles",
    description: "Master identity layer for customers, partners, vendors, staff, branches, counters, and party records.",
    effect: "profile",
    safetyRule: "Profile pages may show linked records but must not create payments, journals, stock movements, or reconciliations.",
    uiPattern: "object_pages",
    primaryRoutes: ["/admin/profiles/customers", "/admin/profiles/partners", "/admin/profiles/vendors", "/admin/profiles/staff", "/admin/profiles/branches", "/admin/profiles/parties"],
    legacyRoutes: [
      { from: ROUTES.admin.customers, to: "/admin/profiles/customers", status: "migrate_then_alias", note: "Customer identity cockpit." },
      { from: ROUTES.admin.partners, to: "/admin/profiles/partners", status: "migrate_then_alias", note: "Partner identity cockpit." },
      { from: ROUTES.admin.vendors, to: "/admin/profiles/vendors", status: "migrate_then_alias", note: "Vendor profile distinct from procurement operations." },
      { from: ROUTES.admin.hrStaff, to: "/admin/profiles/staff", status: "keep_temporarily", note: "HR workflow remains under /admin/hr/staff until profile route is added." },
      { from: ROUTES.admin.branches, to: "/admin/profiles/branches", status: "migrate_then_alias", note: "Branch identity separate from system settings." },
      { from: ROUTES.admin.crmParties, to: "/admin/profiles/parties", status: "migrate_then_alias", note: "Party master canonical route." },
    ],
  },
  {
    key: "crm_requests",
    label: "CRM & Requests",
    canonicalRoot: ROUTES.admin.crm,
    description: "Leads, enquiry intake, support requests, KYC queues, follow-ups, subscription request approval, partner payment intake, and public request queues.",
    effect: "request",
    safetyRule: "CRM may create requests but must not silently create contracts, payments, or accounting entries. Subscription request approval follows existing backend workflow only. Partner payment intake links to collection workspace for context but must not post payments directly.",
    uiPattern: "work_queue",
    primaryRoutes: [
      // Core CRM routes
      ROUTES.admin.crm,
      ROUTES.admin.crmLeads,
      ROUTES.admin.crmPipeline,
      ROUTES.admin.crmFollowUps,
      ROUTES.admin.crmKyc,
      // Phase 6: legacy request routes remain under CRM & Requests
      ROUTES.admin.onlineEnquiries,
      ROUTES.admin.supportRequests,
      ROUTES.admin.subscriptionRequests,
      // Phase 6: partner payment intake moved from Profiles & Parties — intake only
      ROUTES.admin.partnerPaymentRequests,
      // Phase 6: canonical /admin/requests/* hub and thin alias routes
      ROUTES.admin.requestsHub,
      ROUTES.admin.requestsOnlineEnquiries,
      ROUTES.admin.requestsSupport,
      ROUTES.admin.requestsSubscriptions,
    ],
  },
  {
    key: "sales_contracts",
    label: "Sales & Contracts",
    canonicalRoot: ROUTES.admin.salesWorkspace,
    description: "Direct sale, Advance EMI contracts, rent/lease contracts, subscription requests, and amendments.",
    effect: "contract",
    safetyRule: "Contract creation must not auto-post collections, journals, delivery stock-out, or reconciliation evidence.",
    uiPattern: "object_pages",
    primaryRoutes: [ROUTES.admin.salesWorkspace, ROUTES.admin.billingDirectSaleWorkspace, ROUTES.admin.billingDirectSaleCreate, ROUTES.admin.subscriptions, ROUTES.admin.subscriptionsAdvanceEmiCreate, ROUTES.admin.subscriptionsRentCreate, ROUTES.admin.subscriptionsLeaseCreate, ROUTES.admin.contractAmendments, ROUTES.admin.rentLease],
  },
  {
    key: "lucky_plan",
    label: "Lucky Plan Control",
    canonicalRoot: "/admin/lucky-plan",
    description: "Batch lifecycle, Lucky ID allocation, draw readiness, winner evidence, and EMI waiver audit.",
    effect: "contract",
    safetyRule: "Lucky draw/winner actions must preserve deterministic evidence and only waive future EMI as approved.",
    uiPattern: "audit_first",
    primaryRoutes: ["/admin/lucky-plan/batches", "/admin/lucky-plan/lucky-ids", "/admin/lucky-plan/draws", "/admin/lucky-plan/winners"],
    legacyRoutes: [
      { from: ROUTES.admin.batches, to: "/admin/lucky-plan/batches", status: "migrate_then_alias", note: "Lucky Plan batch lifecycle." },
      { from: ROUTES.admin.luckyIds, to: "/admin/lucky-plan/lucky-ids", status: "migrate_then_alias", note: "Lucky ID register." },
      { from: ROUTES.admin.luckyDraws, to: "/admin/lucky-plan/draws", status: "migrate_then_alias", note: "Draw execution and audit evidence." },
    ],
  },
  {
    key: "collections_cashier",
    label: "Collections & Cashier",
    canonicalRoot: "/admin/collections",
    description: "Fast money collection, receipts, cashier day close, settlement imports, and collection controls.",
    effect: "money",
    safetyRule: "Collection may create controlled payment/receipt records but must not auto-post accounting bridge entries.",
    uiPattern: "pos_speed",
    primaryRoutes: [ROUTES.admin.collections, ROUTES.admin.collectionControlCenter, ROUTES.admin.financeCollect, ROUTES.admin.payments, ROUTES.admin.settlements, ROUTES.admin.settlementsDayCloses],
  },
  {
    key: "finance_operations",
    label: "Finance Operations",
    canonicalRoot: ROUTES.admin.finance,
    description: "Operational money posture: outstandings, customer advances, deposits, refunds, commissions, payouts, payables, reversals. Finance source workflow answers: who owes money, who gets money, what came in/out, what is pending.",
    effect: "money",
    safetyRule: "Finance source operations must remain distinct from accounting ledger posting, COA, journals, and period close. Finance pages must not present accounting bridge posting as automatically enabled unless backend readiness confirms it.",
    uiPattern: "control_center",
    primaryRoutes: [
      ROUTES.admin.finance,
      // Phase 4 canonical Finance Operations routes
      ROUTES.admin.financeOutstandings,
      ROUTES.admin.financeCustomerAdvances,
      ROUTES.admin.financeDeposits,
      ROUTES.admin.financeCommissions,
      ROUTES.admin.financePayoutBatches,
      ROUTES.admin.financeReversalControl,
      ROUTES.admin.financeReversalReconciliation,
      // Legacy route kept for backward-compat path matching
      ROUTES.admin.outstandings,
    ],
  },
  {
    key: "accounting_reconciliation",
    label: "Accounting & Reconciliation",
    canonicalRoot: ROUTES.admin.accounting,
    description: "COA, finance mappings, journals, bridge posting, reconciliation, periods, books, and statutory reports.",
    effect: "accounting",
    safetyRule: "Accounting pages must not create operational source records. Posting remains explicit, idempotent, balanced, and auditable.",
    uiPattern: "audit_first",
    primaryRoutes: [ROUTES.admin.accounting, ROUTES.admin.accountingSetup, ROUTES.admin.accountingChartOfAccounts, ROUTES.admin.accountingFinanceAccounts, ROUTES.admin.accountingJournals, ROUTES.admin.accountingBridgeReconciliation, ROUTES.admin.accountingPeriods, ROUTES.admin.accountingBooks, ROUTES.admin.accountingTrialBalance, ROUTES.admin.accountingProfitLoss, ROUTES.admin.accountingBalanceSheet],
  },
  {
    key: "inventory_stock",
    label: "Inventory & Stock",
    canonicalRoot: ROUTES.admin.inventory,
    description: "Stock truth: items, locations, stock on hand, movement ledger, adjustments, valuation, readiness, planning.",
    effect: "stock",
    safetyRule: "Stock changes must explain why stock changed and must not be hidden behind sales/accounting screens.",
    uiPattern: "object_pages",
    primaryRoutes: [ROUTES.admin.inventory, ROUTES.admin.inventoryItems, ROUTES.admin.inventoryProfiles, ROUTES.admin.inventoryStockOnHand, ROUTES.admin.inventoryLocations, ROUTES.admin.inventoryLedger, ROUTES.admin.inventoryMovements, ROUTES.admin.inventoryAdjustments, ROUTES.admin.inventoryOpeningStock, ROUTES.admin.inventoryValuation, ROUTES.admin.inventoryDemandPlanning, ROUTES.admin.inventoryPurchaseNeeds, ROUTES.admin.inventoryReadiness],
  },
  {
    key: "purchases_vendors",
    label: "Purchases & Vendors",
    canonicalRoot: ROUTES.admin.purchases,
    description: "Vendor procurement chain from requests and orders to receipts, bills, payables, payments, and returns.",
    effect: "money",
    safetyRule: "Vendor profile, purchase receipt, purchase bill, vendor payable, and vendor payment must remain traceable as separate steps.",
    uiPattern: "object_pages",
    primaryRoutes: [ROUTES.admin.purchases, ROUTES.admin.purchaseRequests, ROUTES.admin.purchaseOrders, ROUTES.admin.purchaseReceipts, ROUTES.admin.purchaseBills, ROUTES.admin.purchaseVendorPayables, ROUTES.admin.purchaseVendorPayments, ROUTES.admin.purchaseVendorReturns, ROUTES.admin.vendors, ROUTES.admin.vendorsProducts, ROUTES.admin.vendorsQuotes, ROUTES.admin.vendorsSourcing, ROUTES.admin.vendorsLedger, ROUTES.admin.vendorsOutstanding],
  },
  {
    key: "delivery_service",
    label: "Delivery & Service",
    canonicalRoot: ROUTES.admin.deliveries,
    description: "Delivery, handover documents, returns, complaints, service cases, and service tickets. Answers: which delivered item has a complaint, return, or service ticket? Which case needs staff action? Which return/service state is linked to a sale, subscription, or delivery?",
    effect: "stock",
    safetyRule: "Delivery may trigger stock movement only through approved fulfillment workflows; service requests do not create financial records directly. Support request intake must remain separated from service case execution.",
    uiPattern: "work_queue",
    primaryRoutes: [
      // Delivery routes
      ROUTES.admin.deliveries,
      ROUTES.admin.deliveryWorkspace,
      ROUTES.admin.deliveryReturns,
      // Service desk routes — Phase 6: all /admin/service-desk/* routes explicitly classified here
      ROUTES.admin.serviceDesk,
      ROUTES.admin.serviceDeskCases,
      ROUTES.admin.serviceDeskComplaints,
      ROUTES.admin.serviceDeskReturns,
      ROUTES.admin.serviceDeskTickets,
    ],
  },
  {
    key: "hr_staff",
    label: "HR & Staff",
    canonicalRoot: ROUTES.admin.hr,
    // Phase 7: HR & Staff answers: who works for the business? Is the staff profile complete?
    // Is onboarding complete? Is attendance configured? Is payroll setup complete?
    // Which salary sheet/payment workflow applies? Which documents/KYC are attached?
    // Does NOT answer: which journal/period/reconciliation evidence? Is the bridge posted?
    // Those questions belong to Accounting & Reconciliation.
    description: "Staff profile source, onboarding workflow, attendance source workflow, payroll setup, salary payment source, leave, expenses, and staff documents. Answers: who works for the business, is the staff profile complete, is onboarding complete, is attendance configured, is payroll setup complete, which salary sheet applies. Does not own payroll journal auto-posting, accounting bridge reconciliation, or reconciliation evidence — those are Accounting & Reconciliation.",
    effect: "payroll",
    safetyRule: "Staff creation, onboarding, and attendance must not create salary payments, payroll journals, money movements, receipts, accounting bridge postings, or reconciliation items automatically. Payroll accounting bridge status and reconciliation evidence belong to Accounting & Reconciliation. Staff deactivation must preserve payroll, attendance, documents, salary records, and audit history.",
    uiPattern: "object_pages",
    primaryRoutes: [ROUTES.admin.hr, ROUTES.admin.hrStaff, ROUTES.admin.hrAttendance, ROUTES.admin.hrPayroll, ROUTES.admin.hrSalaryPayments, ROUTES.admin.hrLeave, ROUTES.admin.hrExpenses, ROUTES.admin.hrStaffDocuments],
  },
  {
    key: "bi_reports",
    label: "BI & Reports",
    canonicalRoot: ROUTES.admin.bi,
    description: "Read-only operational and financial analytics with drill-down links to source records.",
    effect: "read_only",
    safetyRule: "BI must never mutate records, post accounting, repair mappings, or change workflow states.",
    uiPattern: "read_only_bi",
    primaryRoutes: [ROUTES.admin.bi, ROUTES.admin.biProfitability, ROUTES.admin.biCustomers, ROUTES.admin.biBatches, ROUTES.admin.biCashflow, ROUTES.admin.biInventory, ROUTES.admin.biHr, ROUTES.admin.reportsCenter, ROUTES.admin.reports],
  },
  {
    key: "settings_governance",
    label: "Settings & Governance",
    canonicalRoot: ROUTES.admin.settings,
    description: "Users, permissions, business setup, compliance, policies, imports, numbering, audit logs, and public business data.",
    effect: "settings",
    safetyRule: "Settings may configure workflows but must not execute daily financial operations unless explicitly controlled and audited.",
    uiPattern: "control_center",
    primaryRoutes: [ROUTES.admin.settings, ROUTES.admin.settingsUsers, ROUTES.admin.settingsRolesPermissions, ROUTES.admin.settingsBusinessSetup, ROUTES.admin.settingsBusinessCompliance, ROUTES.admin.settingsPolicies, ROUTES.admin.settingsImports, ROUTES.admin.auditLogs, ROUTES.admin.auditEvents, ROUTES.admin.brandData],
  },
];

export const ADMIN_MODULE_BY_KEY = Object.fromEntries(ADMIN_MODULE_TAXONOMY.map((module) => [module.key, module])) as Record<AdminCanonicalModule, AdminModuleDefinition>;

export function findAdminModuleForPath(pathname: string): AdminModuleDefinition | null {
  const normalized = pathname.split("?")[0].replace(/\/$/, "") || "/";
  return (
    ADMIN_MODULE_TAXONOMY.find((module) =>
      module.primaryRoutes.some((route) => normalized === route || normalized.startsWith(`${route.replace(/\/$/, "")}/`)) ||
      module.legacyRoutes?.some((route) => normalized === route.from || normalized.startsWith(`${route.from.replace(/\/$/, "")}/`))
    ) ?? null
  );
}
