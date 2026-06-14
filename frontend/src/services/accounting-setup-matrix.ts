import { apiFetch } from "@/lib/api";
import type { AccountingSetupMatrixPayload } from "@/services/accounting-setup";

export function getBackendAccountingSetupMatrix() {
  return apiFetch<AccountingSetupMatrixPayload>("/accounting/setup/matrix/");
}
