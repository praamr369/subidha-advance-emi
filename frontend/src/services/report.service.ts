import { apiFetch } from "@/lib/api";

type ReportRow = { label: string; value: string };

type ReportResponse = { rows?: ReportRow[] };

export async function fetchReportRows(endpoint: string, fallbackRows: ReportRow[]): Promise<ReportRow[]> {
  try {
    const response = (await apiFetch(endpoint)) as ReportResponse;
    if (!response.rows || response.rows.length === 0) {
      return fallbackRows;
    }
    return response.rows;
  } catch {
    return fallbackRows;
  }
}

export type { ReportRow };
