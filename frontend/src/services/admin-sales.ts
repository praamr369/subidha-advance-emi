import { apiFetch } from "@/lib/api";

import type { DirectSalePayload } from "@/services/billing";

export type DirectSaleOrchestrationResponse = {
  sale: Record<string, unknown> & {
    id?: number;
    sale_no?: string | null;
    billing_invoice_no?: string | null;
    requirement_count?: number | null;
    delivery_display?: string | null;
  };
  stock_status: string;
  stock_lines?: unknown[];
  delivery_request: Record<string, unknown> | null;
  stock_need: Record<string, unknown> | null;
  stock_needs_open_count?: number;
  warnings: string[];
};

export function createAdminDirectSaleOrchestrated(
  payload: DirectSalePayload,
  options: { idempotencyKey?: string } = {}
) {
  return apiFetch<DirectSaleOrchestrationResponse>("/admin/sales/direct-sales/", {
    method: "POST",
    headers: options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined,
    body: JSON.stringify(payload),
  });
}
