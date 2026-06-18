/**
 * Phase 9D — Contract Activation Readiness Panel (read-only).
 *
 * Surfaces the backend readiness categories for a subscription so operators
 * can understand why a contract is or is not ready for activation/delivery.
 *
 * Hard restrictions:
 * - This panel is READ-ONLY. No payment, receipt, journal, stock movement, or
 *   reconciliation record is created from this panel.
 * - Accounting bridge status is always labelled advisory here.
 * - Activation and handover blockers are displayed separately.
 * - "Ready" is shown only when the backend says ready.
 * - "Blocked" is shown only from real blockers.
 * - "Not evaluated" is shown when backend data is absent.
 */

type BlockerRow = {
  code: string;
  category: string;
  severity: "HIGH" | "MEDIUM" | "LOW" | string;
  message: string;
  action_hint?: string;
};

type ReadinessCategory = {
  required: boolean;
  ready: boolean | null;
  advisory: boolean;
  blocker_codes: string[];
  details: Record<string, unknown>;
};

export type ActivationReadiness = {
  readiness_status: "READY" | "BLOCKED" | string;
  can_activate: boolean;
  can_deliver: boolean;
  activation_blockers: BlockerRow[];
  handover_blockers: BlockerRow[];
  readiness_categories: Record<string, ReadinessCategory>;
  advisory_warnings: string[];
  plan_notes: string[];
  is_direct_sale: boolean;
  plan_type: string;
  kyc_verified: boolean;
  kyc_gating_enabled: boolean;
  read_only_notice: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  kyc_profile: "KYC / Profile",
  contract_data: "Contract Data",
  emi_schedule: "EMI Schedule",
  payment_deposit: "Deposit / Payment",
  delivery: "Delivery",
  inventory_stock: "Stock",
  accounting_bridge: "Accounting Bridge",
};

// Static spec copy — must appear verbatim for frontend guard tests:
// "Deposit readiness is separate from monthly demand readiness"
// "Winner waiver means future EMI waiver only"
// "Rent/Lease has no Lucky ID requirement"
// "Accounting bridge status is advisory here"
const SPEC_COPY = {
  depositMonthlyDemand: "Deposit readiness is separate from monthly demand readiness.",
  winnerWaiver: "Winner waiver means future EMI waiver only — past paid EMIs are not reversed.",
  rentLeaseNoLuckyId: "Rent/Lease has no Lucky ID requirement.",
  accountingAdvisory: "Accounting bridge status is advisory here.",
} as const;

const CATEGORY_ORDER = [
  "kyc_profile",
  "contract_data",
  "emi_schedule",
  "payment_deposit",
  "delivery",
  "inventory_stock",
  "accounting_bridge",
];

function severityClass(severity: string): string {
  if (severity === "HIGH") return "text-red-700 bg-red-50 border-red-200";
  if (severity === "MEDIUM") return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-muted-foreground bg-muted border-border";
}

function CategoryStatusBadge({ category }: { category: ReadinessCategory }) {
  if (category.advisory) {
    return (
      <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">
        Advisory
      </span>
    );
  }
  if (!category.required) {
    return (
      <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
        Not applicable
      </span>
    );
  }
  if (category.ready === null) {
    return (
      <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
        Not evaluated
      </span>
    );
  }
  if (category.ready) {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
        Ready
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
      Blocked
    </span>
  );
}

function BlockerCard({ blocker }: { blocker: BlockerRow }) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${severityClass(blocker.severity)}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="font-mono text-xs font-semibold">{blocker.code}</span>
          <span className="mx-2 text-muted-foreground">·</span>
          <span className="text-xs font-medium uppercase tracking-wide">{blocker.category}</span>
        </div>
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
            blocker.severity === "HIGH"
              ? "bg-red-100 text-red-700"
              : blocker.severity === "MEDIUM"
              ? "bg-amber-100 text-amber-700"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {blocker.severity}
        </span>
      </div>
      <p className="mt-1 text-sm">{blocker.message}</p>
      {blocker.action_hint ? (
        <p className="mt-1 text-xs italic text-muted-foreground">{blocker.action_hint}</p>
      ) : null}
    </div>
  );
}

type Props = {
  readiness: ActivationReadiness | null | undefined;
};

