import { request } from "@/services/api";

export type InventoryReadinessStatus = "READY" | "WARNINGS" | "BLOCKED";
export type InventoryReadinessCheckStatus = "READY" | "WARNING" | "BLOCKED";
export type InventoryReadinessIssueSeverity = "BLOCKER" | "WARNING" | "INFO";

export type InventoryReadinessWarning = {
  code: string;
  message: string;
};

export type InventoryReadinessCheck = {
  key: string;
  label: string;
  status: InventoryReadinessCheckStatus;
  detail: string;
  count: number | null;
  action_label: string;
  action_href: string;
};

export type InventoryReadinessSection = {
  key: string;
  label: string;
  status: InventoryReadinessCheckStatus;
  blockers: number;
  warnings: number;
  checks: InventoryReadinessCheck[];
  movement_type_labels?: { value: string; label: string }[];
};

export type InventoryReadinessIssue = {
  severity: InventoryReadinessIssueSeverity;
  section: string;
  title: string;
  detail: string;
  object_type: string;
  object_id: string;
  action_label: string;
  action_href: string;
};

export type InventoryReadinessShortcut = {
  label: string;
  href: string;
  description: string;
};

export type InventoryReadinessSummary = {
  blockers: number;
  warnings: number;
  ready_checks: number;
  total_checks: number;
};

export type InventoryReadinessResponse = {
  module_not_configured: boolean;
  overall_status: InventoryReadinessStatus;
  summary: InventoryReadinessSummary;
  last_checked_at: string;
  sections: InventoryReadinessSection[];
  issues: InventoryReadinessIssue[];
  operator_shortcuts: InventoryReadinessShortcut[];
  inventory_ready: boolean;
  global_inventory_ready: boolean;
  product_count: number;
  active_product_count: number;
  stock_item_count: number;
  active_tracked_stock_items: number;
  stock_needs_open: number;
  open_operational_stock_needs: number;
  stock_movements_count: number;
  opening_stock_posted_count: number;
  opening_stock_draft_count: number;
  opening_stock_ready: boolean;
  warnings: InventoryReadinessWarning[];
  recommended_actions: string[];
};

