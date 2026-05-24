import { ROUTES } from "@/lib/routes";

export type AdminReconciliationView = "subscriptions" | "payments";

type QueryParamPrimitive = string | number | boolean | null | undefined;

const ADMIN_RENT_LEASE_CONTRACTS_ROUTE = "/admin/rent-lease/contracts";
const ADMIN_VENDOR_PAYMENTS_ROUTE = "/admin/vendors/payments";
const ADMIN_RECONCILIATION_REPORTS_ROUTE = "/admin/reconciliation/reports";

type AdminReconciliationRouteParams = {
  view?: AdminReconciliationView;
  subscription?: number | string | null;
  payment?: number | string | null;
  status?: string | null;
  flagged?: boolean | string | null;
  locked?: boolean | string | null;
  q?: string | null;
};

type AdminCollectionsRouteParams = {
  subscription?: number | string | null;
  customer?: number | string | null;
  batch?: number | string | null;
  q?: string | null;
};

type AdminPaymentsRouteParams = {
  q?: string | null;
  method?: string | null;
  reversal_state?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  subscription?: number | string | null;
  customer?: number | string | null;
  batch?: number | string | null;
  partner?: number | string | null;
  emi?: number | string | null;
};

type AdminDeliveriesRouteParams = {
  q?: string | null;
  status?: string | null;
  customer?: number | string | null;
  subscription?: number | string | null;
  batch?: number | string | null;
  bucket?: string | null;
  date_from?: string | null;
  date_to?: string | null;
};

type AdminSupportRequestsRouteParams = {
  q?: string | null;
  status?: string | null;
  category?: string | null;
};

type AdminBillingRouteParams = {
  subscription?: number | string | null;
  customer?: number | string | null;
  direct_sale?: number | string | null;
  payment?: number | string | null;
  billing_invoice?: number | string | null;
  source_type?: string | null;
  status?: string | null;
};

type AdminSubscriptionRequestsRouteParams = {
  status?: string | null;
  requester_role?: string | null;
  q?: string | null;
  page?: number | string | null;
};

type AdminLeadsRouteParams = {
  q?: string | null;
  status?: string | null;
  assignee?: string | null;
  date_from?: string | null;
  date_to?: string | null;
};

function appendQueryValue(
  search: URLSearchParams,
  key: string,
  value: QueryParamPrimitive
) {
  if (value === null || value === undefined) return;
  if (typeof value === "string" && !value.trim()) return;
  search.set(key, String(value));
}

function buildRouteWithQuery(destination: string, params: Record<string, QueryParamPrimitive>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) appendQueryValue(search, key, value);
  const query = search.toString();
  return query ? `${destination}?${query}` : destination;
}

export function buildAdminReconciliationRoute(params: AdminReconciliationRouteParams = {}): string {
  return buildRouteWithQuery(ROUTES.admin.financeCanonicalReconciliation, {
    view: params.view === "payments" ? "payments" : null,
    subscription: params.subscription,
    payment: params.payment,
    status: params.status,
    flagged: params.flagged,
    locked: params.locked,
    q: params.q,
  });
}

export function buildAdminCollectionsRoute(params: AdminCollectionsRouteParams = {}): string {
  return buildRouteWithQuery(ROUTES.admin.collections, params);
}

export function buildAdminPaymentsRoute(params: AdminPaymentsRouteParams = {}): string {
  return buildRouteWithQuery(ROUTES.admin.payments, params);
}

export function buildAdminDeliveriesRoute(params: AdminDeliveriesRouteParams = {}): string {
  return buildRouteWithQuery(ROUTES.admin.deliveries, params);
}

export function buildAdminSupportRequestsRoute(params: AdminSupportRequestsRouteParams = {}): string {
  return buildRouteWithQuery(ROUTES.admin.supportRequests, params);
}

export function buildAdminSubscriptionRequestsRoute(params: AdminSubscriptionRequestsRouteParams = {}): string {
  return buildRouteWithQuery(ROUTES.admin.subscriptionRequests, params);
}

