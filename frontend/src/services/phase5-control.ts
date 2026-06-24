import { request } from "@/services/api";

type Query = Record<string, string | number | boolean | undefined | null>;

function toQuery(query?: Query): string {
  if (!query) return "";
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    params.set(k, String(v));
  });
  const q = params.toString();
  return q ? `?${q}` : "";
}

export async function getAdminAccountingControlCenter(query?: Query) {
  return request(`/admin/accounting/control-center/${toQuery(query)}`);
}
export async function getAdminOperationsCommandCenter(query?: Query) {
  return request(`/admin/operations/command-center/${toQuery(query)}`);
}
export async function getAdminOperationsQueueSummary() {
  return request(`/admin/operations/queue-summary/`);
}
export async function getAdminOperationsRequestQueues() {
  return request(`/admin/operations/request-queues/`);
}
export async function getAdminPartnerOperationsSummary() {
  return request(`/admin/partner-operations/summary/`);
}
export async function getAdminPartnerPaymentRequests() {
  return request(`/admin/partner-payment-requests/`);
}
export async function approveAdminCollectionRequest(id: number, note?: string) {
  return request(`/admin/collection-requests/${id}/approve/`, {
    method: "POST",
    body: JSON.stringify({ note: note ?? "" }),
    headers: { "Content-Type": "application/json" },
  });
}
export async function rejectAdminCollectionRequest(id: number, note?: string) {
  return request(`/admin/collection-requests/${id}/reject/`, {
    method: "POST",
    body: JSON.stringify({ note: note ?? "" }),
    headers: { "Content-Type": "application/json" },
  });
}
export async function getAdminReportExecutiveSummary(query?: Query) {
  return request(`/admin/reports/executive-summary/${toQuery(query)}`);
}
export async function getAdminReportFinancePerformance(query?: Query) {
  return request(`/admin/reports/finance-performance/${toQuery(query)}`);
}
export async function getAdminReportContractPerformance(query?: Query) {
  return request(`/admin/reports/contract-performance/${toQuery(query)}`);
}
export async function getAdminReportAdvanceEmiPerformance(query?: Query) {
  return request(`/admin/reports/advance-emi-performance/${toQuery(query)}`);
}
export async function getAdminReportRentLeasePerformance(query?: Query) {
  return request(`/admin/reports/rent-lease-performance/${toQuery(query)}`);
}
export async function getAdminReportDirectSalesPerformance(query?: Query) {
  return request(`/admin/reports/direct-sale-performance/${toQuery(query)}`);
}
export async function getAdminReportInventoryPerformance(query?: Query) {
  return request(`/admin/reports/inventory-performance/${toQuery(query)}`);
}
export async function getAdminReportDeliveryPerformance(query?: Query) {
  return request(`/admin/reports/delivery-performance/${toQuery(query)}`);
}
export async function getAdminReportCrmPerformance(query?: Query) {
  return request(`/admin/reports/customer-crm-performance/${toQuery(query)}`);
}
export async function getAdminReportPartnerPerformance(query?: Query) {
  return request(`/admin/reports/partner-performance/${toQuery(query)}`);
}
export async function getAdminReportReconciliationAnalysis(query?: Query) {
  return request(`/admin/reports/reconciliation-analysis/${toQuery(query)}`);
}
export async function getAdminReportWaiverLossAnalysis(query?: Query) {
  return request(`/admin/reports/waiver-loss-analysis/${toQuery(query)}`);
}
export async function getAdminReportSourceMap() {
  return request(`/admin/reports/source-map/`);
}
export async function markAdminReconciliationReconciled(id: number, reason: string) {
  return request(`/admin/accounting/reconciliation/${id}/mark-reconciled/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
export async function markAdminReconciliationUnreconciled(id: number, reason: string) {
  return request(`/admin/accounting/reconciliation/${id}/mark-unreconciled/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
export async function attachAdminReconciliationReference(id: number, reference: string, reason: string) {
  return request(`/admin/accounting/reconciliation/${id}/attach-reference/`, {
    method: "POST",
    body: JSON.stringify({ reference, reason }),
  });
}
