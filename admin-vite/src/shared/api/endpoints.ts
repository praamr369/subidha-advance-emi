export const endpoints = {
  auth: {
    login: "/auth/login/",
    refresh: "/auth/refresh/",
    logout: "/auth/logout/",
    me: "/auth/me/",
  },
  customers: {
    list: "/customers/",
    detail: (id: number) => `/customers/${id}/`,
  },
  products: {
    list: "/products/",
    detail: (id: number) => `/products/${id}/`,
  },
  subscriptions: {
    list: "/subscriptions/",
    detail: (id: number) => `/subscriptions/${id}/`,
  },
  payments: {
    list: "/payments/",
    detail: (id: number) => `/payments/${id}/`,
  },
  billing: {
    invoices: "/billing/invoices/",
    invoiceDetail: (id: number) => `/billing/invoices/${id}/`,
  },
  inventory: {
    list: "/inventory/",
    detail: (id: number) => `/inventory/${id}/`,
  },
  reports: {
    summary: "/reports/summary/",
  },
} as const;