export function buildAdminLeadsRoute(params: AdminLeadsRouteParams = {}): string {
  return buildRouteWithQuery(ROUTES.admin.leads, params);
}

export function buildAdminBillingRegisterRoute(params: AdminBillingRouteParams = {}): string {
  return buildRouteWithQuery(ROUTES.admin.billingRegister, params);
}

export function buildAdminBillingInvoicesRoute(params: Omit<AdminBillingRouteParams, "payment" | "billing_invoice"> = {}): string {
  return buildRouteWithQuery(ROUTES.admin.billingInvoices, params);
}

export function buildAdminBillingReceiptsRoute(params: Pick<AdminBillingRouteParams, "payment" | "billing_invoice" | "direct_sale" | "subscription" | "customer" | "source_type"> = {}): string {
  return buildRouteWithQuery(ROUTES.admin.billingReceipts, params);
}

export function buildAdminSubscriptionRoute(id: number | string): string {
  return `${ROUTES.admin.subscriptions}/${id}`;
}

export function buildAdminSubscriptionContractPrintRoute(id: number | string): string {
  return `${ROUTES.admin.subscriptions}/${id}/contract/print`;
}

export function buildAdminRentLeaseContractPrintRoute(id: number | string): string {
  return `${ADMIN_RENT_LEASE_CONTRACTS_ROUTE}/${id}/contract/print`;
}

export function buildAdminPurchaseBillPrintRoute(id: number | string): string {
  return `${ROUTES.admin.purchases}/${id}/bill/print`;
}

export function buildAdminVendorPaymentVoucherPrintRoute(id: number | string): string {
  return `${ADMIN_VENDOR_PAYMENTS_ROUTE}/${id}/voucher/print`;
}

export function buildAdminCashierDayClosePrintRoute(id: number | string): string {
  return `${ROUTES.admin.settlementsDayCloses}/${id}/print`;
}

export function buildAdminReconciliationReportPrintRoute(id: number | string): string {
  return `${ADMIN_RECONCILIATION_REPORTS_ROUTE}/${id}/print`;
}

export function buildAdminPaymentRoute(id: number | string): string {
  return `${ROUTES.admin.payments}/${id}`;
}

export function buildAdminCustomerRoute(id: number | string): string {
  return `${ROUTES.admin.customers}/${id}`;
}

export function buildAdminBatchRoute(id: number | string): string {
  return `${ROUTES.admin.batches}/${id}`;
}

export function buildAdminLuckyIdRoute(id: number | string): string {
  return `${ROUTES.admin.luckyIds}/${id}`;
}

export function buildAdminDeliveryRoute(id: number | string): string {
  return `${ROUTES.admin.deliveries}/${id}`;
}

export function buildAdminDirectSaleDeliveryChallanPrintRoute(id: number | string): string {
  return `${ROUTES.admin.deliveries}/direct-sale-cases/${id}/print`;
}

export function buildAdminBillingDocumentRoute(id: number | string): string {
  return `${ROUTES.admin.billingDocuments}/${id}`;
}

export function buildAdminDirectSalePrintRoute(id: number | string): string {
  return `${ROUTES.admin.billingDirectSaleWorkspace}/${id}/print`;
}

export function buildAdminBillingReceiptPrintRoute(id: number | string): string {
  return `${ROUTES.admin.billingReceipts}/${id}/print`;
}

export function buildAdminCrmPartyRoute(id: number | string): string {
  return `${ROUTES.admin.crmParties}/${id}`;
}

export function buildAdminServiceDeskCaseRoute(id: number | string): string {
  return `${ROUTES.admin.serviceDeskCases}/${id}`;
}

export function buildAdminManufacturingJobRoute(id: number | string): string {
  return `${ROUTES.admin.manufacturingJobs}/${id}`;
}

export function buildAdminSalarySheetRoute(id: number | string): string {
  return `${ROUTES.admin.accountingSalary}/${id}`;
}
