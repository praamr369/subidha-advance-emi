/**
 * Every `/api/v1` path the app calls, in one place.
 *
 * Pages had these URLs inlined, so renaming an endpoint meant a search across
 * three dozen files and hoping none were missed. Nothing was broken by that —
 * the URL check guarantees every path resolves — but a rename was riskier than
 * it needed to be.
 *
 * This mirrors what `lib/routes.ts` already does for page routes, so the two
 * kinds of address are managed the same way.
 *
 * Prefer a service module (`services/*.ts`) when one already covers the
 * domain. Reach for these constants when a page calls `apiFetch` directly and
 * a whole service layer would be ceremony for one call.
 *
 * `apiFetch` strips a duplicate `/api/v1` prefix, so these are written in full
 * — the form a person can paste into curl and compare against the URLconf.
 */

export const apiPaths = {
  auth: {
    register: "/api/v1/auth/register/",
  },

  publicSite: {
    leads: "/api/v1/public/leads/",
    verifySeed: "/api/v1/public/lucky-plan/verify-seed/",
  },

  business: {
    msme: "/api/v1/business/msme/",
  },

  // ── Customer portal ──────────────────────────────────────────────────────
  customer: {
    kycDocuments: "/api/v1/customer/kyc-documents/",
    subscriptions: "/api/v1/customer/subscriptions/",
    receipt: (receiptId: string | number) => `/api/v1/customer/receipts/${receiptId}/`,
    receiptPdf: (receiptId: string | number) => `/api/v1/customer/receipts/${receiptId}/pdf/`,
    deposits: "/api/v1/subscriptions/deposits/",
    handoverReceipts: "/api/v1/deliveries/handover-receipts/",
  },

  // ── DPDP 2023 privacy ────────────────────────────────────────────────────
  privacy: {
    consents: "/api/v1/privacy/consents/",
    consentGrant: "/api/v1/privacy/consent/grant/",
    consentWithdraw: "/api/v1/privacy/consent/withdraw/",
    cookieConsent: "/api/v1/privacy/cookie-consent/",
    dashboardSummary: "/api/v1/privacy/dashboard-summary/",
    dataAccessRequest: "/api/v1/privacy/data-access-request/",
    dataExport: "/api/v1/privacy/data-export/",
    grievance: "/api/v1/privacy/grievance/",
    adminGrievances: "/api/v1/privacy/admin-grievances/",
    resolveGrievance: (id: string | number) => `/api/v1/privacy/grievance/${id}/resolve/`,
    breachNotifications: "/api/v1/admin/privacy/breach-notifications/",
    breachNotificationAction: (id: string | number, action: string) =>
      `/api/v1/admin/privacy/breach-notifications/${id}/${action}/`,
    retentionSchedule: "/api/v1/admin/privacy/retention-schedule/",
    retentionScheduleAction: (id: string | number, action: string) =>
      `/api/v1/admin/privacy/retention-schedule/${id}/${action}/`,
  },

  // ── Warranty ─────────────────────────────────────────────────────────────
  warranty: {
    check: (productId: string | number) => `/api/v1/warranty/check/${productId}/`,
    claim: "/api/v1/warranty/claim/",
    claimStatus: (id: string | number) => `/api/v1/warranty/claim-status/${id}/`,
    scheduleClaim: (id: string | number) => `/api/v1/warranty/claim/${id}/schedule/`,
    serviceHistory: "/api/v1/warranty/service-history/",
    serviceSchedule: "/api/v1/warranty/service-schedule/",
    completeServiceCall: (id: string | number) =>
      `/api/v1/warranty/service-call/${id}/complete/`,
    extendedPlans: (productId: string | number) =>
      `/api/v1/warranty/extended-plans/${productId}/`,
    enrolExtended: "/api/v1/warranty/enroll-extended/",
    adminClaims: "/api/v1/admin/warranty-claims/",
    approveClaim: (id: string | number) => `/api/v1/admin/warranty-claims/${id}/approve/`,
  },

  // ── Refunds & damage assessment ──────────────────────────────────────────
  refunds: {
    adminList: "/api/v1/refunds/admin-list/",
    inspectionJobs: "/api/v1/refunds/inspection-jobs/",
    inspect: (id: string | number) => `/api/v1/refunds/inspect/${id}/`,
    assessDamage: (id: string | number) => `/api/v1/refunds/assess-damage/${id}/`,
    advance: (id: string | number) => `/api/v1/refunds/${id}/advance/`,
  },

  // ── Partner portal ───────────────────────────────────────────────────────
  partner: {
    root: "/api/v1/partner",
    profileInfo: "/api/v1/partner/profile-info/",
    supportTickets: "/api/v1/partner/support/tickets/",
    customerKycRequests: "/api/v1/partner/customer-kyc-requests/",
    customerSearch: "/api/v1/partner/customer-search/",
  },

  // ── Admin ────────────────────────────────────────────────────────────────
  admin: {
    solopreneurDashboard: "/api/v1/admin/solopreneur-dashboard/",
    inventoryValuation: "/api/v1/admin/inventory/valuation/",
    openingBalanceCustomers: "/api/v1/admin/opening-balances/customers/",
    openingBalanceCustomer: (id: string | number) =>
      `/api/v1/admin/opening-balances/customers/${id}/`,
    openingBalanceCustomersSync: "/api/v1/admin/opening-balances/customers/sync/",
    collectionsDueToday: "/api/v1/admin/collections/due-today/",
    collectionsOverdue: "/api/v1/admin/collections/overdue/",
    collectionsRecent: "/api/v1/admin/collections/recent/",
  },

  pim: {
    root: "/api/v1/pim",
    exportCategories: "/api/v1/pim/categories/export_categories/",
    importCategories: "/api/v1/pim/categories/import_categories/",
  },
} as const;
