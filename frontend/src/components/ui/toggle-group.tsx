"use client";

import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export function ToggleGroup({ className, ...props }: ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn("flex flex-wrap items-center gap-1 rounded-xl border border-border bg-muted/50/60 p-1", className)}
      {...props}
    />
  );
}

export function ToggleGroupItem({ className, ...props }: ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        "inline-flex min-h-[34px] items-center justify-center rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground outline-none transition hover:bg-[var(--surface-card-elevated)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-[var(--surface-card-elevated)] data-[state=on]:text-foreground data-[state=on]:shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]",
        className
      )}
      {...props}
    />
  );
}
