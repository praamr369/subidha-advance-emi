"use client";

import { GripVertical, Pin, PinOff, RotateCcw, Settings2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import ActionButton from "@/components/ui/ActionButton";
import {
  applyPresetInteraction,
  buildDefaultBoardPrefs,
  getBoardModeBadgeLabel,
  normalizeBoardPrefs,
  resetToActivePresetInteraction,
  resetToDefaultInteraction,
  resolveBoardMode,
  restoreAllHiddenWidgetsInteraction,
  shouldEmphasizePresetWidget,
  type DashboardBoardInteractionState,
  type DashboardBoardMode,
  type DashboardBoardPreset,
  type DashboardBoardPrefs,
  type DashboardBoardWidgetMeta,
} from "@/lib/dashboard-widget-board";
import { readJson, writeJson } from "@/lib/storage";
import { cn } from "@/lib/utils";

type WidgetGroup = "core" | "attention" | "quick-actions" | "operational";

export type DashboardWidgetDefinition = {
  id: string;
  title: string;
  subtitle: string;
  group: WidgetGroup;
  fixed?: boolean;
  defaultVisible?: boolean;
  defaultPinned?: boolean;
  content: ReactNode;
};

export type DashboardWidgetPreset = DashboardBoardPreset & {
  label: string;
  description: string;
};

type DashboardWidgetBoardProps = {
  storageKey: string;
  version?: number;
  title: string;
  description: string;
  widgets: DashboardWidgetDefinition[];
  presets?: DashboardWidgetPreset[];
};

export default function DashboardWidgetBoard({
  storageKey,
  version = 1,
  title,
  description,
  widgets,
  presets = [],
}: DashboardWidgetBoardProps) {
  const widgetMeta: DashboardBoardWidgetMeta[] = useMemo(
    () =>
      widgets.map((widget) => ({
        id: widget.id,
        fixed: widget.fixed,
        defaultPinned: widget.defaultPinned,
        defaultVisible: widget.defaultVisible,
      })),
    [widgets]
  );
  const defaultPrefs = useMemo(
    () => buildDefaultBoardPrefs(widgetMeta, version),
    [version, widgetMeta]
  );

  const [prefs, setPrefs] = useState<DashboardBoardPrefs>(() =>
    normalizeBoardPrefs({
      widgets: widgetMeta,
      prefs: readJson<DashboardBoardPrefs | null>(storageKey, null),
      version,
    })
  );
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  function persist(next: DashboardBoardInteractionState) {
    setPrefs(next.prefs);
    setActivePresetId(next.activePresetId);
    setStatusNote(next.statusNote);
    writeJson(storageKey, next.prefs);
  }

  function applyPreset(preset: DashboardWidgetPreset) {
    persist(
      applyPresetInteraction({
        state: { prefs, activePresetId, statusNote },
        widgets: widgetMeta,
        preset,
        version,
      })
    );
  }

  function reorder(id: string, targetId: string) {
    if (id === targetId) return;
    const current = [...prefs.order];
    const sourceIndex = current.indexOf(id);
    const targetIndex = current.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    current.splice(sourceIndex, 1);
    current.splice(targetIndex, 0, id);
    persist({ prefs: { ...prefs, order: current }, activePresetId, statusNote: "Widget order updated" });
  }

  function move(id: string, direction: "up" | "down") {
    const current = [...prefs.order];
    const index = current.indexOf(id);
    if (index < 0) return;
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= current.length) return;
    const [picked] = current.splice(index, 1);
    current.splice(swapIndex, 0, picked);
    persist({ prefs: { ...prefs, order: current }, activePresetId, statusNote: "Widget order updated" });
  }

  function toggleHidden(id: string) {
    const widget = widgets.find((item) => item.id === id);
    if (widget?.fixed) return;
    const hidden = prefs.hidden.includes(id)
      ? prefs.hidden.filter((value) => value !== id)
      : [...prefs.hidden, id];
    persist({
      prefs: { ...prefs, hidden },
      activePresetId,
      statusNote: hidden.includes(id) ? "Widget hidden" : "Widget shown",
    });
  }

  function togglePinned(id: string) {
    const pinned = prefs.pinned.includes(id)
      ? prefs.pinned.filter((value) => value !== id)
      : [...prefs.pinned, id];
    persist({
      prefs: { ...prefs, pinned },
      activePresetId,
      statusNote: pinned.includes(id) ? "Widget pinned" : "Widget unpinned",
    });
  }

  const widgetMap = useMemo(
    () => new Map(widgets.map((widget) => [widget.id, widget])),
    [widgets]
  );
  const visibleIds = prefs.order.filter((id) => !prefs.hidden.includes(id));
  const orderedIds = [
    ...visibleIds.filter((id) => prefs.pinned.includes(id)),
    ...visibleIds.filter((id) => !prefs.pinned.includes(id)),
  ];
  const activePreset = presets.find((preset) => preset.id === activePresetId) ?? null;
  const boardMode: DashboardBoardMode = resolveBoardMode({
    prefs,
    defaultPrefs,
    activePresetId,
    presets,
    widgets: widgetMeta,
    version,
  });

  return (
    <section className="workspace-section-shell surface-panel-elevated rounded-[1.7rem] p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          <div className="mt-2 inline-flex items-center rounded-full border border-border px-2 py-1 text-xs font-semibold text-muted-foreground">
            {getBoardModeBadgeLabel({ boardMode, activePresetLabel: activePreset?.label })}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {presets.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <ActionButton
                  key={preset.id}
                  type="button"
                  variant={activePresetId === preset.id ? "secondary" : "outline"}
                  onClick={() => applyPreset(preset)}
                  title={preset.description}
                >
                  {preset.label}
                </ActionButton>
              ))}
            </div>
          ) : null}
          <ActionButton
            type="button"
            variant="outline"
            leftIcon={<Settings2 className="h-4 w-4" />}
            onClick={() => setShowControls((current) => !current)}
          >
            {showControls ? "Hide controls" : "Widget controls"}
          </ActionButton>
          <ActionButton
            type="button"
            variant="ghost"
            leftIcon={<RotateCcw className="h-4 w-4" />}
            onClick={() => {
              persist(resetToDefaultInteraction({ state: { prefs, activePresetId, statusNote }, defaultPrefs }));
            }}
          >
            Reset layout
          </ActionButton>
          {activePresetId ? (
            <ActionButton
              type="button"
              variant="ghost"
              onClick={() => {
                persist(
                  resetToActivePresetInteraction({
                    state: { prefs, activePresetId, statusNote },
                    widgets: widgetMeta,
                    presets,
                    version,
                  })
                );
              }}
            >
              Reset to preset
            </ActionButton>
          ) : null}
        </div>
      </div>

      {statusNote ? (
        <div className="mt-3 rounded-lg border border-border bg-[var(--surface-card-elevated)] px-3 py-2 text-xs text-muted-foreground">
          {statusNote}
        </div>
      ) : null}

      {prefs.hidden.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <div className="text-sm text-amber-800">
            {prefs.hidden.length} widget{prefs.hidden.length > 1 ? "s are" : " is"} currently hidden.
          </div>
          <ActionButton
            type="button"
            variant="outline"
            onClick={() =>
              persist(restoreAllHiddenWidgetsInteraction({ state: { prefs, activePresetId, statusNote } }))
            }
          >
            Restore all hidden widgets
          </ActionButton>
        </div>
      ) : null}

      {showControls ? (
        <div className="mt-4 grid gap-2 rounded-xl border border-border bg-[var(--surface-card-elevated)] p-3">
          {prefs.order.map((id) => {
            const widget = widgetMap.get(id);
            if (!widget) return null;
            const isHidden = prefs.hidden.includes(id);
            const isPinned = prefs.pinned.includes(id);
            return (
              <div
                key={`control-${id}`}
                data-testid={`dashboard-widget-control-row:${id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-semibold text-foreground">{widget.title}</div>
                  <div className="text-xs text-muted-foreground">{widget.subtitle}</div>
                </div>
                <div className="flex gap-2">
                  {!widget.fixed ? (
                    <ActionButton type="button" variant="outline" onClick={() => toggleHidden(id)}>
                      {isHidden ? "Show" : "Hide"}
                    </ActionButton>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-border px-2 py-1 text-xs font-semibold text-muted-foreground">
                      Core widget
                    </span>
                  )}
                  <ActionButton type="button" variant="outline" onClick={() => togglePinned(id)}>
                    {isPinned ? (
                      <span className="inline-flex items-center gap-1"><PinOff className="h-3.5 w-3.5" />Unpin</span>
                    ) : (
                      <span className="inline-flex items-center gap-1"><Pin className="h-3.5 w-3.5" />Pin</span>
                    )}
                  </ActionButton>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4">
        <p className="text-xs text-muted-foreground">
          Tip: drag widgets with the grip, or use ↑/↓ controls for keyboard-friendly reorder.
        </p>
        {orderedIds.map((id) => {
          const widget = widgetMap.get(id);
          if (!widget) return null;
          const isPinned = prefs.pinned.includes(id);
          return (
            <article
              key={id}
              data-testid={`dashboard-widget:${id}`}
              draggable
              onDragStart={() => setActiveDragId(id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (activeDragId) reorder(activeDragId, id);
                setActiveDragId(null);
              }}
              className={cn(
                "rounded-[1.4rem] border border-border bg-background p-4 shadow-sm",
                shouldEmphasizePresetWidget({ widgetId: id, activePreset, boardMode })
                  ? "ring-1 ring-sky-300/70"
                  : "",
                activeDragId === id ? "ring-2 ring-primary/20" : ""
              )}
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {widget.group}
                  </div>
                  <h3 className="mt-1 text-base font-semibold text-foreground">{widget.title}</h3>
                  <p className="text-sm text-muted-foreground">{widget.subtitle}</p>
                </div>
                <div className="flex items-center gap-2">
                  {isPinned ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                      <Pin className="h-3 w-3" />
                      Pinned
                    </span>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Move ${widget.title} up`}
                    onClick={() => move(id, "up")}
                    className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-foreground"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${widget.title} down`}
                    onClick={() => move(id, "down")}
                    className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-foreground"
                  >
                    ↓
                  </button>
                  <span className="inline-flex items-center rounded-lg border border-border bg-[var(--surface-card-elevated)] px-2 py-1 text-xs font-semibold text-muted-foreground">
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
              {widget.content}
            </article>
          );
        })}
      </div>
    </section>
  );
}
