import test from "node:test";
import assert from "node:assert/strict";

import {
  applyPresetInteraction,
  applyPresetBoardPrefs,
  areBoardPrefsEqual,
  buildDefaultBoardPrefs,
  getBoardModeBadgeLabel,
  normalizeBoardPrefs,
  resetToActivePresetInteraction,
  resetToDefaultInteraction,
  resolveBoardMode,
  restoreAllHiddenWidgetsInteraction,
  shouldEmphasizePresetWidget,
  type DashboardBoardInteractionState,
  type DashboardBoardPrefs,
  type DashboardBoardWidgetMeta,
} from "../../src/lib/dashboard-widget-board";

const widgets: DashboardBoardWidgetMeta[] = [
  { id: "w-core", fixed: true, defaultVisible: true, defaultPinned: true },
  { id: "w-a", defaultVisible: true },
  { id: "w-b", defaultVisible: false },
  { id: "w-c", defaultVisible: true, defaultPinned: true },
];

test("buildDefaultBoardPrefs constructs defaults deterministically", () => {
  const defaults = buildDefaultBoardPrefs(widgets, 3);
  assert.deepEqual(defaults, {
    version: 3,
    order: ["w-core", "w-a", "w-b", "w-c"],
    hidden: ["w-b"],
    pinned: ["w-core", "w-c"],
  });
});

test("normalizeBoardPrefs keeps allowed IDs, deduplicates, and appends missing IDs", () => {
  const normalized = normalizeBoardPrefs({
    widgets,
    version: 3,
    prefs: {
      version: 3,
      order: ["w-c", "w-a", "w-unknown", "w-a"],
      hidden: ["w-b", "w-unknown", "w-b"],
      pinned: ["w-c", "w-unknown", "w-c"],
    },
  });

  assert.deepEqual(normalized, {
    version: 3,
    order: ["w-c", "w-a", "w-core", "w-b"],
    hidden: ["w-b"],
    pinned: ["w-c"],
  });
});

test("normalizeBoardPrefs prevents hiding fixed widgets", () => {
  const normalized = normalizeBoardPrefs({
    widgets,
    version: 3,
    prefs: {
      version: 3,
      order: ["w-core", "w-a", "w-b", "w-c"],
      hidden: ["w-core", "w-b"],
      pinned: ["w-core"],
    },
  });

  assert.deepEqual(normalized.hidden, ["w-b"]);
});

test("normalizeBoardPrefs resets to defaults on stale version", () => {
  const stalePrefs: DashboardBoardPrefs = {
    version: 2,
    order: ["w-a"],
    hidden: [],
    pinned: [],
  };

  const normalized = normalizeBoardPrefs({ widgets, prefs: stalePrefs, version: 3 });
  assert.deepEqual(normalized, buildDefaultBoardPrefs(widgets, 3));
});

test("applyPresetBoardPrefs enforces fixed widget protection and filters unknown IDs", () => {
  const applied = applyPresetBoardPrefs({
    widgets,
    version: 3,
    preset: {
      id: "preset-ops",
      order: ["w-b", "w-unknown", "w-a"],
      hidden: ["w-core", "w-a", "w-ghost"],
      pinned: ["w-b", "w-ghost"],
    },
  });

  assert.deepEqual(applied, {
    version: 3,
    order: ["w-b", "w-a", "w-core", "w-c"],
    hidden: ["w-a"],
    pinned: ["w-b"],
  });
});

test("areBoardPrefsEqual checks strict value equality", () => {
  const left: DashboardBoardPrefs = {
    version: 3,
    order: ["a", "b"],
    hidden: ["c"],
    pinned: ["a"],
  };

  const same: DashboardBoardPrefs = {
    version: 3,
    order: ["a", "b"],
    hidden: ["c"],
    pinned: ["a"],
  };

  const reordered: DashboardBoardPrefs = {
    version: 3,
    order: ["b", "a"],
    hidden: ["c"],
    pinned: ["a"],
  };

  assert.equal(areBoardPrefsEqual(left, same), true);
  assert.equal(areBoardPrefsEqual(left, reordered), false);
});

test("resolveBoardMode supports default, preset, and customized states", () => {
  const defaultPrefs = buildDefaultBoardPrefs(widgets, 3);
  const preset = {
    id: "preset-ops",
    order: ["w-c", "w-core", "w-a", "w-b"],
    hidden: ["w-b"],
    pinned: ["w-c"],
    emphasisWidgetIds: ["w-c"],
  };

  const presetPrefs = applyPresetBoardPrefs({ widgets, preset, version: 3 });

  assert.equal(
    resolveBoardMode({
      prefs: defaultPrefs,
      defaultPrefs,
      activePresetId: null,
      presets: [preset],
      widgets,
      version: 3,
    }),
    "default"
  );

  assert.equal(
    resolveBoardMode({
      prefs: presetPrefs,
      defaultPrefs,
      activePresetId: "preset-ops",
      presets: [preset],
      widgets,
      version: 3,
    }),
    "preset"
  );

  assert.equal(
    resolveBoardMode({
      prefs: { ...presetPrefs, hidden: [] },
      defaultPrefs,
      activePresetId: "preset-ops",
      presets: [preset],
      widgets,
      version: 3,
    }),
    "customized"
  );
});

