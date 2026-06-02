import { apiFetch } from "@/lib/api";

type MappingPayload = {
  detail?: string;
  mapping_id?: number;
  mapping?: Record<string, unknown> | null;
  chart_accounts?: Array<Record<string, unknown>>;
  finance_accounts?: Array<Record<string, unknown>>;
  posting_boundary_note?: string;
  premade_setup_enabled?: boolean;
};

async function postMapping(input: Record<string, unknown>) {
  return apiFetch<MappingPayload>("/admin/finance/account-mapping/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function prepareRentLeaseAccountingMapping() {
  return postMapping({ action: "ENSURE_PREMADE" });
}
