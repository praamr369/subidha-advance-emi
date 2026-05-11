import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Layout-only page shells (Phase 2 taxonomy).
 * - No data fetching, APIs, storage, role checks, or fabricated UI.
 * - Compose inside `PortalPage` for portal routes (this module stays server-safe: no `use client`).
 * - Theme tokens: bg-card, text-card-foreground, border-border, text-muted-foreground, ring tokens on focusable descendants only via pages.
 */

const shellColumn = "flex w-full min-w-0 max-w-none flex-col gap-6 text-foreground [&_*]:min-w-0 [&_*]:max-w-full";

function hasRenderable(node: ReactNode | undefined): node is Exclude<ReactNode, undefined | null | false> {
  return node != null && node !== false;
}

type ShellSlotProps = {
  as?: "div" | "section" | "aside" | "header" | "nav";
  "aria-label"?: string;
  className?: string;
  children?: ReactNode;
};

function ShellSlot({ as: Tag = "section", "aria-label": ariaLabel, className, children }: ShellSlotProps) {
  if (!hasRenderable(children)) return null;
  return (
    <Tag aria-label={ariaLabel} className={cn("min-w-0", className)}>
      {children}
    </Tag>
  );
}

// --- Registry (list / register) ---

export type RegistryPageShellProps = {
  className?: string;
  /** Toolbar row (actions) below page title — optional. */
  header?: ReactNode;
  /** Compact summary strip (counts, exposure) — keep shallow; avoid KPI walls. */
  summary?: ReactNode;
  /** Filters / search controls. */
  filters?: ReactNode;
  /** Primary table or register body. */
  register?: ReactNode;
  /** Legacy / escape hatch: full page body when structured slots are unused. */
  children?: ReactNode;
};

export function RegistryPageShell({ className, header, summary, filters, register, children }: RegistryPageShellProps) {
  const primary = register ?? children;
  const structured = hasRenderable(header) || hasRenderable(summary) || hasRenderable(filters) || hasRenderable(register);

  if (!structured && hasRenderable(children)) {
    return (
      <div className={cn(shellColumn, className)}>
        <section aria-label="Register" className="min-w-0 space-y-6">
          {children}
        </section>
      </div>
    );
  }

  return (
    <div className={cn(shellColumn, className)}>
      <ShellSlot as="header" aria-label="Page toolbar">
        {header}
      </ShellSlot>
      <ShellSlot aria-label="Summary">{summary}</ShellSlot>
      <ShellSlot aria-label="Filters and search">{filters}</ShellSlot>
      {hasRenderable(primary) ? (
        <section aria-label="Register" className="min-w-0 space-y-6">
          {primary}
        </section>
      ) : null}
    </div>
  );
}

// --- Transaction (create / edit / collect forms) ---

export type TransactionPageShellProps = {
  className?: string;
  header?: ReactNode;
  /** Primary form / workflow column. */
  form?: ReactNode;
  /** Optional sticky summary on large screens (desktop). */
  summaryAside?: ReactNode;
  children?: ReactNode;
};

export function TransactionPageShell({ className, header, form, summaryAside, children }: TransactionPageShellProps) {
  const primaryForm = form ?? children;
  const hasAside = hasRenderable(summaryAside);

  if (!hasAside) {
    return (
      <div className={cn(shellColumn, className)}>
        <ShellSlot as="header" aria-label="Form header">
          {header}
        </ShellSlot>
        <section aria-label="Form" className="min-w-0 space-y-6">
          {primaryForm}
        </section>
      </div>
    );
  }

  return (
    <div className={cn(shellColumn, className)}>
      <ShellSlot as="header" aria-label="Form header">
        {header}
      </ShellSlot>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)] lg:items-start lg:gap-8">
        <section aria-label="Form" className="min-w-0 space-y-6 lg:order-1">
          {primaryForm}
        </section>
        <aside
          aria-label="Summary"
          className="min-w-0 rounded-xl border border-border bg-card p-4 text-card-foreground lg:sticky lg:top-24 lg:order-2 lg:self-start lg:p-5"
        >
          {summaryAside}
        </aside>
      </div>
    </div>
  );
}

