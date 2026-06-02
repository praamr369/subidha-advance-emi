import { apiFetch } from "@/lib/api";
import { ensureAdminRentLeasePremadeAccountingSetup } from "@/services/phase4-finance";

export async function prepareRentLeaseAccountingMapping() {
  await apiFetch<Record<string, unknown>>("/admin/accounting/setup/bootstrap/", {
    method: "POST",
    body: JSON.stringify({ dry_run: false }),
  });
  return ensureAdminRentLeasePremadeAccountingSetup();
}
