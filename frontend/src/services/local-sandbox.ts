import { apiFetch } from "@/lib/api";
import type { SetupReadiness } from "@/types/local-sandbox";

export async function getSetupReadiness(): Promise<SetupReadiness> {
  return apiFetch("/admin/setup-readiness/");
}

export async function exportSetupSnapshot(): Promise<Record<string, unknown>> {
  return apiFetch("/admin/setup-snapshot/export/", { method: "POST", body: {} });
}

export async function importSetupSnapshot(payload: Record<string, unknown>, dry_run = true, confirm = false) {
  return apiFetch<Record<string, unknown>>("/admin/setup-snapshot/import/", {
    method: "POST",
    body: { payload, dry_run, confirm },
  });
}

export async function seedLocalSandbox(confirm = true) {
  return apiFetch<Record<string, unknown>>("/admin/local-sandbox/seed/", { method: "POST", body: { confirm } });
}

export async function resetLocalSandbox(payload: {
  scopes: string[];
  preserve_admin_username: string;
  preserve_setup: boolean;
  confirm_phrase: string;
  dry_run: boolean;
  sandbox_only: boolean;
}) {
  return apiFetch<Record<string, unknown>>("/admin/local-sandbox/reset/", { method: "POST", body: payload });
}
