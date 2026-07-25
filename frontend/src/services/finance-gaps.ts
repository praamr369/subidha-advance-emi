import { apiFetch } from "@/lib/api";

// Typed client for the admin finance-gaps endpoints
// (backend: api/v1/views/admin_finance_gaps.py). Field names mirror the
// backend serializers exactly — do not rename without changing the backend.

// ── Reconciliation sign-offs ─────────────────────────────────────────

export type ReconciliationSignOffStatus = "PENDING" | "SIGNED_OFF" | "REVOKED";

export type ReconciliationSignOff = {
  id: number;
  reconciliation_run_id: number;
  status: ReconciliationSignOffStatus;
  signed_off_by: string | null;
  signed_off_at: string | null;
  open_item_count_at_sign_off: number;
  attestation_note: string;
  revoked_by: string | null;
  revoked_at: string | null;
  revocation_reason: string;
  created_at: string;
};

type ListResponse<T> = { count: number; results: T[] };

export async function listReconciliationSignOffs(): Promise<ReconciliationSignOff[]> {
  const data = await apiFetch<ListResponse<ReconciliationSignOff>>(
    "/admin/finance/reconciliation-signoffs/",
  );
  return data.results ?? [];
}

export function signOffReconciliation(
  id: number,
  attestationNote?: string,
): Promise<ReconciliationSignOff> {
  return apiFetch<ReconciliationSignOff>(
    `/admin/finance/reconciliation-signoffs/${id}/sign-off/`,
    {
      method: "POST",
      body: JSON.stringify(attestationNote ? { attestation_note: attestationNote } : {}),
    },
  );
}

export function revokeReconciliationSignOff(
  id: number,
  revocationReason: string,
): Promise<ReconciliationSignOff> {
  // Backend requires the field name `revocation_reason` (not `reason`).
  return apiFetch<ReconciliationSignOff>(
    `/admin/finance/reconciliation-signoffs/${id}/revoke/`,
    {
      method: "POST",
      body: JSON.stringify({ revocation_reason: revocationReason }),
    },
  );
}

// ── Deposit forfeiture invoices ──────────────────────────────────────

export type ForfeitureInvoiceStatus = "DRAFT" | "ISSUED" | "CANCELLED";

export type ForfeitureInvoice = {
  id: number;
  invoice_number: string;
  invoice_date: string;
  status: ForfeitureInvoiceStatus;
  subscription_id: number;
  subscription_number: string | null;
  customer_name: string | null;
  forfeited_amount: string;
  gst_rate: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  total_tax_amount: string;
  total_invoice_amount: string;
  forfeiture_reason: string;
  issued_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string;
};

export async function listForfeitureInvoices(
  statusFilter?: ForfeitureInvoiceStatus,
): Promise<ForfeitureInvoice[]> {
  const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
  const data = await apiFetch<ListResponse<ForfeitureInvoice>>(
    `/admin/finance/forfeiture-invoices/${query}`,
  );
  return data.results ?? [];
}

export function issueForfeitureInvoice(id: number): Promise<ForfeitureInvoice> {
  return apiFetch<ForfeitureInvoice>(
    `/admin/finance/forfeiture-invoices/${id}/issue/`,
    { method: "POST" },
  );
}
