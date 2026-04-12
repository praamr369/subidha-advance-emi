import { apiFetch } from "@/lib/api";

type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

type QueryValue = string | number | undefined | null;

function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export type ManufacturingBomLine = {
  id?: number;
  inventory_item: number;
  inventory_item_sku?: string | null;
  inventory_item_product_name?: string | null;
  quantity_per_unit: string;
  wastage_percent?: string;
  sort_order?: number;
  notes?: string;
};

export type ManufacturingBom = {
  id: number;
  bom_no: string;
  finished_good_inventory_item: number;
  finished_good_sku?: string | null;
  finished_good_product_name?: string | null;
  revision_no: number;
  status: "DRAFT" | "ACTIVE" | "INACTIVE";
  is_default: boolean;
  effective_from?: string | null;
  effective_to?: string | null;
  notes?: string;
  activated_at?: string | null;
  activated_by_username?: string | null;
  lines: ManufacturingBomLine[];
};

export type ProductionMaterialIssueLine = {
  id: number;
  bom_line?: number | null;
  inventory_item: number;
  inventory_item_sku?: string | null;
  inventory_item_product_name?: string | null;
  entry_kind: "ISSUE" | "RETURN";
  description: string;
  planned_quantity: string;
  quantity: string;
  unit_cost_snapshot?: string | null;
  line_total_cost: string;
  notes?: string;
  is_posted: boolean;
  posted_at?: string | null;
  posted_by_username?: string | null;
  posted_journal_entry?: number | null;
};

export type ProductionReceiptLine = {
  id: number;
  inventory_item: number;
  inventory_item_sku?: string | null;
  inventory_item_product_name?: string | null;
  description: string;
  quantity: string;
  unit_cost_snapshot?: string | null;
  line_total_cost: string;
  notes?: string;
  is_posted: boolean;
  posted_at?: string | null;
  posted_by_username?: string | null;
  posted_journal_entry?: number | null;
};

export type ProductionScrapLine = {
  id: number;
  inventory_item?: number | null;
  inventory_item_sku?: string | null;
  inventory_item_product_name?: string | null;
  description: string;
  quantity: string;
  unit_cost_snapshot?: string | null;
  line_total_cost: string;
  reason: string;
  notes?: string;
  is_posted: boolean;
  posted_at?: string | null;
  posted_by_username?: string | null;
  posted_journal_entry?: number | null;
};

export type ProductionJob = {
  id: number;
  job_no: string;
  job_date: string;
  status: "DRAFT" | "RELEASED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  bom?: number | null;
  bom_no?: string | null;
  finished_good_inventory_item: number;
  finished_good_sku?: string | null;
  finished_good_product_name?: string | null;
  stock_location?: number | null;
  stock_location_code?: string | null;
  stock_location_name?: string | null;
  planned_output_qty: string;
  completed_output_qty: string;
  total_issued_cost: string;
  total_received_cost: string;
  total_scrap_cost: string;
  wip_cost: string;
  costing_status: "PENDING" | "READY" | "DEFERRED";
  accounting_status: "NOT_REQUIRED" | "PENDING" | "POSTED" | "DEFERRED";
  notes?: string;
  posting_notes?: string;
  created_by_username?: string | null;
  released_by_username?: string | null;
  released_at?: string | null;
  started_at?: string | null;
  completed_by_username?: string | null;
  completed_at?: string | null;
  cancelled_by_username?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string;
  material_issue_lines: ProductionMaterialIssueLine[];
  receipt_lines: ProductionReceiptLine[];
  scrap_lines: ProductionScrapLine[];
};

export type ManufacturingOverview = {
  summary: {
    bom_count: number;
    active_bom_count: number;
    job_count: number;
    released_count: number;
    in_progress_count: number;
    completed_count: number;
    deferred_count: number;
  };
  recent_jobs: Array<{
    id: number;
    job_no: string;
    status: string;
    finished_good_inventory_item_id: number;
    finished_good_sku?: string | null;
    finished_good_product_name?: string | null;
    planned_output_qty: string;
    completed_output_qty: string;
    wip_cost: string;
    accounting_status: string;
    costing_status: string;
  }>;
  recent_boms: Array<{
    id: number;
    bom_no: string;
    status: string;
    revision_no: number;
    is_default: boolean;
    finished_good_inventory_item_id: number;
    finished_good_sku?: string | null;
    finished_good_product_name?: string | null;
    line_count: number;
  }>;
};