// --- Detail ([id] surfaces) ---

export type DetailPageShellProps = {
  className?: string;
  objectHeader?: ReactNode;
  statusActions?: ReactNode;
  /** Main sections / tabs — falls back to `children`. */
  sections?: ReactNode;
  /** Timeline, audit rail, or secondary context. */
  timelineAside?: ReactNode;
  children?: ReactNode;
};

export function DetailPageShell({
  className,
  objectHeader,
  statusActions,
  sections,
  timelineAside,
  children,
}: DetailPageShellProps) {
  const mainBody = sections ?? children;
  const hasAside = hasRenderable(timelineAside);

  const mainStack = (
    <div className="min-w-0 space-y-6">
      <ShellSlot as="header" aria-label="Record header">
        {objectHeader}
      </ShellSlot>
      <ShellSlot aria-label="Status and actions">{statusActions}</ShellSlot>
      {hasRenderable(mainBody) ? <section className="min-w-0 space-y-6">{mainBody}</section> : null}
    </div>
  );

  if (!hasAside) {
    return <div className={cn(shellColumn, className)}>{mainStack}</div>;
  }

  return (
    <div className={cn(shellColumn, className)}>
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] xl:items-start">
        <div className="min-w-0">{mainStack}</div>
        <aside
          aria-label="Timeline and context"
          className="min-w-0 space-y-4 rounded-xl border border-border bg-muted/40 p-4 text-foreground xl:sticky xl:top-24 xl:self-start xl:p-5"
        >
          {timelineAside}
        </aside>
      </div>
    </div>
  );
}

// --- Setup / checklist ---

export type SetupChecklistPageShellProps = {
  className?: string;
  readiness?: ReactNode;
  blockers?: ReactNode;
  actions?: ReactNode;
  checklist?: ReactNode;
  evidence?: ReactNode;
  children?: ReactNode;
};

export function SetupChecklistPageShell({
  className,
  readiness,
  blockers,
  actions,
  checklist,
  evidence,
  children,
}: SetupChecklistPageShellProps) {
  const primary = checklist ?? children;
  const structured =
    hasRenderable(readiness) ||
    hasRenderable(blockers) ||
    hasRenderable(actions) ||
    hasRenderable(checklist) ||
    hasRenderable(evidence);

  if (!structured && hasRenderable(children)) {
    return (
      <div className={cn(shellColumn, className)}>
        <section aria-label="Setup checklist and blockers" className="min-w-0 space-y-6">
          {children}
        </section>
      </div>
    );
  }

  return (
    <div className={cn(shellColumn, className)}>
      <ShellSlot aria-label="Readiness">{readiness}</ShellSlot>
      <ShellSlot aria-label="Blockers">{blockers}</ShellSlot>
      <ShellSlot aria-label="Actions">{actions}</ShellSlot>
      <ShellSlot aria-label="Checklist">{primary}</ShellSlot>
      <ShellSlot aria-label="Evidence and references">{evidence}</ShellSlot>
    </div>
  );
}

// --- Approval / queue ---

export type ApprovalQueuePageShellProps = {
  className?: string;
  queueSummary?: ReactNode;
  filters?: ReactNode;
  queueList?: ReactNode;
  detailPane?: ReactNode;
  children?: ReactNode;
};

export function ApprovalQueuePageShell({
  className,
  queueSummary,
  filters,
  queueList,
  detailPane,
  children,
}: ApprovalQueuePageShellProps) {
  const primaryQueue = queueList ?? children;
  const structured =
    hasRenderable(queueSummary) || hasRenderable(filters) || hasRenderable(queueList) || hasRenderable(detailPane);

  if (!structured && hasRenderable(children)) {
    return (
      <div className={cn(shellColumn, className)}>
        <section aria-label="Approval queue" className="min-w-0 space-y-6">
          {children}
        </section>
      </div>
    );
  }

  const splitDetail = hasRenderable(detailPane);

  return (
    <div className={cn(shellColumn, className)}>
      <ShellSlot aria-label="Queue summary">{queueSummary}</ShellSlot>
      <ShellSlot aria-label="Queue filters">{filters}</ShellSlot>
      {splitDetail ? (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
          <section aria-label="Queue list" className="min-w-0 space-y-4">
            {primaryQueue}
          </section>
          <aside aria-label="Detail pane" className="min-w-0 space-y-4">
            {detailPane}
          </aside>
        </div>
      ) : (
        <section aria-label="Queue list" className="min-w-0 space-y-4">
          {primaryQueue}
        </section>
      )}
    </div>
  );
}

