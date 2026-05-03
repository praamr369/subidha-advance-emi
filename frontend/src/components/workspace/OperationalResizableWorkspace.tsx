"use client";

import {
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "@/components/ui/resizable";

import { cn } from "@/lib/utils";

function useDesktopOperationalSplit(minWidthPx = 1024): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") {
        return () => {};
      }
      const mq = window.matchMedia(`(min-width: ${minWidthPx}px)`);
      const handler = () => {
        onStoreChange();
      };
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    },
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(`(min-width: ${minWidthPx}px)`).matches,
    () => false
  );
}

function useSafeAutoSaveId(
  storageKey: string,
  persistLayout: boolean
): string | undefined {
  return useMemo(() => {
    if (!persistLayout || typeof window === "undefined") {
      return undefined;
    }
    try {
      const probe = "__subidha_rp_storage_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return `subidha:rp:${storageKey}`;
    } catch {
      return undefined;
    }
  }, [storageKey, persistLayout]);
}

export type OperationalResizableWorkspaceProps = {
  storageKey: string;
  left: ReactNode;
  right: ReactNode;
  /** Default left pane width as % of group (desktop only). */
  defaultLeftPercent?: number;
  minLeftPercent?: number;
  minRightPercent?: number;
  persistLayout?: boolean;
  className?: string;
};

export default function OperationalResizableWorkspace({
  storageKey,
  left,
  right,
  defaultLeftPercent = 34,
  minLeftPercent = 20,
  minRightPercent = 30,
  persistLayout = true,
  className,
}: OperationalResizableWorkspaceProps) {
  const isDesktopSplit = useDesktopOperationalSplit();
  const autoSaveId = useSafeAutoSaveId(storageKey, persistLayout);

  if (!isDesktopSplit) {
    return (
      <div
        data-op-workspace
        className={cn("flex flex-col gap-6", className)}
      >
        <div className="min-w-0">{left}</div>
        <div className="min-w-0">{right}</div>
      </div>
    );
  }

  return (
    <div
      data-op-workspace
      className={cn("min-h-[420px] h-[min(68vh,640px)]", className)}
    >
      <PanelGroup
        direction="horizontal"
        autoSaveId={autoSaveId}
        className="flex h-full gap-0"
      >
        <Panel
          defaultSize={defaultLeftPercent}
          minSize={minLeftPercent}
          className="min-h-0 min-w-0"
        >
          <div className="h-full min-h-0 overflow-y-auto pr-2">{left}</div>
        </Panel>
        <PanelResizeHandle />
        <Panel minSize={minRightPercent} className="min-h-0 min-w-0">
          <div className="h-full min-h-0 overflow-y-auto pl-2">{right}</div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