export type ManufacturingBomPayload = {
  finished_good_inventory_item: number;
  revision_no: number;
  is_default?: boolean;
  effective_from?: string | null;
  effective_to?: string | null;
  notes?: string;
  lines: Array<{
    inventory_item: number;
    quantity_per_unit: string;
    wastage_percent?: string;
    sort_order?: number;
    notes?: string;
  }>;
};

export type ProductionJobPayload = {
  job_date?: string;
  bom?: number | null;
  finished_good_inventory_item: number;
  stock_location?: number | null;
  planned_output_qty: string;
  notes?: string;
  material_issue_lines?: Array<{
    bom_line?: number | null;
    inventory_item: number;
    entry_kind?: "ISSUE" | "RETURN";
    description?: string;
    planned_quantity?: string;
    quantity: string;
    unit_cost_snapshot?: string;
    line_total_cost?: string;
    notes?: string;
  }>;
};

export function getManufacturingOverview() {
  return apiFetch<ManufacturingOverview>("/manufacturing/overview/");
}

export function listManufacturingBoms(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<ManufacturingBom>>(`/manufacturing/boms/${buildQuery(params)}`);
}

export function createManufacturingBom(payload: ManufacturingBomPayload) {
  return apiFetch<ManufacturingBom>("/manufacturing/boms/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateManufacturingBom(id: number | string, payload: Partial<ManufacturingBomPayload>) {
  return apiFetch<ManufacturingBom>(`/manufacturing/boms/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function activateManufacturingBom(id: number | string) {
  return apiFetch<{ updated: boolean; bom: ManufacturingBom }>(`/manufacturing/boms/${id}/activate/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function deactivateManufacturingBom(id: number | string) {
  return apiFetch<{ updated: boolean; bom: ManufacturingBom }>(`/manufacturing/boms/${id}/deactivate/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function listProductionJobs(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<ProductionJob>>(`/manufacturing/jobs/${buildQuery(params)}`);
}

export function getProductionJob(id: number | string) {
  return apiFetch<ProductionJob>(`/manufacturing/jobs/${id}/`);
}

export function createProductionJob(payload: ProductionJobPayload) {
  return apiFetch<ProductionJob>("/manufacturing/jobs/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateProductionJob(id: number | string, payload: Partial<ProductionJobPayload>) {
  return apiFetch<ProductionJob>(`/manufacturing/jobs/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function releaseProductionJob(id: number | string) {
  return apiFetch<{ updated: boolean; job: ProductionJob }>(`/manufacturing/jobs/${id}/release/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function postProductionMaterials(
  id: number | string,
  payload: {
    movement_date?: string;
    lines?: Array<{
      bom_line?: number | null;
      inventory_item: number;
      entry_kind?: "ISSUE" | "RETURN";
      description?: string;
      planned_quantity?: string;
      quantity: string;
      unit_cost_snapshot?: string;
      line_total_cost?: string;
      notes?: string;
    }>;
  }
) {
  return apiFetch<{ updated: boolean; job: ProductionJob }>(`/manufacturing/jobs/${id}/post-materials/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function postProductionOutput(
  id: number | string,
  payload: {
    output_date?: string;
    receipt_lines?: Array<{
      inventory_item?: number | null;
      description?: string;
      quantity: string;
      unit_cost_snapshot?: string;
      line_total_cost?: string;
      notes?: string;
    }>;
    scrap_lines?: Array<{
      inventory_item?: number | null;
      description?: string;
      quantity: string;
      unit_cost_snapshot?: string;
      line_total_cost?: string;
      reason?: string;
      notes?: string;
    }>;
  }
) {
  return apiFetch<{ updated: boolean; job: ProductionJob }>(`/manufacturing/jobs/${id}/post-output/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function completeProductionJob(id: number | string) {
  return apiFetch<{ updated: boolean; job: ProductionJob }>(`/manufacturing/jobs/${id}/complete/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function cancelProductionJob(id: number | string, reason: string) {
  return apiFetch<{ updated: boolean; job: ProductionJob }>(`/manufacturing/jobs/${id}/cancel/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
