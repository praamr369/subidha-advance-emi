/**
 * Phase 9E — Readiness-Gated Action Banner (read-only).
 *
 * Compact status banner placed near subscription activation, delivery, and
 * handover action areas. Surfaces the first relevant blocker so operators
 * understand why an action area is gated before clicking through.
 *
 * Hard restrictions:
 * - Read-only. No payment, receipt, journal, stock movement, or reconciliation
 *   record is created from this component.
 * - "Ready" is only shown when the backend reports ready.
 * - "Blocked" is only shown from real backend blockers.
 * - "Readiness not evaluated" is shown when backend data is absent.
 * - Backend readiness check remains authoritative.
 * - Safe labels only — no lifecycle shortcut or circumvention labels present.
 */

import type { ActivationReadiness } from "@/components/subscriptions/ContractActivationReadinessPanel";

type Props = {
  readiness: ActivationReadiness | null | undefined;
  stage: "activation" | "handover";
};

const STAGE_CONFIG = {
  activation: {
    gateLabel: "Activation gate",
    blockersLabel: "Activation blockers",
    blockerKey: "activation_blockers" as const,
    canKey: "can_activate" as const,
  },
  handover: {
    gateLabel: "Handover gate",
    blockersLabel: "Handover blockers",
    blockerKey: "handover_blockers" as const,
    canKey: "can_deliver" as const,
  },
} as const;

export function ReadinessGatedActionBanner({ readiness, stage }: Props) {
  const cfg = STAGE_CONFIG[stage];

  if (!readiness) {
    return (
      <div
        data-testid={`readiness-gate-${stage}`}
        className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
      >
        <p className="font-medium">Readiness not evaluated</p>
        <p className="mt-1 text-xs">
          Contract readiness is evaluated on subscription detail. Backend readiness check remains
          authoritative. No payment, receipt, journal, stock movement, or reconciliation record
          is created from this action area.
        </p>
      </div>
    );
  }

  const canAct: boolean = Boolean(readiness[cfg.canKey]);
  const blockers = readiness[cfg.blockerKey] ?? [];
  const firstBlocker = blockers[0] ?? null;

  if (canAct) {
    return (
      <div
        data-testid={`readiness-gate-${stage}`}
        className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
      >
        <span className="font-semibold">{cfg.gateLabel}: Ready</span>
        <span className="mx-2 opacity-50">·</span>
        <span className="text-xs">Backend readiness check remains authoritative</span>
      </div>
    );
  }

  return (
    <div
      data-testid={`readiness-gate-${stage}`}
      className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="font-semibold">{cfg.blockersLabel}</span>
          <span className="mx-2 opacity-40">·</span>
          <span className="text-xs font-medium">Blocked by readiness</span>
        </div>
        <span className="inline-flex rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
          BLOCKED
        </span>
      </div>

      {firstBlocker ? (
        <p className="mt-1.5 text-sm">
          <span className="font-mono text-xs font-semibold">{firstBlocker.code}</span>
          {" — "}
          {firstBlocker.message}
        </p>
      ) : null}

      {blockers.length > 1 ? (
        <p className="mt-1 text-xs text-amber-700">
          +{blockers.length - 1} additional blocker
          {blockers.length > 2 ? "s" : ""} — view readiness details below.
        </p>
      ) : null}

      <p className="mt-1.5 text-xs text-amber-700">
        View readiness details in the Contract Activation Readiness panel below.
        {" "}Backend readiness check remains authoritative.
        {" "}No payment, receipt, journal, stock movement, or reconciliation record is created
        from this action area.
      </p>
    </div>
  );
}
