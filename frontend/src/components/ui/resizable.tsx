"use client";

import {
  Panel as PanelPrimitive,
  PanelGroup as PanelGroupPrimitive,
  PanelResizeHandle as PanelResizeHandlePrimitive,
} from "react-resizable-panels";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** Horizontal / vertical split layouts — workspace-only UI chrome (react-resizable-panels). */
export function PanelGroup({ className, ...props }: ComponentProps<typeof PanelGroupPrimitive>) {
  return (
    <PanelGroupPrimitive data-slot="resizable-panel-group" className={cn("flex h-full w-full", className)} {...props} />
  );
}

export function Panel({ className, ...props }: ComponentProps<typeof PanelPrimitive>) {
  return <PanelPrimitive data-slot="resizable-panel" className={cn("min-h-0 min-w-0", className)} {...props} />;
}

export function PanelResizeHandle({
  className,
  children,
  ...props
}: ComponentProps<typeof PanelResizeHandlePrimitive>) {
  return (
    <PanelResizeHandlePrimitive
      data-slot="resizable-handle"
      className={cn(
        "group relative mx-1 flex w-3 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      {...props}
    >
      {children ?? (
        <span className="h-28 w-1 rounded-full bg-border transition group-hover:bg-muted-foreground/45" />
      )}
    </PanelResizeHandlePrimitive>
  );
}
