import { apiFetch, toArray } from "@/lib/api";
import { request } from "@/services/api";
import { toResultsArray } from "@/services/api/list";

export type BatchRecord = {
  id: number;
  batch_code?: string;
  status?: string;
  duration_months?: number;
};

export async function listBatches(params?: { productId?: string | number }): Promise<BatchRecord[]> {
  const query = params?.productId ? `?product_id=${encodeURIComponent(String(params.productId))}` : "";
  const payload = await request(`/admin/batches/${query}`);
  return toResultsArray<BatchRecord>(payload);
}

export async function listBatchesByProduct(productId: string | number): Promise<BatchRecord[]> {
  const payload = await request(`/admin/batches/by_product/?product_id=${encodeURIComponent(String(productId))}`);
  return toResultsArray<BatchRecord>(payload);
}

// --- Register / detail helpers ---
//
// These wrap the paginated batch-register endpoints used by the admin
// Batch Register and Batch Detail pages. `fetchAllPagedRows` walks the
// DRF `next` cursor so callers always get the full result set.

function toObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function extractRowsAndNext(payload: unknown): {
  rows: Record<string, unknown>[];
  nextPath: string | null;
} {
  const objectPayload = toObject(payload);

  if (objectPayload && Array.isArray(objectPayload.results)) {
    const nextRaw = objectPayload.next;
    return {
      rows: toArray<Record<string, unknown>>(objectPayload.results),
      nextPath: typeof nextRaw === "string" && nextRaw.trim() ? nextRaw : null,
    };
  }

  return {
    rows: toArray<Record<string, unknown>>(payload),
    nextPath: null,
  };
}

function normalizeApiPath(nextPath: string): string {
  const trimmed = nextPath.trim();

  if (!trimmed) return "";

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const parsed = new URL(trimmed);
    const combined = `${parsed.pathname}${parsed.search}`;
    if (combined.startsWith("/api/v1/")) {
      return combined.replace(/^\/api\/v1/, "");
    }
    return combined;
  }

  if (trimmed.startsWith("/api/v1/")) {
    return trimmed.replace(/^\/api\/v1/, "");
  }

  return trimmed;
}

export async function fetchAllPagedRows(
  path: string,
  options?: { cache?: RequestCache }
): Promise<Record<string, unknown>[]> {
  let nextPath: string | null = path;
  const collected: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (let guard = 0; nextPath && guard < 100; guard += 1) {
    const payload = await apiFetch<unknown>(nextPath, options);
    const { rows, nextPath: rawNext } = extractRowsAndNext(payload);

    for (const row of rows) {
      const key =
        typeof row.id !== "undefined" ? String(row.id) : JSON.stringify(row);

      if (!seen.has(key)) {
        seen.add(key);
        collected.push(row);
      }
    }

    const normalizedNext = rawNext ? normalizeApiPath(rawNext) : "";
    nextPath = normalizedNext || null;
  }

  return collected;
}

export async function listBatchRegisterRows(params: {
  q?: string;
  status?: string;
}): Promise<Record<string, unknown>[]> {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.status) query.set("status", params.status);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return fetchAllPagedRows(`/admin/batches/${suffix}`);
}

export async function getBatchDetail(id: string | number): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>(`/admin/batches/${id}/`, { cache: "no-store" });
}

export async function getBatchSummary(id: string | number): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>(`/admin/batches/${id}/summary/`, { cache: "no-store" });
}

export async function listLuckyIdsByBatch(batchId: string | number): Promise<Record<string, unknown>[]> {
  return fetchAllPagedRows(`/admin/lucky-ids/?batch_id=${batchId}`);
}

export async function listSubscriptionsByBatch(batchId: string | number): Promise<Record<string, unknown>[]> {
  return fetchAllPagedRows(`/admin/subscriptions/?batch_id=${batchId}`);
}
