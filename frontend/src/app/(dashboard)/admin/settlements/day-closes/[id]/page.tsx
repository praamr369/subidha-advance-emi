"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  ERPErrorState,
  ERPLoadingState,
  ERPPageShell,
  ERPSectionShell,
  ERPStatusBadge,
} from "@/components/erp";
import { ApiError } from "@/lib/api";
import { buildAdminCashierDayClosePrintRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import {
  approveAdminCashierDayClose,
  getAdminCashierDayClose,
  rejectAdminCashierDayClose,
} from "@/services/settlements";
import type { CashierDayClose } from "@/types/settlements";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.readableMessage || fallback;
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

export default function AdminDayCloseDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<CashierDayClose | null>(null);
  const [decisionNote, setDecisionNote] = useState<string>("");

  const canDecide = useMemo(() => record?.status === "SUBMITTED", [record?.status]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const row = await getAdminCashierDayClose(id);
      setRecord(row);
      setDecisionNote("");
      setError(null);
    } catch (err) {
      setError(formatError(err, "Failed to load day-close record."));
      setRecord(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleApprove() {
    if (!id) return;
    setWorking(true);
    try {
      const updated = await approveAdminCashierDayClose(id, decisionNote.trim() ? { notes: decisionNote.trim() } : {});
      setRecord(updated);
      setError(null);
    } catch (err) {
      setError(formatError(err, "Failed to approve day-close."));
    } finally {
      setWorking(false);
    }
  }

  async function handleReject() {
    if (!id) return;
    const note = decisionNote.trim();
    if (!note) {
      setError("Rejection note is required.");
      return;
    }
    setWorking(true);
    try {
      const updated = await rejectAdminCashierDayClose(id, { notes: note });
      setRecord(updated);
      setError(null);
    } catch (err) {
      setError(formatError(err, "Failed to reject day-close."));
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <ERPPageShell
        title="Day-close review"
        breadcrumbs={[
          { label: "Admin", href: ROUTES.admin.dashboard },
          { label: "Settlements", href: ROUTES.admin.settlements },
          { label: "Day-closes", href: ROUTES.admin.settlementsDayCloses },
          { label: String(id || "…") },
        ]}
        headerMode="erp"
      >
        <ERPLoadingState label="Loading record…" />
      </ERPPageShell>
    );
  }

  if (error && !record) {
    return (
      <ERPPageShell
        title="Day-close review"
        breadcrumbs={[
          { label: "Admin", href: ROUTES.admin.dashboard },
          { label: "Settlements", href: ROUTES.admin.settlements },
          { label: "Day-closes", href: ROUTES.admin.settlementsDayCloses },
          { label: String(id || "…") },
        ]}
        headerMode="erp"
      >
        <ERPErrorState message={error} onRetry={() => void load()} />
      </ERPPageShell>
    );
  }

  if (!record) {
    return (
      <ERPPageShell
        title="Day-close review"
        breadcrumbs={[
          { label: "Admin", href: ROUTES.admin.dashboard },
          { label: "Settlements", href: ROUTES.admin.settlements },
          { label: "Day-closes", href: ROUTES.admin.settlementsDayCloses },
        ]}
        headerMode="erp"
      >
        <ERPErrorState message="Record not found." onRetry={() => void router.push(ROUTES.admin.settlementsDayCloses)} />
      </ERPPageShell>
    );
  }

  return (
    <ERPPageShell
      title={`Day-close · ${record.close_no}`}
      subtitle="Review cash evidence only. No accounting entry is created and no payment record is modified."
      helperNote="Approval/rejection changes only the day-close record status and notes. No allocations, reconciliation items, or accounting postings are created."
      helperTone="warning"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Settlements", href: ROUTES.admin.settlements },
        { label: "Day-closes", href: ROUTES.admin.settlementsDayCloses },
        { label: record.close_no },
      ]}
      headerMode="erp"
      statusBadge={{ label: record.status, tone: record.status === "SUBMITTED" ? "warning" : "info" }}
      actions={[
        { href: ROUTES.admin.settlementsDayCloses, label: "Back", variant: "secondary" },
        { href: buildAdminCashierDayClosePrintRoute(record.id), label: "Day Close Report PDF / Print", variant: "secondary" },
      ]}
    >
      <ERPSectionShell title="Record details" description="Cashier evidence snapshot and variance for the business date.">
        {error ? (
          <div className="mb-3 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Cashier</div>
            <div className="mt-2 text-sm font-semibold text-foreground">{record.cashier_username || `User #${record.cashier}`}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Branch {record.branch_name || "—"} · Counter {record.cash_counter_name || "—"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Finance account {record.finance_account_name || "—"}
            </div>
          </div>
          <div className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Business date</div>
            <div className="mt-2 text-sm font-semibold text-foreground">{record.business_date}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              Status <ERPStatusBadge status={record.status} hideIcon />
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">System cash total</div>
            <div className="mt-2 text-sm font-semibold text-foreground">{money(record.system_cash_total)}</div>
          </div>
          <div className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Counted cash</div>
            <div className="mt-2 text-sm font-semibold text-foreground">{money(record.counted_cash)}</div>
          </div>
          <div className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Variance</div>
            <div className="mt-2 text-sm font-semibold text-foreground">{money(record.variance)}</div>
          </div>
        </div>

        <div className="mt-3 rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Notes</div>
          <div className="mt-2 text-sm text-foreground whitespace-pre-wrap">{record.notes?.trim() ? record.notes : "—"}</div>
        </div>
      </ERPSectionShell>

      <ERPSectionShell title="Decision" description="Approve or reject SUBMITTED records only. Rejection requires a note.">
        {!canDecide ? (
          <div className="rounded-xl border border-border/70 bg-[var(--surface-muted)] p-3 text-sm text-muted-foreground">
            This record is <span className="font-semibold">{record.status}</span>. Only <span className="font-semibold">SUBMITTED</span> records can be approved/rejected.
          </div>
        ) : null}

        <label className="block">
          <div className="text-sm font-semibold text-foreground">Decision note</div>
          <textarea
            className="mt-1 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2 text-sm text-foreground shadow-[inset_0_1px_0_var(--hairline-shine)]"
            rows={4}
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            placeholder="Required for rejection. Optional for approval."
            disabled={!canDecide || working}
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-xl border border-border bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            disabled={!canDecide || working}
            onClick={() => void handleApprove()}
          >
            {working ? "Working…" : "Approve"}
          </button>
          <button
            type="button"
            className="rounded-xl border border-red-300 bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            disabled={!canDecide || working}
            onClick={() => void handleReject()}
          >
            {working ? "Working…" : "Reject"}
          </button>
          <Link
            href={ROUTES.admin.settlementsDayCloses}
            className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 py-2 text-sm font-semibold text-foreground hover:bg-[var(--surface-muted)]"
          >
            Back to list
          </Link>
        </div>
      </ERPSectionShell>
    </ERPPageShell>
  );
}