// --- Cashier ---

export type CashierWorkflowShellProps = {
  className?: string;
  search?: ReactNode;
  results?: ReactNode;
  selected?: ReactNode;
  collectPanel?: ReactNode;
  receipt?: ReactNode;
  children?: ReactNode;
};

export function CashierWorkflowShell({
  className,
  search,
  results,
  selected,
  collectPanel,
  receipt,
  children,
}: CashierWorkflowShellProps) {
  const structured =
    hasRenderable(search) ||
    hasRenderable(results) ||
    hasRenderable(selected) ||
    hasRenderable(collectPanel) ||
    hasRenderable(receipt);

  if (!structured && hasRenderable(children)) {
    return (
      <div className={cn(shellColumn, "pb-24 sm:pb-6", className)}>
        <section aria-label="Cashier collection workflow" className="min-w-0 space-y-6">
          {children}
        </section>
      </div>
    );
  }

  return (
    <div className={cn(shellColumn, "pb-24 sm:pb-6", className)}>
      <ShellSlot aria-label="Search">{search}</ShellSlot>
      <ShellSlot aria-label="Results">{results}</ShellSlot>
      <ShellSlot aria-label="Selected item">{selected}</ShellSlot>
      <ShellSlot
        aria-label="Collect"
        className="rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5 lg:sticky lg:bottom-6 lg:z-10"
      >
        {collectPanel}
      </ShellSlot>
      <ShellSlot aria-label="Receipt and outcome">{receipt}</ShellSlot>
      {hasRenderable(children) ? <div className="min-w-0 space-y-6">{children}</div> : null}
    </div>
  );
}

// --- Accounting control ---

export type AccountingControlShellProps = {
  className?: string;
  readinessWarnings?: ReactNode;
  primaryRegister?: ReactNode;
  controlPanel?: ReactNode;
  drawers?: ReactNode;
  children?: ReactNode;
};

export function AccountingControlShell({
  className,
  readinessWarnings,
  primaryRegister,
  controlPanel,
  drawers,
  children,
}: AccountingControlShellProps) {
  const primary = primaryRegister ?? children;
  const structured =
    hasRenderable(readinessWarnings) ||
    hasRenderable(primaryRegister) ||
    hasRenderable(controlPanel) ||
    hasRenderable(drawers);

  if (!structured && hasRenderable(children)) {
    return (
      <div className={cn(shellColumn, className)}>
        <section aria-label="Accounting controls" className="min-w-0 space-y-6">
          {children}
        </section>
      </div>
    );
  }

  const splitControl = hasRenderable(controlPanel);

  return (
    <div className={cn(shellColumn, className)}>
      <ShellSlot aria-label="Readiness and warnings">{readinessWarnings}</ShellSlot>
      {splitControl ? (
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(14rem,24rem)] xl:items-start">
          <section aria-label="Primary register" className="min-w-0 space-y-4">
            {primary}
          </section>
          <aside aria-label="Control panel" className="min-w-0 space-y-4">
            {controlPanel}
          </aside>
        </div>
      ) : (
        <section aria-label="Primary register" className="min-w-0 space-y-4">
          {primary}
        </section>
      )}
      <ShellSlot aria-label="Drawers and auxiliary">{drawers}</ShellSlot>
    </div>
  );
}

// --- Reports / analytics ---

export type ReportPageShellProps = {
  className?: string;
  filters?: ReactNode;
  summary?: ReactNode;
  chartTable?: ReactNode;
  exports?: ReactNode;
  notes?: ReactNode;
  children?: ReactNode;
};

