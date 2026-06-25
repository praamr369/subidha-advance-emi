"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type FieldHelpProps = {
  meaning: ReactNode;
  requiredWhy?: ReactNode;
  examples?: ReactNode;
  className?: string;
};

export default function FieldHelp({ meaning, requiredWhy, examples, className }: FieldHelpProps) {
  return (
    <div className={cn("rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm", className)}>
      <div className="font-semibold text-foreground">Field help</div>
      <div className="mt-2 space-y-2 text-muted-foreground">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
            What this means
          </div>
          <div className="mt-1 leading-relaxed text-foreground/90">{meaning}</div>
        </div>
        {requiredWhy ? (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
              Why it is required
            </div>
            <div className="mt-1 leading-relaxed text-foreground/90">{requiredWhy}</div>
          </div>
        ) : null}
        {examples ? (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
              Examples
            </div>
            <div className="mt-1 leading-relaxed text-foreground/90">{examples}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

