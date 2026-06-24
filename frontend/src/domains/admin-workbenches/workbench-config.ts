import { ROUTES } from "@/lib/routes";

export type AdminWorkbenchTab = {
  id: string;
  label: string;
  description: string;
  href?: string;
};

export type AdminWorkbenchDefinition = {
  id:
    | "customer-360"
    | "revenue"
    | "inventory-fulfillment"
    | "finance-control"
    | "crm-partners"
    | "operations-people"
    | "reports-setup";
  eyebrow: string;
  title: string;
  description: string;
  defaultTab: string;
  tabs: readonly AdminWorkbenchTab[];
};

export const ADMIN_WORKBENCHES: Record<
  AdminWorkbenchDefinition["id"],
  AdminWorkbenchDefinition
> = {
  "customer-360": {
    id: "customer-360",
    eyebrow: "Admin workbench",
    title: "Customer 360",
    description: "Customer identity, KYC, contracts, collections, fulfillment, support, and relationship history.",
    defaultTab: "customers",
    tabs: [
      { id: "customers", label: "Customers", description: "Current customer register and profile workflows.", href: ROUTES.admin.profilesCustomers },
      { id: "kyc", label: "KYC", description: "Current admin KYC review queue.", href: ROUTES.admin.crmKyc },
      { id: "parties", label: "Party Master", description: "Current party-centric identity records.", href: ROUTES.admin.profilesParties },
      { id: "customer-advances", label: "Customer Advances", description: "Backend-authoritative customer advance liability records.", href: ROUTES.admin.financeCustomerAdvances },
      { id: "support", label: "Support", description: "Current customer support intake and case links.", href: ROUTES.admin.supportRequests },
      { id: "timeline", label: "Timeline", description: "Reserved for the confirmed customer operational-summary and timeline payloads." },
    ],
  },
  revenue: {
    id: "revenue",
    eyebrow: "Admin workbench",
    title: "Revenue Workbench",
    description: "Sales, Lucky Plan, contracts, collection evidence, billing documents, and settlement workflows.",
    defaultTab: "sales-desk",
    tabs: [
      { id: "sales-desk", label: "Sales Desk", description: "Current sales workspace.", href: ROUTES.admin.salesWorkspace },
      { id: "direct-sale", label: "Direct Sale", description: "Current direct-sale workspace.", href: ROUTES.admin.billingDirectSaleWorkspace },
      { id: "lucky-plan", label: "Lucky Plan", description: "Current Lucky Plan control surface.", href: ROUTES.admin.luckyPlanControl },
      { id: "subscriptions", label: "Subscriptions", description: "Current contract register.", href: ROUTES.admin.subscriptions },
      { id: "rent-lease", label: "Rent / Lease", description: "Current rent and lease cockpit.", href: ROUTES.admin.rentLease },
      { id: "emis", label: "EMIs", description: "Current EMI register.", href: ROUTES.admin.emis },
      { id: "payments", label: "Payments", description: "Current payment register.", href: ROUTES.admin.payments },
      { id: "receipts", label: "Receipts", description: "Current backend-generated receipt register.", href: ROUTES.admin.billingReceipts },
      { id: "billing", label: "Billing", description: "Current billing cockpit.", href: ROUTES.admin.billing },
      { id: "outstanding", label: "Outstanding", description: "Current collectible dues view.", href: ROUTES.admin.financeOutstandings },
      { id: "settlements", label: "Settlements", description: "Current settlement evidence workflows.", href: ROUTES.admin.settlements },
      { id: "counters", label: "Counters", description: "Current branch counter and cash desk setup.", href: ROUTES.admin.counters },
      { id: "customer-advances", label: "Customer Advances", description: "Current advance liability register.", href: ROUTES.admin.financeCustomerAdvances },
    ],
  },
  "inventory-fulfillment": {
    id: "inventory-fulfillment",
    eyebrow: "Admin workbench",
    title: "Inventory & Fulfillment",
    description: "Product catalog, stock evidence, procurement, manufacturing, delivery, return, and service workflows.",
    defaultTab: "products",
    tabs: [
      { id: "products", label: "Products", description: "Current product catalog.", href: ROUTES.admin.products },
      { id: "stock-on-hand", label: "Stock On Hand", description: "Current backend stock posture.", href: ROUTES.admin.inventoryStockOnHand },
      { id: "stock-ledger", label: "Stock Ledger", description: "Current stock movement ledger.", href: ROUTES.admin.inventoryLedger },
      { id: "stock-movements", label: "Stock Movements", description: "Current stock movement register.", href: ROUTES.admin.inventoryMovements },
      { id: "adjustments", label: "Adjustments", description: "Current controlled stock adjustment workflow.", href: ROUTES.admin.inventoryAdjustments },
      { id: "purchase-needs", label: "Purchase Needs", description: "Current purchase need planning.", href: ROUTES.admin.inventoryPurchaseNeeds },
      { id: "purchases", label: "Purchases", description: "Current purchase chain.", href: ROUTES.admin.purchases },
      { id: "vendors", label: "Vendors", description: "Current vendor operations.", href: ROUTES.admin.vendors },
      { id: "manufacturing", label: "Manufacturing", description: "Current manufacturing workspace.", href: ROUTES.admin.manufacturing },
      { id: "deliveries", label: "Deliveries", description: "Current delivery lifecycle register.", href: ROUTES.admin.deliveries },
      { id: "returns", label: "Returns", description: "Current delivery return workflow.", href: ROUTES.admin.deliveryReturns },
      { id: "service-desk", label: "Service Desk", description: "Current service and complaint cases.", href: ROUTES.admin.serviceDesk },
      { id: "brochures-quotations", label: "Brochures / Quotations", description: "Current non-financial brochure and quotation workflow.", href: ROUTES.admin.brochures },
    ],
  },
  "finance-control": {
    id: "finance-control",
    eyebrow: "Admin workbench",
    title: "Finance Control",
    description: "Financial source controls, reconciliation, accounting visibility, audit evidence, and compliance.",
    defaultTab: "finance-dashboard",
    tabs: [
      { id: "finance-dashboard", label: "Finance Dashboard", description: "Current finance source workspace.", href: ROUTES.admin.finance },
      { id: "collections-review", label: "Collections Review", description: "Current collections control surface.", href: ROUTES.admin.collections },
      { id: "outstandings", label: "Outstandings", description: "Current collectible dues view.", href: ROUTES.admin.financeOutstandings },
      { id: "customer-credits", label: "Customer Credits", description: "Current customer credit source records.", href: ROUTES.admin.financeCustomerCredits },
      { id: "customer-advances", label: "Customer Advances", description: "Current liability source records.", href: ROUTES.admin.financeCustomerAdvances },
      { id: "deposits", label: "Deposits", description: "Current security-deposit source workflow.", href: ROUTES.admin.financeDeposits },
      { id: "commissions", label: "Commissions", description: "Current commission source register.", href: ROUTES.admin.financeCommissions },
      { id: "payout-batches", label: "Payout Batches", description: "Current partner payout batches.", href: ROUTES.admin.financePayoutBatches },
      { id: "reversal-control", label: "Reversal Control", description: "Current audited reversal workflow.", href: ROUTES.admin.financeReversalControl },
      { id: "reconciliation", label: "Reconciliation", description: "Current reconciliation queue.", href: ROUTES.admin.financeCanonicalReconciliation },
      { id: "accounting", label: "Accounting", description: "Current accounting control center.", href: ROUTES.admin.accountingControlCenter },
      { id: "journals", label: "Journals", description: "Current journal register.", href: ROUTES.admin.accountingJournals },
      { id: "audit-logs", label: "Audit Logs", description: "Current system audit trail.", href: ROUTES.admin.auditLogs },
    ],
  },
  "crm-partners": {
    id: "crm-partners",
    eyebrow: "Admin workbench",
    title: "CRM & Partners",
    description: "Lead intake, follow-ups, KYC queues, partner relationships, offers, and retention.",
    defaultTab: "lead-pipeline",
    tabs: [
      { id: "lead-pipeline", label: "Lead Pipeline", description: "Current CRM pipeline.", href: ROUTES.admin.crmPipeline },
      { id: "online-enquiries", label: "Online Enquiries", description: "Current public enquiry queue.", href: ROUTES.admin.onlineEnquiries },
      { id: "follow-ups", label: "Follow-ups", description: "Current CRM follow-up queue.", href: ROUTES.admin.crmFollowUps },
      { id: "kyc-queue", label: "KYC Queue", description: "Current KYC review queue.", href: ROUTES.admin.crmKyc },
      { id: "partners", label: "Partners", description: "Current partner register.", href: ROUTES.admin.partners },
      { id: "partner-payment-requests", label: "Partner Payment Requests", description: "Current request intake queue.", href: ROUTES.admin.partnerPaymentRequests },
      { id: "partner-performance", label: "Partner Performance", description: "Current read-only partner performance view.", href: ROUTES.admin.growthPartnerPerformance },
      { id: "offer-packages", label: "Offer Packages", description: "Current offer package setup.", href: ROUTES.admin.growthOfferPackages },
      { id: "plan-templates", label: "Plan Templates", description: "Current plan templates.", href: ROUTES.admin.growthPlanTemplates },
      { id: "retention", label: "Retention", description: "Current retention view.", href: ROUTES.admin.growthRetention },
    ],
  },
  "operations-people": {
    id: "operations-people",
    eyebrow: "Admin workbench",
    title: "Operations & People",
    description: "Daily operations, branches, staff, attendance, payroll, requests, amendments, and notifications.",
    defaultTab: "today-work",
    tabs: [
      { id: "today-work", label: "Today Work", description: "Current daily work queue.", href: ROUTES.admin.todayWork },
      { id: "branches", label: "Branches", description: "Current branch register.", href: ROUTES.admin.profilesBranches },
      { id: "staff", label: "Staff", description: "Current staff register.", href: ROUTES.admin.hrStaff },
      { id: "attendance", label: "Attendance", description: "Current attendance workflow.", href: ROUTES.admin.hrAttendance },
      { id: "leave", label: "Leave", description: "Current leave workflow.", href: ROUTES.admin.hrLeave },
      { id: "payroll", label: "Payroll", description: "Current payroll setup.", href: ROUTES.admin.hrPayroll },
      { id: "salary-payments", label: "Salary Payments", description: "Current salary payment source register.", href: ROUTES.admin.hrSalaryPayments },
      { id: "staff-documents", label: "Staff Documents", description: "Current staff document register.", href: ROUTES.admin.hrStaffDocuments },
      { id: "requests", label: "Requests", description: "Current request intake hub.", href: ROUTES.admin.requestsHub },
      { id: "contract-amendments", label: "Contract Amendments", description: "Current audited amendment workflow.", href: ROUTES.admin.contractAmendments },
      { id: "notifications", label: "Notifications", description: "Current admin notifications.", href: ROUTES.admin.notifications },
      { id: "brand-data", label: "Brand Data", description: "Current business identity data center.", href: ROUTES.admin.brandData },
    ],
  },
  "reports-setup": {
    id: "reports-setup",
    eyebrow: "Admin workbench",
    title: "Reports & Setup",
    description: "Read-only reports, access administration, business setup, readiness, imports, and audit.",
    defaultTab: "reports-center",
    tabs: [
      { id: "reports-center", label: "Reports Center", description: "Current report catalog.", href: ROUTES.admin.reportsCenter },
      { id: "reports", label: "Reports", description: "Current read-only report workspace.", href: ROUTES.admin.reports },
      { id: "users", label: "Users", description: "Current internal user administration.", href: ROUTES.admin.settingsUsers },
      { id: "roles-permissions", label: "Roles & Permissions", description: "Current role and permission setup.", href: ROUTES.admin.settingsRolesPermissions },
      { id: "business-setup", label: "Business Setup", description: "Current business setup workflow.", href: ROUTES.admin.settingsBusinessSetup },
      { id: "finance-setup", label: "Finance Setup", description: "Current finance configuration.", href: ROUTES.admin.settingsFinance },
      { id: "document-numbering", label: "Document Numbering", description: "Current document numbering setup.", href: ROUTES.admin.settingsBusinessSetupDocumentNumbering },
      { id: "imports-backups", label: "Imports / Backups", description: "Current guarded import and backup surface.", href: ROUTES.admin.settingsImports },
      { id: "setup-readiness", label: "Setup Readiness", description: "Current setup readiness checks.", href: ROUTES.admin.setupReadiness },
      { id: "audit-logs", label: "Audit Logs", description: "Current read-only audit log.", href: ROUTES.admin.auditLogs },
    ],
  },
};
