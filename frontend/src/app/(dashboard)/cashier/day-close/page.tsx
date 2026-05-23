"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import {
  ERPEmptyState,
  ERPErrorState,
  ERPLoadingState,
  ERPPageShell,
  ERPSectionShell,
  ERPStatusBadge,
} from "@/components/erp";
import { ApiError } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import {
  createCashierDayClose,
  getCashierCurrentDayClose,
  previewCashierDayClose,
  submitCashierDayClose,
} from "@/services/settlements";
import type { CashierDayClose } from "@/types/settlements";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function localBusinessDate(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function formatError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.readableMessage || fallback;
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

export default function CashierDayClosePage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const businessDate = useMemo(() => localBusinessDate(), []);
  const [systemCashTotal, setSystemCashTotal] = useState<string>("0.00");
  const [record, setRecord] = useState<CashierDayClose | null>(null);

  const [countedCash, setCountedCash] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const variancePreview = useMemo(() => {
    const counted = Number(countedCash || 0);
    const system = Number(systemCashTotal || 0);
    return (counted - system).toFixed(2);
  }, [countedCash, systemCashTotal]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const preview = await previewCashierDayClose({ business_date: businessDate });
      setSystemCashTotal(preview.system_cash_total || "0.00");
    } catch (err) {
      setSystemCashTotal("0.00");
      setError(formatError(err, "Failed to load day-close context."));
    }

    try {
      const current = await getCashierCurrentDayClose();
      setRecord(current);
      setCountedCash(current.counted_cash || "");
      setNotes(current.notes || "");
    } catch (err) {
      const status = err instanceof ApiError ? err.status : null;
      if (status && status !== 404) {
        setError(formatError(err, "Failed to load current day-close."));
      }
      setRecord(null);
      setCountedCash("");
      setNotes("");
    } finally {
      setLoading(false);
    }
  }, [businessDate]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    try {
      const created = await createCashierDayClose({
        business_date: businessDate,
        counted_cash: countedCash,
        notes,
      });
      setRecord(created);
      setError(null);
    } catch (err) {
      setError(formatError(err, "Failed to create day-close draft."));
    } finally {
      setCreating(false);
    }
  }

  async function handleSubmit() {
    if (!record) return;
    setSubmitting(true);
    try {
      const updated = await submitCashierDayClose(record.id);
      setRecord(updated);
      setError(null);
    } catch (err) {
      setError(formatError(err, "Failed to submit day-close."));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <ERPPageShell
        title="Day Close"
        subtitle="Cash evidence capture for your business day close."
        breadcrumbs={[
          { label: "Cashier", href: ROUTES.cashier.dashboard },
          { label: "Day Close" },
        ]}
        headerMode="erp"
      >
        <ERPLoadingState label="Loading day-close…" />
      </ERPPageShell>
    );
  }

  if (error) {
    return (
      <ERPPageShell
        title="Day Close"
        subtitle="Cash evidence capture for your business day close."
        breadcrumbs={[
          { label: "Cashier", href: ROUTES.cashier.dashboard },
          { label: "Day Close" },
        ]}
        headerMode="erp"
      >
        <ERPErrorState message={error} onRetry={() => void load()} />
      </ERPPageShell>
    );
  }

  const isLocked = record ? ["SUBMITTED", "APPROVED", "REJECTED", "VOIDED"].includes(record.status) : false;
  const canSubmit = record?.status === "DRAFT";

  return (
    <ERPPageShell
      title="Day Close"
      subtitle="Evidence capture only. Submitting does not post accounting or modify any payment/receipt records."
      helperNote="Variance is captured as evidence only. It does not auto-adjust anything. Approved/rejected records cannot be edited."
      helperTone="warning"
      breadcrumbs={[
        { label: "Cashier", href: ROUTES.cashier.dashboard },
        { label: "Day Close" },
      ]}
      headerMode="erp"
      actions={
        record
          ? [
              {
                href: `${ROUTES.cashier.dayClose}/${record.id}`,
                label: "Open record",
                variant: "secondary",
              },
            ]
          : undefined
      }
      statusBadge={record ? { label: record.status, tone: record.status === "DRAFT" ? "info" : "warning" } : undefined}
    >
      <ERPSectionShell title="Business day" description="Today’s cash position (system) vs counted cash (evidence).">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Business date
            </div>
            <div className="mt-2 text-sm font-semibold text-foreground">{businessDate}</div>
          </div>
          <div className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              System cash total
            </div>
            <div className="mt-2 text-sm font-semibold text-foreground">{money(record?.system_cash_total ?? systemCashTotal)}</div>
            <div className="mt-1 text-xs text-muted-foreground">Cash payments collected by you (CASH method) for the date.</div>
          </div>
          <div className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Variance (preview)
            </div>
            <div className="mt-2 text-sm font-semibold text-foreground">{money(record?.variance ?? variancePreview)}</div>
          </div>
        </div>
      </ERPSectionShell>

      <ERPSectionShell
        title={record ? "Day-close record" : "Create draft"}
        description="Enter the counted cash. Create a draft, then submit it for admin review."
      >
        {record ? (
          <div className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-foreground">
                  {record.close_no} · {record.business_date}
                </div>
                <div className="text-xs text-muted-foreground">
                  Status <ERPStatusBadge status={record.status} hideIcon />
                </div>
              </div>
              {canSubmit ? (
                <button
                  type="button"
                  className="rounded-xl border border-border bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  onClick={() => void handleSubmit()}
                  disabled={submitting}
                >
                  {submitting ? "Submitting…" : "Submit for review"}
                </button>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border/70 bg-[var(--surface-muted)] p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Counted cash</div>
                <div className="mt-2 text-sm font-semibold text-foreground">{money(record.counted_cash)}</div>
              </div>
              <div className="rounded-xl border border-border/70 bg-[var(--surface-muted)] p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Notes</div>
                <div className="mt-2 text-sm text-foreground whitespace-pre-wrap">{record.notes?.trim() ? record.notes : "—"}</div>
              </div>
            </div>

            {isLocked ? (
              <div className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900">
                Approved/rejected/submitted records cannot be edited. This workflow captures evidence only and does not post accounting.
              </div>
            ) : null}
          </div>
        ) : (
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <div className="text-sm font-semibold text-foreground">Counted cash</div>
                <input
                  className="mt-1 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2 text-sm text-foreground shadow-[inset_0_1px_0_var(--hairline-shine)]"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={countedCash}
                  onChange={(e) => setCountedCash(e.target.value)}
                  required
                />
              </label>
              <label className="block">
                <div className="text-sm font-semibold text-foreground">Notes (optional)</div>
                <input
                  className="mt-1 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2 text-sm text-foreground shadow-[inset_0_1px_0_var(--hairline-shine)]"
                  placeholder="Count notes / variance reason"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>

            <div className="rounded-xl border border-border/70 bg-[var(--surface-muted)] p-3 text-sm text-muted-foreground">
              Submitting does not post accounting. Variance is stored as evidence only. No payment record is modified.
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="rounded-xl border border-border bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                disabled={creating}
              >
                {creating ? "Creating…" : "Create draft"}
              </button>
              <Link
                href={ROUTES.cashier.dashboard}
                className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 py-2 text-sm font-semibold text-foreground hover:bg-[var(--surface-muted)]"
              >
                Back to dashboard
              </Link>
            </div>
          </form>
        )}

        {!record ? (
          <ERPEmptyState
            title="No day-close record yet"
            description="Create a draft for today, then submit it for admin review."
          />
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
