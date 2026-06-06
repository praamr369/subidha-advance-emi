import { request } from "@/services/api";

export type AccountingPeriodActionResponse = {
  created?: boolean;
  detail?: string;
  financial_year?: Record<string, unknown> | null;
  period?: Record<string, unknown> | null;
  readiness?: {
    is_ready?: boolean;
    errors?: string[];
    warnings?: string[];
    blocker_items?: Array<Record<string, unknown>>;
    recommended_actions?: Array<Record<string, unknown>>;
  };
};

export async function generateCurrentAccountingPeriod(): Promise<AccountingPeriodActionResponse> {
  return request<AccountingPeriodActionResponse>("/accounting/periods/generate-current/", {
    method: "POST",
    body: JSON.stringify({}),
    retryCount: 0,
  });
}
