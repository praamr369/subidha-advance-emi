import { apiFetch } from "@/lib/api";
import { API_BASE_URL } from "@/lib/constants";

export type DocumentCategory =
  | "invoice"
  | "purchase_invoice"
  | "receipt"
  | "contract"
  | "kyc"
  | "po"
  | "journal"
  | "legal"
  | "other";

export interface DocumentRecord {
  id: number;
  category: DocumentCategory;
  category_label: string;
  title: string;
  description: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  file_url: string | null;
  retention_date: string | null;
  tags: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface DocumentListResponse {
  results: DocumentRecord[];
  categories: { value: string; label: string }[];
}

export async function listDocuments(params?: {
  category?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}): Promise<DocumentListResponse> {
  const q = new URLSearchParams();
  if (params?.category) q.set("category", params.category);
  if (params?.date_from) q.set("date_from", params.date_from);
  if (params?.date_to) q.set("date_to", params.date_to);
  if (params?.search) q.set("search", params.search);
  const qs = q.toString();
  try {
    const raw = await apiFetch<DocumentListResponse | DocumentRecord[]>(
      `/admin/documents/${qs ? `?${qs}` : ""}`
    );
    if (Array.isArray(raw)) {
      return { results: raw, categories: [] };
    }
    if (raw && typeof raw === "object" && Array.isArray(raw.results)) {
      return {
        results: raw.results,
        categories: Array.isArray(raw.categories) ? raw.categories : [],
      };
    }
    return { results: [], categories: [] };
  } catch {
    return { results: [], categories: [] };
  }
}

export async function uploadDocument(formData: FormData): Promise<DocumentRecord> {
  return apiFetch("/admin/documents/", {
    method: "POST",
    body: formData,
  });
}

export async function deleteDocument(id: number): Promise<void> {
  await apiFetch(`/admin/documents/${id}/`, { method: "DELETE" });
}

export function getBackendBaseUrl(): string {
  return API_BASE_URL.replace(/\/+$/, "");
}

export function getBackendMediaRoot(): string {
  return API_BASE_URL.replace(/\/api\/v1\/?$/, "");
}

export function resolveDocumentFileUrl(fileUrl?: string | null): string {
  if (!fileUrl) return "";
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    return fileUrl;
  }
  const root = getBackendMediaRoot();
  return `${root}${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;
}

export function documentDownloadUrl(id: number): string {
  const base = getBackendBaseUrl();
  return `${base}/admin/documents/${id}/download/`;
}

export function documentZipExportUrl(params?: {
  category?: string;
  date_from?: string;
  date_to?: string;
}): string {
  const q = new URLSearchParams();
  if (params?.category) q.set("category", params.category);
  if (params?.date_from) q.set("date_from", params.date_from);
  if (params?.date_to) q.set("date_to", params.date_to);
  const qs = q.toString();
  const base = getBackendBaseUrl();
  return `${base}/admin/documents/export/zip/${qs ? `?${qs}` : ""}`;
}

export async function generatePdf(
  type: "invoice" | "receipt" | "contract" | "kyc",
  data: Record<string, unknown>,
  save = false
): Promise<DocumentRecord | null> {
  const result = await apiFetch("/admin/documents/generate-pdf/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, data, save }),
  }) as { document?: DocumentRecord };
  return save ? (result.document ?? null) : null;
}

export function formatFileSize(bytes?: number | null): string {
  if (bytes == null || isNaN(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
