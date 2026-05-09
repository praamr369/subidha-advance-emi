import { apiFetch } from "@/lib/api";

export type DryRunCheckOption = {
  key: string;
  label: string;
  description: string;
  risk_level: string;
  supports_scopes: boolean;
  requires_upload: boolean;
};

export type DryRunResultRow = {
  check: string;
  status: string;
  risk_level: string;
  module: string;
  title: string;
  detail: string;
  recommended_action: string;
  action_href: string;
  safe_to_execute: boolean;
};

export type DryRunRunResponse = {
  run_id: string;
  job_id?: number;
  status: string;
  summary: {
    pass: number;
    warning: number;
    blocked: number;
    failed: number;
  };
  results: DryRunResultRow[];
  generated_at: string;
};

export type DryRunHistoryRun = {
  run_id: string;
  job_id: number;
  status: string;
  summary: Record<string, number>;
  checks: string[];
  created_at: string;
  created_by_username: string | null;
};

export async function getDryRunOptions(): Promise<{ checks: DryRunCheckOption[] }> {
  return apiFetch<{ checks: DryRunCheckOption[] }>("/admin/business-setup/dry-runs/options/");
}

export async function postDryRunRun(payload: {
  checks: string[];
  scopes?: string[];
  options?: Record<string, unknown>;
}): Promise<DryRunRunResponse> {
  return apiFetch<DryRunRunResponse>("/admin/business-setup/dry-runs/run/", {
    method: "POST",
    body: {
      checks: payload.checks,
      scopes: payload.scopes ?? [],
      options: payload.options ?? {},
    },
  });
}

export async function getDryRunHistory(limit = 20): Promise<{ runs: DryRunHistoryRun[] }> {
  return apiFetch<{ runs: DryRunHistoryRun[] }>(`/admin/business-setup/dry-runs/history/?limit=${limit}`);
}