export function ReportPageShell({ className, filters, summary, chartTable, exports, notes, children }: ReportPageShellProps) {
  const body = chartTable ?? children;
  const structured =
    hasRenderable(filters) || hasRenderable(summary) || hasRenderable(chartTable) || hasRenderable(exports) || hasRenderable(notes);

  if (!structured && hasRenderable(children)) {
    return (
      <div className={cn(shellColumn, className)}>
        <section aria-label="Report surface" className="min-w-0 space-y-6">
          {children}
        </section>
      </div>
    );
  }

  return (
    <div className={cn(shellColumn, className)}>
      <ShellSlot aria-label="Report filters">{filters}</ShellSlot>
      <ShellSlot aria-label="Report summary">{summary}</ShellSlot>
      <ShellSlot aria-label="Charts and tables">{body}</ShellSlot>
      <ShellSlot aria-label="Exports">{exports}</ShellSlot>
      <ShellSlot aria-label="Notes and caveats">{notes}</ShellSlot>
    </div>
  );
}

// --- Customer self-service ---

export type SelfServicePageShellProps = {
  className?: string;
  glance?: ReactNode;
  actions?: ReactNode;
  records?: ReactNode;
  support?: ReactNode;
  children?: ReactNode;
};

export function SelfServicePageShell({ className, glance, actions, records, support, children }: SelfServicePageShellProps) {
  const structured = hasRenderable(glance) || hasRenderable(actions) || hasRenderable(records) || hasRenderable(support);

  if (!structured && hasRenderable(children)) {
    return (
      <div className={cn(shellColumn, className)}>
        <section aria-label="Customer self-service" className="min-w-0 space-y-6">
          {children}
        </section>
      </div>
    );
  }

  const splitRecords = hasRenderable(records) && hasRenderable(support);

  return (
    <div className={cn(shellColumn, className)}>
      <ShellSlot aria-label="At a glance">{glance}</ShellSlot>
      <ShellSlot aria-label="Actions">{actions}</ShellSlot>
      {splitRecords ? (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
          <ShellSlot aria-label="Your records">{records}</ShellSlot>
          <ShellSlot as="aside" aria-label="Support and secondary">
            {support}
          </ShellSlot>
        </div>
      ) : (
        <>
          <ShellSlot aria-label="Your records">{records}</ShellSlot>
          <ShellSlot as="aside" aria-label="Support and secondary">
            {support}
          </ShellSlot>
        </>
      )}
      {hasRenderable(children) ? <div className="min-w-0 space-y-6">{children}</div> : null}
    </div>
  );
}

// --- Partner / vendor workspace ---

export type PartnerVendorWorkspaceShellProps = {
  className?: string;
  posture?: ReactNode;
  queues?: ReactNode;
  ledger?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
};

export function PartnerVendorWorkspaceShell({
  className,
  posture,
  queues,
  ledger,
  actions,
  children,
}: PartnerVendorWorkspaceShellProps) {
  const structured =
    hasRenderable(posture) || hasRenderable(queues) || hasRenderable(ledger) || hasRenderable(actions);

  if (!structured && hasRenderable(children)) {
    return (
      <div className={cn(shellColumn, className)}>
        <section aria-label="Partner or vendor workspace" className="min-w-0 space-y-6">
          {children}
        </section>
      </div>
    );
  }

  const splitLedger = hasRenderable(ledger) && hasRenderable(actions);

  return (
    <div className={cn(shellColumn, className)}>
      <ShellSlot aria-label="Scoped posture">{posture}</ShellSlot>
      <ShellSlot aria-label="Queues">{queues}</ShellSlot>
      {splitLedger ? (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
          <ShellSlot aria-label="Ledger and actions">{ledger}</ShellSlot>
          <ShellSlot as="aside" aria-label="Workspace actions">
            {actions}
          </ShellSlot>
        </div>
      ) : (
        <>
          <ShellSlot aria-label="Ledger and actions">{ledger}</ShellSlot>
          <ShellSlot as="aside" aria-label="Workspace actions">
            {actions}
          </ShellSlot>
        </>
      )}
      {hasRenderable(children) ? <div className="min-w-0 space-y-6">{children}</div> : null}
    </div>
  );
}