const KNOWN_STATUS = new Set(["READY", "WARNING", "BLOCKED"]);
const KNOWN_OVERALL_STATUS = new Set(["READY", "WARNINGS", "BLOCKED"]);
const KNOWN_SEVERITY = new Set(["BLOCKER", "WARNING", "INFO"]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asStatus(value: unknown): InventoryReadinessCheckStatus {
  const status = asString(value).toUpperCase();
  return KNOWN_STATUS.has(status) ? (status as InventoryReadinessCheckStatus) : "WARNING";
}

function asOverallStatus(value: unknown, inventoryReady: boolean): InventoryReadinessStatus {
  const status = asString(value).toUpperCase();
  if (KNOWN_OVERALL_STATUS.has(status)) return status as InventoryReadinessStatus;
  return inventoryReady ? "READY" : "WARNINGS";
}

function asSeverity(value: unknown): InventoryReadinessIssueSeverity {
  const severity = asString(value).toUpperCase();
  return KNOWN_SEVERITY.has(severity) ? (severity as InventoryReadinessIssueSeverity) : "INFO";
}

function normalizeWarnings(value: unknown): InventoryReadinessWarning[] {
  return Array.isArray(value)
    ? value.map((row) => {
        const warning = asRecord(row);
        return {
          code: asString(warning.code, "WARNING"),
          message: asString(warning.message),
        };
      })
    : [];
}

function normalizeReadiness(payload: unknown): InventoryReadinessResponse {
  const raw = asRecord(payload);
  const inventoryReady = asBoolean(raw.inventory_ready);
  const summary = asRecord(raw.summary);
  const sections = Array.isArray(raw.sections)
    ? raw.sections.map((row) => {
        const section = asRecord(row);
        const movementLabels = Array.isArray(section.movement_type_labels)
          ? section.movement_type_labels.map((labelRow) => {
              const label = asRecord(labelRow);
              return { value: asString(label.value), label: asString(label.label) };
            })
          : undefined;
        return {
          key: asString(section.key),
          label: asString(section.label, asString(section.key, "Readiness section")),
          status: asStatus(section.status),
          blockers: asNumber(section.blockers),
          warnings: asNumber(section.warnings),
          checks: Array.isArray(section.checks)
            ? section.checks.map((checkRow) => {
                const check = asRecord(checkRow);
                return {
                  key: asString(check.key),
                  label: asString(check.label, asString(check.key, "Readiness check")),
                  status: asStatus(check.status),
                  detail: asString(check.detail),
                  count: check.count === null ? null : asNumber(check.count),
                  action_label: asString(check.action_label),
                  action_href: asString(check.action_href),
                };
              })
            : [],
          ...(movementLabels ? { movement_type_labels: movementLabels } : {}),
        };
      })
    : [];

  return {
    module_not_configured: asBoolean(raw.module_not_configured),
    overall_status: asOverallStatus(raw.overall_status, inventoryReady),
    summary: {
      blockers: asNumber(summary.blockers),
      warnings: asNumber(summary.warnings),
      ready_checks: asNumber(summary.ready_checks),
      total_checks: asNumber(summary.total_checks),
    },
    last_checked_at: asString(raw.last_checked_at),
    sections,
    issues: Array.isArray(raw.issues)
      ? raw.issues.map((row) => {
          const issue = asRecord(row);
          return {
            severity: asSeverity(issue.severity),
            section: asString(issue.section),
            title: asString(issue.title, "Readiness issue"),
            detail: asString(issue.detail),
            object_type: asString(issue.object_type),
            object_id: asString(issue.object_id),
            action_label: asString(issue.action_label),
            action_href: asString(issue.action_href),
          };
        })
      : [],
    operator_shortcuts: Array.isArray(raw.operator_shortcuts)
      ? raw.operator_shortcuts.map((row) => {
          const shortcut = asRecord(row);
          return {
            label: asString(shortcut.label, "Open workspace"),
            href: asString(shortcut.href),
            description: asString(shortcut.description),
          };
        })
      : [],
    inventory_ready: inventoryReady,
    global_inventory_ready: asBoolean(raw.global_inventory_ready),
    product_count: asNumber(raw.product_count),
    active_product_count: asNumber(raw.active_product_count),
    stock_item_count: asNumber(raw.stock_item_count),
    active_tracked_stock_items: asNumber(raw.active_tracked_stock_items),
    stock_needs_open: asNumber(raw.stock_needs_open),
    open_operational_stock_needs: asNumber(raw.open_operational_stock_needs),
    stock_movements_count: asNumber(raw.stock_movements_count),
    opening_stock_posted_count: asNumber(raw.opening_stock_posted_count),
    opening_stock_draft_count: asNumber(raw.opening_stock_draft_count),
    opening_stock_ready: asBoolean(raw.opening_stock_ready),
    warnings: normalizeWarnings(raw.warnings),
    recommended_actions: Array.isArray(raw.recommended_actions)
      ? raw.recommended_actions.map((row) => asString(row)).filter(Boolean)
      : [],
  };
}

export async function getInventoryReadiness(): Promise<InventoryReadinessResponse> {
  const payload = await request<unknown>("/admin/inventory/readiness/");
  return normalizeReadiness(payload);
}

export async function listStockNeeds(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  const suffix = qs ? `?${qs}` : "";
  return request(`/admin/inventory/stock-needs/${suffix}`);
}

export async function createStockNeed(payload: Record<string, unknown>) {
  return request("/admin/inventory/stock-needs/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchStockNeed(id: number, payload: Record<string, unknown>) {
  return request(`/admin/inventory/stock-needs/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function recheckStockNeed(id: number) {
  return request(`/admin/inventory/stock-needs/${id}/recheck/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/** Starts procurement review (PurchaseNeed → IN_REVIEW). Does not create a vendor PO or bill. */
export async function createPurchaseSuggestionForNeed(
  id: number,
  payload: Record<string, unknown> = {}
) {
  return request(`/admin/inventory/stock-needs/${id}/purchase-suggestion/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
