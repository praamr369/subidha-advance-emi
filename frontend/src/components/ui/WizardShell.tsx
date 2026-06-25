// frontend/src/components/ui/WizardShell.tsx
"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

type WizardShellProps = {
  step: number;
  totalSteps: number;
  title: string;
  children: ReactNode;
  className?: string;
};

export default function WizardShell({
  step,
  totalSteps,
  title,
  children,
  className,
}: WizardShellProps) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-6 shadow-sm", className)}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <div className="text-sm text-muted-foreground">
          Step {step} of {totalSteps}
        </div>
      </div>
      <div className="mb-6 h-1.5 w-full rounded-full bg-muted">
        <div
          className="h-1.5 rounded-full bg-primary transition-all"
          style={{ width: `${(step / totalSteps) * 100}%` }}
        />
      </div>
      {children}
    </div>
  );
}