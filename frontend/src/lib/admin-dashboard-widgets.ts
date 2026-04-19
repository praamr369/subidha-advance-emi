export type AdminDashboardWidgetAttention = "normal" | "warning" | "urgent" | "quiet";

export type AdminDashboardWidgetPrefs = {
  version: 1;
  open: string[];
  pinned: string[];
  collapsed: string[];
};

export const ADMIN_DASHBOARD_WIDGET_PREFS_KEY =
  "subidha:admin-dashboard-widgets:v1";

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

export function normalizeAdminDashboardWidgetPrefs(params: {
  raw: unknown;
  defaults: AdminDashboardWidgetPrefs;
  allowedWidgetIds: readonly string[];
}): AdminDashboardWidgetPrefs {
  const { raw, defaults, allowedWidgetIds } = params;
  const allowed = new Set(allowedWidgetIds);

  if (!raw || typeof raw !== "object") return defaults;
  const record = raw as Record<string, unknown>;
  const open = uniqueStrings(toStringArray(record.open)).filter((id) => allowed.has(id));
  const pinned = uniqueStrings(toStringArray(record.pinned)).filter((id) => allowed.has(id));
  const collapsed = uniqueStrings(toStringArray(record.collapsed)).filter((id) =>
    allowed.has(id)
  );

  return {
    version: 1,
    open: open.length > 0 ? open : defaults.open,
    pinned,
    collapsed,
  };
}

export function readAdminDashboardWidgetPrefs(params: {
  defaults: AdminDashboardWidgetPrefs;
  allowedWidgetIds: readonly string[];
}): AdminDashboardWidgetPrefs {
  const { defaults, allowedWidgetIds } = params;
  if (typeof window === "undefined") return defaults;

  try {
    const raw = window.localStorage.getItem(ADMIN_DASHBOARD_WIDGET_PREFS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as unknown;
    return normalizeAdminDashboardWidgetPrefs({
      raw: parsed,
      defaults,
      allowedWidgetIds,
    });
  } catch {
    return defaults;
  }
}

export function writeAdminDashboardWidgetPrefs(prefs: AdminDashboardWidgetPrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ADMIN_DASHBOARD_WIDGET_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage failures (private mode / quota).
  }
}

