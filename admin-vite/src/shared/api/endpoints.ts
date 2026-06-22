// Confirmed paths (verified against backend/api/v1/routes/)
export const endpoints = {
  auth: {
    login: "/auth/login/",
    refresh: "/auth/refresh/",
    logout: "/auth/logout/",
    me: "/auth/me/",
  },

  // Placeholder paths — confirm against actual backend admin routes before use.
  // Many admin operations live under /admin/ prefix, not top-level.
  customers: {
    list: "/admin/customers/",
    detail: (id: number) => `/admin/customers/${id}/`,
    kycDecision: (id: number) => `/admin/customers/${id}/kyc-decision/`,
  },
  products: {
    list: "/admin/products/",
    detail: (id: number) => `/admin/products/${id}/`,
  },
  subscriptions: {
    list: "/admin/subscriptions/",
    detail: (id: number) => `/admin/subscriptions/${id}/`,
  },
  payments: {
    list: "/admin/payments/",
    collect: "/admin/payments/collect/",
    detail: (id: number) => `/admin/payments/${id}/`,
  },
  billing: {
    invoices: "/billing/invoices/",
    invoiceDetail: (id: number) => `/billing/invoices/${id}/`,
  },
  inventory: {
    list: "/inventory/",
    detail: (id: number) => `/inventory/${id}/`,
  },
  accounting: {
    bridgeReconciliation: "/admin/accounting/bridge-reconciliation/",
    mappingAudit: "/admin/accounting/mapping-audit/",
    yearEndReadiness: "/admin/accounting/year-end/readiness/",
  },
  dashboards: {
    root: "/dashboards/",
  },
  reports: {
    summary: "/dashboards/",
  },
} as const;
