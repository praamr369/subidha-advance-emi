import { apiFetch } from "@/lib/api";
import type { AccountingSetupMatrixPayload } from "@/services/accounting-setup";

export function getBackendAccountingSetupMatrix(opts?: { signal?: AbortSignal }) {
  return apiFetch<AccountingSetupMatrixPayload>("/accounting/setup/matrix/", { signal: opts?.signal });
}