// --- Admin operations workspace ---

export type OperationsWorkspaceShellProps = {
  className?: string;
  exceptions?: ReactNode;
  lanes?: ReactNode;
  operationalActions?: ReactNode;
  children?: ReactNode;
};

export function OperationsWorkspaceShell({
  className,
  exceptions,
  lanes,
  operationalActions,
  children,
}: OperationsWorkspaceShellProps) {
  const structured = hasRenderable(exceptions) || hasRenderable(lanes) || hasRenderable(operationalActions);

  if (!structured && hasRenderable(children)) {
    return (
      <div className={cn(shellColumn, className)}>
        <section aria-label="Operations workspace" className="min-w-0 space-y-6">
          {children}
        </section>
      </div>
    );
  }

  return (
    <div className={cn(shellColumn, className)}>
      <ShellSlot aria-label="Exceptions">{exceptions}</ShellSlot>
      <ShellSlot aria-label="Work lanes">{lanes}</ShellSlot>
      <ShellSlot aria-label="Operational actions">{operationalActions}</ShellSlot>
      {hasRenderable(children) ? <div className="min-w-0 space-y-6">{children}</div> : null}
    </div>
  );
}

// --- Executive dashboard (role home) ---

export type ExecutiveDashboardShellProps = {
  className?: string;
  posture?: ReactNode;
  alerts?: ReactNode;
  queues?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
};

export function ExecutiveDashboardShell({ className, posture, alerts, queues, actions, children }: ExecutiveDashboardShellProps) {
  const structured = hasRenderable(posture) || hasRenderable(alerts) || hasRenderable(queues) || hasRenderable(actions);

  if (!structured && hasRenderable(children)) {
    return (
      <section aria-label="Executive dashboard" className={cn("min-w-0 space-y-8 text-foreground [&_*]:min-w-0 [&_*]:max-w-full", className)}>
        {children}
      </section>
    );
  }

  return (
    <div role="region" aria-label="Executive dashboard" className={cn("min-w-0 space-y-8 text-foreground [&_*]:min-w-0 [&_*]:max-w-full", className)}>
      <ShellSlot aria-label="Posture">{posture}</ShellSlot>
      <ShellSlot aria-label="Alerts">{alerts}</ShellSlot>
      <ShellSlot aria-label="Work queues">{queues}</ShellSlot>
      <ShellSlot aria-label="Actions">{actions}</ShellSlot>
      {hasRenderable(children) ? <div className="min-w-0 space-y-8">{children}</div> : null}
    </div>
  );
}

// --- Public marketing ---

export type PublicMarketingShellProps = {
  className?: string;
  hero?: ReactNode;
  trust?: ReactNode;
  sections?: ReactNode;
  cta?: ReactNode;
  children?: ReactNode;
};

export function PublicMarketingShell({ className, hero, trust, sections, cta, children }: PublicMarketingShellProps) {
  const structured = hasRenderable(hero) || hasRenderable(trust) || hasRenderable(sections) || hasRenderable(cta);

  if (!structured && hasRenderable(children)) {
    return <main className={cn("min-w-0 text-foreground [&_*]:min-w-0 [&_*]:max-w-full", className)}>{children}</main>;
  }

  return (
    <main className={cn("flex min-w-0 flex-col gap-8 text-foreground [&_*]:min-w-0 [&_*]:max-w-full", className)}>
      <ShellSlot aria-label="Hero">{hero}</ShellSlot>
      <ShellSlot aria-label="Trust and proof">{trust}</ShellSlot>
      <ShellSlot aria-label="Content sections">{sections}</ShellSlot>
      <ShellSlot aria-label="Call to action">{cta}</ShellSlot>
      {hasRenderable(children) ? <div className="min-w-0 space-y-8">{children}</div> : null}
    </main>
  );
}
