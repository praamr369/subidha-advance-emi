export type DashboardBoardPrefs = {
  version: number;
  order: string[];
  hidden: string[];
  pinned: string[];
};

export type DashboardBoardWidgetMeta = {
  id: string;
  fixed?: boolean;
  defaultVisible?: boolean;
  defaultPinned?: boolean;
};

export type DashboardBoardPreset = {
  id: string;
  order: string[];
  hidden?: string[];
  pinned?: string[];
  emphasisWidgetIds?: string[];
};

export type DashboardBoardMode = "default" | "preset" | "customized";
export type DashboardBoardInteractionState = {
  prefs: DashboardBoardPrefs;
  activePresetId: string | null;
  statusNote: string | null;
};

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function buildDefaultBoardPrefs(
  widgets: DashboardBoardWidgetMeta[],
  version: number
): DashboardBoardPrefs {
  return {
    version,
    order: widgets.map((widget) => widget.id),
    hidden: widgets
      .filter((widget) => widget.defaultVisible === false && !widget.fixed)
      .map((widget) => widget.id),
    pinned: widgets.filter((widget) => widget.defaultPinned).map((widget) => widget.id),
  };
}

export function normalizeBoardPrefs(params: {
  widgets: DashboardBoardWidgetMeta[];
  prefs: DashboardBoardPrefs | null;
  version: number;
}): DashboardBoardPrefs {
  const { widgets, prefs, version } = params;
  const defaults = buildDefaultBoardPrefs(widgets, version);
  if (!prefs || prefs.version !== version) return defaults;

  const ids = widgets.map((widget) => widget.id);
  const fixedIds = new Set(widgets.filter((widget) => widget.fixed).map((widget) => widget.id));
  return {
    version,
    order: unique([
      ...prefs.order.filter((id) => ids.includes(id)),
      ...ids.filter((id) => !prefs.order.includes(id)),
    ]),
    hidden: unique(prefs.hidden).filter((id) => ids.includes(id) && !fixedIds.has(id)),
    pinned: unique(prefs.pinned).filter((id) => ids.includes(id)),
  };
}

export function applyPresetBoardPrefs(params: {
  widgets: DashboardBoardWidgetMeta[];
  preset: DashboardBoardPreset;
  version: number;
}): DashboardBoardPrefs {
  const { widgets, preset, version } = params;
  const ids = widgets.map((widget) => widget.id);
  const fixedIds = new Set(widgets.filter((widget) => widget.fixed).map((widget) => widget.id));

  return {
    version,
    order: unique([
      ...preset.order.filter((id) => ids.includes(id)),
      ...ids.filter((id) => !preset.order.includes(id)),
    ]),
    hidden: unique(preset.hidden ?? []).filter((id) => ids.includes(id) && !fixedIds.has(id)),
    pinned: unique(preset.pinned ?? []).filter((id) => ids.includes(id)),
  };
}

export function areBoardPrefsEqual(left: DashboardBoardPrefs, right: DashboardBoardPrefs): boolean {
  return (
    left.version === right.version &&
    left.order.join("|") === right.order.join("|") &&
    left.hidden.join("|") === right.hidden.join("|") &&
    left.pinned.join("|") === right.pinned.join("|")
  );
}

export function resolveBoardMode(params: {
  prefs: DashboardBoardPrefs;
  defaultPrefs: DashboardBoardPrefs;
  activePresetId: string | null;
  presets: DashboardBoardPreset[];
  widgets: DashboardBoardWidgetMeta[];
  version: number;
}): DashboardBoardMode {
  const { prefs, defaultPrefs, activePresetId, presets, widgets, version } = params;
  const activePreset = presets.find((preset) => preset.id === activePresetId) ?? null;
  if (!activePreset) {
    return areBoardPrefsEqual(prefs, defaultPrefs) ? "default" : "customized";
  }

  const activePresetPrefs = applyPresetBoardPrefs({ widgets, preset: activePreset, version });
  return areBoardPrefsEqual(prefs, activePresetPrefs) ? "preset" : "customized";
}

export function shouldEmphasizePresetWidget(params: {
  widgetId: string;
  activePreset: DashboardBoardPreset | null;
  boardMode: DashboardBoardMode;
}): boolean {
  const { widgetId, activePreset, boardMode } = params;
  if (!activePreset || boardMode === "default") return false;
  return activePreset.emphasisWidgetIds?.includes(widgetId) ?? false;
}

export function getBoardModeBadgeLabel(params: {
  boardMode: DashboardBoardMode;
  activePresetLabel?: string | null;
}): string {
  const { boardMode, activePresetLabel } = params;
  if (boardMode === "preset") return `Active preset: ${activePresetLabel || "Preset"}`;
  if (boardMode === "default") return "Default layout";
  return "Customized layout";
}

export function applyPresetInteraction(params: {
  state: DashboardBoardInteractionState;
  widgets: DashboardBoardWidgetMeta[];
  preset: DashboardBoardPreset & { label: string };
  version: number;
}): DashboardBoardInteractionState {
  const { state, widgets, preset, version } = params;
  return {
    ...state,
    prefs: applyPresetBoardPrefs({ widgets, preset, version }),
    activePresetId: preset.id,
    statusNote: `Preset applied: ${preset.label}`,
  };
}

export function resetToDefaultInteraction(params: {
  state: DashboardBoardInteractionState;
  defaultPrefs: DashboardBoardPrefs;
}): DashboardBoardInteractionState {
  const { state, defaultPrefs } = params;
  return {
    ...state,
    prefs: defaultPrefs,
    activePresetId: null,
    statusNote: "Layout reset to default",
  };
}

export function resetToActivePresetInteraction(params: {
  state: DashboardBoardInteractionState;
  widgets: DashboardBoardWidgetMeta[];
  presets: Array<DashboardBoardPreset & { label: string }>;
  version: number;
}): DashboardBoardInteractionState {
  const { state, widgets, presets, version } = params;
  if (!state.activePresetId) return state;
  const preset = presets.find((item) => item.id === state.activePresetId);
  if (!preset) return state;
  return applyPresetInteraction({ state, widgets, preset, version });
}

export function restoreAllHiddenWidgetsInteraction(params: {
  state: DashboardBoardInteractionState;
}): DashboardBoardInteractionState {
  const { state } = params;
  return {
    ...state,
    prefs: { ...state.prefs, hidden: [] },
    statusNote: "All hidden widgets restored",
  };
}
