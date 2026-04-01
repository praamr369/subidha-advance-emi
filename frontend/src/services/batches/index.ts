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
