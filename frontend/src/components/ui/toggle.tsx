"use client";

import * as TogglePrimitive from "@radix-ui/react-toggle";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export function Toggle({ className, ...props }: ComponentProps<typeof TogglePrimitive.Root>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-[var(--surface-muted)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:border-border data-[state=on]:bg-[var(--surface-card-elevated)] data-[state=on]:text-foreground",
        className
      )}
      {...props}
    />
  );
}
