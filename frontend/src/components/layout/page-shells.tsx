import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type ShellProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Layout-only shells: semantic regions, spacing, responsive overflow safety.
 * No data fetching, no role logic, no fabricated content.
 */

export function RegistryPageShell({ children, className }: ShellProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-6 text-foreground [&_*]:max-w-full",
        className
      )}
    >
      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  );
}

export function TransactionPageShell({ children, className }: ShellProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-6 text-foreground [&_*]:max-w-full",
        className
      )}
    >
      {children}
    </div>
  );
}

export function DetailPageShell({ children, className }: ShellProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-6 text-foreground [&_*]:max-w-full",
        className
      )}
    >
      {children}
    </div>
  );
}

export function SetupChecklistPageShell({ children, className }: ShellProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-6 text-foreground [&_*]:max-w-full",
        className
      )}
    >
      <section aria-label="Setup checklist and blockers" className="min-w-0 space-y-6">
        {children}
      </section>
    </div>
  );
}

export function ApprovalQueuePageShell({ children, className }: ShellProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-6 text-foreground [&_*]:max-w-full",
        className
      )}
    >
      <section aria-label="Approval queue" className="min-w-0 space-y-6">
        {children}
      </section>
    </div>
  );
}

export function CashierWorkflowShell({ children, className }: ShellProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-6 pb-24 text-foreground sm:pb-6 [&_*]:max-w-full",
        className
      )}
    >
      <section aria-label="Cashier collection workflow" className="min-w-0 space-y-6">
        {children}
      </section>
    </div>
  );
}

export function AccountingControlShell({ children, className }: ShellProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-6 text-foreground [&_*]:max-w-full",
        className
      )}
    >
      <section aria-label="Accounting controls" className="min-w-0 space-y-6">
        {children}
      </section>
    </div>
  );
}

export function ReportPageShell({ children, className }: ShellProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-6 text-foreground [&_*]:max-w-full",
        className
      )}
    >
      <section aria-label="Report surface" className="min-w-0 space-y-6">
        {children}
      </section>
    </div>
  );
}

export function SelfServicePageShell({ children, className }: ShellProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-6 text-foreground [&_*]:max-w-full",
        className
      )}
    >
      <section aria-label="Customer self-service" className="min-w-0 space-y-6">
        {children}
      </section>
    </div>
  );
}

export function PartnerVendorWorkspaceShell({ children, className }: ShellProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-6 text-foreground [&_*]:max-w-full",
        className
      )}
    >
      <section aria-label="Partner or vendor workspace" className="min-w-0 space-y-6">
        {children}
      </section>
    </div>
  );
}

export function OperationsWorkspaceShell({ children, className }: ShellProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-6 text-foreground [&_*]:max-w-full",
        className
      )}
    >
      <section aria-label="Operations workspace" className="min-w-0 space-y-6">
        {children}
      </section>
    </div>
  );
}

export function ExecutiveDashboardShell({ children, className }: ShellProps) {
  return (
    <section
      aria-label="Executive dashboard"
      className={cn("min-w-0 space-y-8 text-foreground [&_*]:max-w-full", className)}
    >
      {children}
    </section>
  );
}

export function PublicMarketingShell({ children, className }: ShellProps) {
  return (
    <main
      className={cn("min-w-0 text-foreground [&_*]:max-w-full", className)}
    >
      {children}
    </main>
  );
}