test("reset-to-default behavior can be validated by equality with defaults", () => {
  const defaultPrefs = buildDefaultBoardPrefs(widgets, 3);
  const customized: DashboardBoardPrefs = {
    version: 3,
    order: ["w-a", "w-core", "w-c", "w-b"],
    hidden: ["w-b", "w-a"],
    pinned: ["w-c"],
  };

  assert.equal(areBoardPrefsEqual(customized, defaultPrefs), false);
  assert.equal(areBoardPrefsEqual(defaultPrefs, buildDefaultBoardPrefs(widgets, 3)), true);
});

test("shouldEmphasizePresetWidget only emphasizes when preset is active and non-default", () => {
  const preset = {
    id: "p",
    order: ["w-core", "w-a", "w-b", "w-c"],
    emphasisWidgetIds: ["w-c"],
  };

  assert.equal(
    shouldEmphasizePresetWidget({
      widgetId: "w-c",
      activePreset: preset,
      boardMode: "preset",
    }),
    true
  );
  assert.equal(
    shouldEmphasizePresetWidget({
      widgetId: "w-c",
      activePreset: preset,
      boardMode: "default",
    }),
    false
  );
  assert.equal(
    shouldEmphasizePresetWidget({
      widgetId: "w-a",
      activePreset: preset,
      boardMode: "preset",
    }),
    false
  );
});

test("interaction flow supports apply preset -> customized -> reset to preset -> reset default", () => {
  const defaultPrefs = buildDefaultBoardPrefs(widgets, 3);
  const preset = {
    id: "ops-priority",
    label: "Ops priority",
    order: ["w-c", "w-core", "w-a", "w-b"],
    pinned: ["w-c"],
    emphasisWidgetIds: ["w-c"],
  };

  let state: DashboardBoardInteractionState = {
    prefs: defaultPrefs,
    activePresetId: null,
    statusNote: null as string | null,
  };

  state = applyPresetInteraction({ state, widgets, preset, version: 3 });
  assert.equal(state.activePresetId, "ops-priority");
  assert.equal(state.statusNote, "Preset applied: Ops priority");
  assert.equal(
    resolveBoardMode({
      prefs: state.prefs,
      defaultPrefs,
      activePresetId: state.activePresetId,
      presets: [preset],
      widgets,
      version: 3,
    }),
    "preset"
  );

  state = {
    ...state,
    prefs: { ...state.prefs, hidden: ["w-a"] },
    statusNote: "Widget hidden",
  };
  assert.equal(
    resolveBoardMode({
      prefs: state.prefs,
      defaultPrefs,
      activePresetId: state.activePresetId,
      presets: [preset],
      widgets,
      version: 3,
    }),
    "customized"
  );

  state = resetToActivePresetInteraction({
    state,
    widgets,
    presets: [preset],
    version: 3,
  });
  assert.equal(state.statusNote, "Preset applied: Ops priority");
  assert.equal(
    resolveBoardMode({
      prefs: state.prefs,
      defaultPrefs,
      activePresetId: state.activePresetId,
      presets: [preset],
      widgets,
      version: 3,
    }),
    "preset"
  );

  state = resetToDefaultInteraction({ state, defaultPrefs });
  assert.equal(state.activePresetId, null);
  assert.equal(state.statusNote, "Layout reset to default");
  assert.equal(areBoardPrefsEqual(state.prefs, defaultPrefs), true);
  assert.equal(
    resolveBoardMode({
      prefs: state.prefs,
      defaultPrefs,
      activePresetId: state.activePresetId,
      presets: [preset],
      widgets,
      version: 3,
    }),
    "default"
  );
});

test("interaction helpers preserve fixed widget protection and hidden-widget recovery", () => {
  const defaultPrefs = buildDefaultBoardPrefs(widgets, 3);
  const preset = {
    id: "invalid-hidden",
    label: "Invalid hidden preset",
    order: ["w-b", "w-a", "w-c", "w-core"],
    hidden: ["w-core", "w-b"],
    pinned: ["w-c"],
  };
  let state: DashboardBoardInteractionState = {
    prefs: defaultPrefs,
    activePresetId: null,
    statusNote: null as string | null,
  };

  state = applyPresetInteraction({ state, widgets, preset, version: 3 });
  assert.equal(state.prefs.hidden.includes("w-core"), false);
  assert.equal(state.prefs.hidden.includes("w-b"), true);

  state = restoreAllHiddenWidgetsInteraction({ state });
  assert.deepEqual(state.prefs.hidden, []);
  assert.equal(state.statusNote, "All hidden widgets restored");
});

test("badge labeling reflects board mode and active preset", () => {
  assert.equal(
    getBoardModeBadgeLabel({ boardMode: "default", activePresetLabel: null }),
    "Default layout"
  );
  assert.equal(
    getBoardModeBadgeLabel({ boardMode: "preset", activePresetLabel: "Finance watch" }),
    "Active preset: Finance watch"
  );
  assert.equal(
    getBoardModeBadgeLabel({ boardMode: "customized", activePresetLabel: "Finance watch" }),
    "Customized layout"
  );
});
