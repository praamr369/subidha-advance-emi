export const ROUTES = {
  public: {
    home: "/",
    products: "/products",
    apply: "/apply",
    about: "/about",
    luckyPlan: "/lucky-plan",
    howItWorks: "/how-it-works",
    visionTrust: "/vision-trust",
    winners: "/winners",
    winnerHistory: "/winner-history",
    contact: "/contact",
    login: "/login",
    register: "/register",
    unauthorized: "/unauthorized",
  },

  admin: {
    root: "/admin",
    dashboard: "/admin",

    analytics: "/admin/analytics",
    auditLogs: "/admin/audit-logs",

    collections: "/admin/collections",
    leads: "/admin/leads",
    supportRequests: "/admin/support-requests",
    customers: "/admin/customers",
    deliveries: "/admin/deliveries",
    subscriptions: "/admin/subscriptions",
    payments: "/admin/payments",
    emis: "/admin/emis",
    batches: "/admin/batches",
    products: "/admin/products",
    partners: "/admin/partners",

    finance: "/admin/finance",
    financeReconciliation: "/admin/finance/reconciliation",
    paymentReconciliation: "/admin/payments/reconciliation",
    financeCommissions: "/admin/finance/commissions",
    financeSettledCommissions: "/admin/finance/commissions/settled",
    financePayoutBatches: "/admin/finance/payout-batches",

    luckyIds: "/admin/lucky-ids",
    luckyDraws: "/admin/lucky-draws",
    luckyDrawsCreate: "/admin/lucky-draws/create",

    reports: "/admin/reports",
    settings: "/admin/settings",
    settingsUsers: "/admin/settings/users",
    settingsUsersCreate: "/admin/settings/users/create",

    /**
     * Compatibility aliases.
     * Keep these temporarily so older imports do not break while the app is normalized.
     */
    luckyDraw: "/admin/lucky-draws",
    reconciliation: "/admin/reconciliation",

    /**
     * Legacy paths that still exist in the app today.
     * Keep legacy path constants explicit for compatibility pages while older
     * helper names continue to resolve to canonical routes.
     */
    legacyLuckyDraw: "/admin/lucky-draw",
    legacyLuckyDrawHistory: "/admin/lucky-draw/history",
    legacyFinanceReconciliation: "/admin/finance/reconciliation",
    legacyReconciliation: "/admin/reconciliation",
  },

  partner: {
    root: "/partner",
    dashboard: "/partner",
    collections: "/partner/collections",
    customers: "/partner/customers",
    subscriptions: "/partner/subscriptions",
    payments: "/partner/payments",
    commissions: "/partner/commissions",
    reports: "/partner/reports",
  },

  customer: {
    root: "/customer",
    dashboard: "/customer",
    subscriptions: "/customer/subscriptions",
    deliveries: "/customer/deliveries",
    profile: "/customer/profile",
    support: "/customer/support",
    /**
     * Compatibility alias. The live EMI truth stays under subscriptions and
     * subscription detail, so this route remains redirect-only for older links.
     */
    emis: "/customer/emis",
    payments: "/customer/payments",
  },

  cashier: {
    root: "/cashier",
    dashboard: "/cashier",
    collect: "/cashier/collect",
    payments: "/cashier/payments",
  },
} as const;
