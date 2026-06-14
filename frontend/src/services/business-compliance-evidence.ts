import { getAccessToken } from "@/lib/auth/tokens";
import { API_BASE_URL } from "@/lib/constants";

const BUSINESS_COMPLIANCE_DOCUMENTS_PATH = "/admin/settings/business-compliance/documents/";

function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const base = API_BASE_URL.replace(/\/+$/, "");
  if (base.endsWith("/api/v1") && normalizedPath.startsWith("/api/v1")) {
    return `${base}${normalizedPath.slice("/api/v1".length) || ""}`;
  }
  return `${base}${normalizedPath}`;
}

export async function fetchComplianceDocumentEvidence(documentId: number): Promise<Blob> {
  const token = getAccessToken();
  const response = await fetch(buildApiUrl(`${BUSINESS_COMPLIANCE_DOCUMENTS_PATH}${documentId}/evidence/`), {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Unable to open evidence file (${response.status}).`);
  }

  return response.blob();
}