export function ContractActivationReadinessPanel({ readiness }: Props) {
  if (!readiness) {
    return (
      <div className="rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
        Contract readiness is not evaluated. Not evaluated — readiness data is absent for this subscription.
      </div>
    );
  }

  const isReady = readiness.readiness_status === "READY";
  const categories = readiness.readiness_categories ?? {};
  const activationBlockers = readiness.activation_blockers ?? [];
  const handoverBlockers = readiness.handover_blockers ?? [];

  return (
    <div className="space-y-5" data-testid="contract-activation-readiness-panel">
      {/* Disclaimer */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
        <p className="font-semibold">Read-only readiness evaluation</p>
        <p className="mt-1 text-xs">
          No payment, receipt, journal, stock movement, or reconciliation record is created
          from this panel.
        </p>
      </div>

      {/* Overall status */}
      <div
        className={`rounded-xl border px-4 py-3 ${
          isReady
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-red-200 bg-red-50 text-red-900"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">
              Activation readiness
            </p>
            <p className="mt-1 text-base font-semibold">
              {isReady ? "Ready for activation" : "Blocked — activation blockers present"}
            </p>
          </div>
          <span
            className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${
              isReady
                ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                : "border-red-300 bg-red-100 text-red-800"
            }`}
          >
            {isReady ? "READY" : "BLOCKED"}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs">
          <span>
            Can activate:{" "}
            <strong>{readiness.can_activate ? "Yes" : "No"}</strong>
          </span>
          <span>
            Can deliver/handover:{" "}
            <strong>{readiness.can_deliver ? "Yes" : "No"}</strong>
          </span>
          {readiness.kyc_verified !== undefined && (
            <span>
              KYC verified:{" "}
              <strong>{readiness.kyc_verified ? "Yes" : "No"}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Plan-type specific notes */}
      {readiness.plan_notes && readiness.plan_notes.length > 0 ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800">
            Plan-type rules
          </p>
          <ul className="mt-2 space-y-1">
            {readiness.plan_notes.map((note) => (
              <li key={note} className="text-xs text-sky-900">
                {note}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Spec-required static copy for Rent/Lease and EMI plan types */}
      {(readiness.plan_type === "RENT" || readiness.plan_type === "LEASE") ? (
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
          <p>{SPEC_COPY.rentLeaseNoLuckyId}</p>
          <p>{SPEC_COPY.depositMonthlyDemand}</p>
        </div>
      ) : null}
      {readiness.plan_type === "EMI" ? (
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          <p>{SPEC_COPY.winnerWaiver}</p>
        </div>
      ) : null}

      {/* Readiness categories grid */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Readiness categories
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {CATEGORY_ORDER.map((key) => {
            const cat = categories[key];
            if (!cat) return null;
            const label = CATEGORY_LABELS[key] ?? key;
            return (
              <div
                key={key}
                className="flex flex-col gap-1 rounded-xl border border-border bg-background px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">{label}</span>
                  <CategoryStatusBadge category={cat} />
                </div>
                {cat.advisory ? (
                  <p className="text-[10px] text-sky-700">
                    Accounting bridge status is advisory here — Accounting &amp; Reconciliation owns
                    posting evidence.
                  </p>
                ) : null}
                {!cat.advisory && cat.blocker_codes.length > 0 ? (
                  <p className="text-[10px] text-red-600">
                    {cat.blocker_codes.length} blocker
                    {cat.blocker_codes.length > 1 ? "s" : ""}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Activation blockers */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Activation blockers
        </p>
        {activationBlockers.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            No activation blockers.
          </div>
        ) : (
          <div className="space-y-2">
            {activationBlockers.map((blocker) => (
              <BlockerCard key={`activation-${blocker.code}`} blocker={blocker} />
            ))}
          </div>
        )}
      </div>

      {/* Handover blockers */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Handover blockers
        </p>
        {handoverBlockers.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            No handover blockers.
          </div>
        ) : (
          <div className="space-y-2">
            {handoverBlockers.map((blocker) => (
              <BlockerCard key={`handover-${blocker.code}`} blocker={blocker} />
            ))}
          </div>
        )}
      </div>

      {/* Advisory warnings */}
      {readiness.advisory_warnings && readiness.advisory_warnings.length > 0 ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800">
            Advisory — Accounting &amp; Reconciliation owns posting evidence
          </p>
          <ul className="mt-2 space-y-1">
            {readiness.advisory_warnings.map((warning) => (
              <li key={warning} className="text-xs text-sky-900">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Read-only footer */}
      <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        {readiness.read_only_notice ?? (
          "Read-only readiness evaluation. No payment, receipt, journal, stock movement, or reconciliation record is created from this panel."
        )}
      </div>
    </div>
  );
}
