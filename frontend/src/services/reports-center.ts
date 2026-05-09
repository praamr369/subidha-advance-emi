import { apiFetch } from "@/lib/api";

export type ReportColumn = { key: string; header: string };
export type ReportSummaryItem = { label: string; value: string };

export type ReportCenterPayload = {
  report_key: string;
  title: string;
  section: string;
  summary: ReportSummaryItem[];
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  totals: Record<string, unknown>;
  filters_applied: Record<string, unknown>;
  ignored_filters: unknown[];
  branch_placeholder?: string;
};

export type ReportCenterCatalog = {
  sections: {
    id: string;
    label: string;
    reports: { key: string; title: string; description: string }[];
  }[];
};

export function reportCenterPath(reportKey: string): string {
  const k = encodeURIComponent(reportKey);
  return `/admin/reports-center/reports/${k}/`;
}

export function reportCenterExportPath(reportKey: string, format: "csv" | "pdf", query: Record<string, string>): string {
  const params = new URLSearchParams({ ...query, format });
  const k = encodeURIComponent(reportKey);
  return `/admin/reports-center/reports/${k}/export/?${params.toString()}`;
}

export async function fetchReportsCenterCatalog(): Promise<ReportCenterCatalog> {
  return apiFetch("/admin/reports-center/catalog/");
}

export async function fetchReportCenterReport(
  reportKey: string,
  query: Record<string, string | undefined>
): Promise<ReportCenterPayload> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") continue;
    search.set(key, value);
  }
  const q = search.toString();
  return apiFetch(`${reportCenterPath(reportKey)}${q ? `?${q}` : ""}`);
}
