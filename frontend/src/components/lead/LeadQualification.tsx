"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, Clock, Flame, Snowflake, Sun, UserCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import type { LeadQualification } from "@/services/crm-module";

// ---------------------------------------------------------------------------
// Lead-qualification UI: money-free intelligence for a prospect profile.
// Drops into the existing lead detail page — no new routes.
// ---------------------------------------------------------------------------

const BAND_META: Record<LeadQualification["band"], { label: string; className: string; icon: typeof Flame }> = {
  hot: { label: "Hot", className: "border-red-200 bg-red-50 text-red-700", icon: Flame },
  warm: { label: "Warm", className: "border-amber-200 bg-amber-50 text-amber-700", icon: Sun },
  cold: { label: "Cold", className: "border-sky-200 bg-sky-50 text-sky-700", icon: Snowflake },
};

/** Circular-ish score badge with hot/warm/cold band. */
export function LeadScoreBadge({ score, band }: { score: number; band: LeadQualification["band"] }) {
  const meta = BAND_META[band];
  const Icon = meta.icon;
  return (
    <div className={cn("inline-flex items-center gap-3 rounded-xl border px-4 py-3", meta.className)}>
      <div className="flex h-12 w-12 flex-col items-center justify-center rounded-full bg-white/70">
        <span className="text-lg font-bold leading-none">{score}</span>
        <span className="text-[9px] font-medium uppercase opacity-70">/100</span>
      </div>
      <div>
        <div className="flex items-center gap-1 text-sm font-bold">
          <Icon className="h-3.5 w-3.5" /> {meta.label} lead
        </div>
        <div className="text-xs opacity-80">Qualification score</div>
      </div>
    </div>
  );
}

const SLA_META: Record<LeadQualification["sla"]["state"], { label: string; className: string }> = {
  overdue: { label: "Follow-up overdue", className: "border-red-200 bg-red-50 text-red-700" },
  due_soon: { label: "Follow-up due soon", className: "border-amber-200 bg-amber-50 text-amber-700" },
  scheduled: { label: "Follow-up scheduled", className: "border-sky-200 bg-sky-50 text-sky-700" },
  none: { label: "No follow-up set", className: "border-border bg-muted text-muted-foreground" },
};

/** Follow-up SLA chip with a human countdown. */
export function LeadSlaChip({ sla }: { sla: LeadQualification["sla"] }) {
  const meta = SLA_META[sla.state];
  let detail = "";
  if (sla.hours_until != null) {
    const h = sla.hours_until;
    detail = h < 0
      ? `${Math.abs(Math.round(h))}h ago`
      : h < 48
        ? `in ${Math.round(h)}h`
        : `in ${Math.round(h / 24)}d`;
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", meta.className)}>
      <Clock className="h-3.5 w-3.5" />
      {meta.label}
      {detail ? <span className="opacity-80">· {detail}</span> : null}
    </span>
  );
}

/** Converted-lead → customer link. Shows the customer this lead became. */
export function ConvertedCustomerBanner({ customer }: { customer: NonNullable<LeadQualification["converted_customer"]> }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      <CheckCircle2 className="h-4 w-4 shrink-0" />
      <span>
        Converted to customer{" "}
        <span className="font-semibold">{customer.name}</span> ({customer.phone}) · KYC {customer.kyc_status}.
      </span>
      <Link
        href={`/admin/customers/${customer.id}`}
        className="ml-auto inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
      >
        Open customer 360 <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

/** Existing-customer duplicate warning — surfaces the phone match before convert. */
export function DuplicateCustomerBanner({ dup }: { dup: NonNullable<LeadQualification["duplicate_customer"]> }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        A customer with this phone already exists:{" "}
        <span className="font-semibold">{dup.name}</span> ({dup.phone}) · KYC {dup.kyc_status}.
        {dup.is_converted_target ? " This lead is already linked to them." : " Converting should link to this record, not create a duplicate."}
      </span>
      <Link
        href={`/admin/customers/${dup.id}`}
        className="ml-auto inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
      >
        <UserCheck className="h-3.5 w-3.5" /> Open customer
      </Link>
    </div>
  );
}

/** Conversion-readiness checklist that gates the convert action. */
export function LeadReadinessChecklist({ readiness }: { readiness: LeadQualification["readiness"] }) {
  const doneCount = readiness.items.filter((i) => i.done).length;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Conversion readiness</h3>
        <span className={cn(
          "rounded-full px-2.5 py-0.5 text-xs font-semibold",
          readiness.ready ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
        )}>
          {readiness.ready ? "Ready to convert" : `${doneCount}/${readiness.items.length} complete`}
        </span>
      </div>
      <ul className="space-y-2">
        {readiness.items.map((item) => (
          <li key={item.key} className="flex items-center gap-2 text-sm">
            {item.done ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground" />
            )}
            <span className={item.done ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Composed qualification header for the top of the lead profile: score badge,
 * SLA + age chips, duplicate banner, and readiness checklist. Renders nothing
 * if the payload predates the backend upgrade (qualification is optional).
 */
export function LeadQualificationPanel({ qualification }: { qualification?: LeadQualification }) {
  if (!qualification) return null;
  const q = qualification;
  return (
    <div className="space-y-4">
      {q.converted_customer ? <ConvertedCustomerBanner customer={q.converted_customer} /> : null}
      {q.conversion_orphaned ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            This lead is marked <span className="font-semibold">Converted</span> but is not linked to any customer record.
            Use the <span className="font-semibold">Convert</span> action to create and link the customer.
          </span>
        </div>
      ) : null}
      {q.duplicate_customer ? <DuplicateCustomerBanner dup={q.duplicate_customer} /> : null}

      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <div className="flex flex-col gap-3">
          <LeadScoreBadge score={q.score} band={q.band} />
          <div className="flex flex-wrap gap-2">
            <LeadSlaChip sla={q.sla} />
            {q.days_in_stage != null ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                {q.days_in_stage}d in stage
              </span>
            ) : null}
            {q.age_days != null ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                {q.age_days}d old
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
              {q.engagement.task_count} tasks · {q.engagement.opportunity_count} opps
            </span>
          </div>
        </div>

        <LeadReadinessChecklist readiness={q.readiness} />
      </div>
    </div>
  );
}
