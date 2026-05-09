import { apiFetch } from "@/lib/api";

export type BrandSource = {
  id: number;
  provider: string;
  name: string;
  is_configured: boolean;
  status_label: string;
  configuration_hint: string;
};

export type BrandImportItem = {
  id: number;
  field_key: string;
  item_type: string;
  approval_status: string;
  value: Record<string, unknown>;
};

export function listBrandSources(): Promise<{ count: number; results: BrandSource[] }> {
  return apiFetch("/admin/brand-data/sources/");
}

export function previewManualBrandImport(payload: Record<string, unknown>): Promise<{ batch_id: number; item_count: number; items: BrandImportItem[] }> {
  return apiFetch("/admin/brand-data/import/manual/preview/", { method: "POST", body: JSON.stringify(payload) });
}

export function previewGoogleBusinessImport(): Promise<Record<string, unknown>> {
  return apiFetch("/admin/brand-data/import/google-business/preview/", { method: "POST", body: JSON.stringify({}) });
}

export function previewYoutubeImport(): Promise<Record<string, unknown>> {
  return apiFetch("/admin/brand-data/import/youtube/preview/", { method: "POST", body: JSON.stringify({}) });
}

export function reviewImportedItem(item_id: number, action: "approve" | "reject", note = ""): Promise<Record<string, unknown>> {
  return apiFetch("/admin/brand-data/import/social-link/", { method: "POST", body: JSON.stringify({ item_id, action, note }) });
}

export function applyApprovedBrandItems(approved_item_ids: number[]): Promise<Record<string, unknown>> {
  return apiFetch("/admin/brand-data/apply/", { method: "POST", body: JSON.stringify({ approved_item_ids }) });
}

export function getBrandDataAudit(): Promise<{ count: number; results: Array<Record<string, unknown>> }> {
  return apiFetch("/admin/brand-data/audit/");
}
