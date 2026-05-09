import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-[22px] min-w-[22px] select-none items-center justify-center rounded-md border border-border bg-muted px-1.5 font-mono text-[11px] font-semibold leading-none text-muted-foreground shadow-[inset_0_-1px_0_rgba(15,23,42,0.06)]",
        className
      )}
      {...props}
    />
  );
}
