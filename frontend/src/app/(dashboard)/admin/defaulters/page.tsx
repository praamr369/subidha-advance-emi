"use client";

import { useCallback, useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import {
  createRecoveryCase,
  listDefaulters,
  listRecoveryCases,
  updateRecoveryCase,
  type DefaulterRow,
  type RecoveryCase,
} from "@/services/gstr-recovery";

type Bucket = "" | "0-30" | "31-60" | "61-90" | "91-120" | "120+";

const BUCKETS: { label: string; value: Bucket; color: string }[] = [
  { label: "All", value: "", color: "bg-gray-100 text-gray-700" },
  { label: "0–30 days", value: "0-30", color: "bg-green-100 text-green-700" },
  { label: "31–60 days", value: "31-60", color: "bg-yellow-100 text-yellow-700" },
  { label: "61–90 days", value: "61-90", color: "bg-orange-100 text-orange-700" },
  { label: "91–120 days", value: "91-120", color: "bg-red-100 text-red-700" },
  { label: "120+ days", value: "120+", color: "bg-red-200 text-red-800" },
];

const STAGES = ["IDENTIFIED", "NOTICE_SENT", "FIELD_VISIT", "LEGAL", "SETTLED", "WRITTEN_OFF"];
const STAGE_LABELS: Record<string, string> = {
  IDENTIFIED: "Identified",
  NOTICE_SENT: "Notice Sent",
  FIELD_VISIT: "Field Visit",
  LEGAL: "Legal",
  SETTLED: "Settled",
  WRITTEN_OFF: "Written Off",
};
const STAGE_COLORS: Record<string, string> = {
  IDENTIFIED: "bg-blue-100 text-blue-700",
  NOTICE_SENT: "bg-yellow-100 text-yellow-700",
  FIELD_VISIT: "bg-orange-100 text-orange-700",
  LEGAL: "bg-red-100 text-red-700",
  SETTLED: "bg-green-100 text-green-700",
  WRITTEN_OFF: "bg-gray-100 text-gray-500",
};

function fmt(v: string | undefined): string {
  if (!v) return "₹0";
  return `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function RecoveryDrawer({
  rc,
  onClose,
  onSaved,
}: {
  rc: RecoveryCase;
  onClose: () => void;
  onSaved: (updated: RecoveryCase) => void;
}) {
  const [stage, setStage] = useState(rc.stage);
  const [notes, setNotes] = useState(rc.notes);
  const [settledAmount, setSettledAmount] = useState(rc.settled_amount ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const payload: Parameters<typeof updateRecoveryCase>[1] = { stage, notes };
      if (stage === "SETTLED" && settledAmount) payload.settled_amount = settledAmount;
      const updated = await updateRecoveryCase(rc.id, payload);
      onSaved(updated);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1" />
      <div
        className="w-full max-w-md bg-background border-l border-border h-full overflow-y-auto p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="font-bold text-base text-foreground">{rc.customer_name}</div>
            <div className="text-xs text-muted-foreground">{rc.customer_phone} · {rc.contract_ref}</div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">×</button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5 text-sm">
          <div className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2">
            <div className="text-xs text-muted-foreground">Overdue Amount</div>
            <div className="font-bold text-red-700">{fmt(rc.overdue_amount)}</div>
          </div>
          <div className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2">
            <div className="text-xs text-muted-foreground">Overdue EMIs</div>
            <div className="font-bold">{rc.overdue_emis}</div>
          </div>
          <div className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2">
            <div className="text-xs text-muted-foreground">First Overdue</div>
            <div className="font-semibold">{rc.first_overdue_date ?? "—"}</div>
          </div>
          <div className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2">
            <div className="text-xs text-muted-foreground">Aging</div>
            <div className="font-bold text-orange-700">{rc.aging_bucket} days</div>
          </div>
        </div>

        {rc.notice_sent_at || rc.field_visit_at || rc.legal_at || rc.settled_at ? (
          <div className="mb-4 space-y-1.5 text-xs text-muted-foreground">
            {rc.notice_sent_at && <div>📬 Notice sent: {new Date(rc.notice_sent_at).toLocaleString("en-IN")}</div>}
            {rc.field_visit_at && <div>🚗 Field visit: {new Date(rc.field_visit_at).toLocaleString("en-IN")}</div>}
            {rc.legal_at && <div>⚖️ Legal: {new Date(rc.legal_at).toLocaleString("en-IN")}</div>}
            {rc.settled_at && (
              <div>
                ✅ Settled: {new Date(rc.settled_at).toLocaleString("en-IN")}
                {rc.settlement_type === "PARTIAL" ? (
                  <span className="ml-1 inline-flex rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs font-medium">Partial</span>
                ) : rc.settlement_type === "FULL" ? (
                  <span className="ml-1 inline-flex rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-medium">Full</span>
                ) : null}
                {rc.settled_amount && Number(rc.settled_amount) > 0 ? ` — ${fmt(rc.settled_amount)}` : ""}
              </div>
            )}
          </div>
        ) : null}

        <div className="mb-4">
          <label className="block text-xs font-semibold text-muted-foreground mb-1">Recovery Stage</label>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>{STAGE_LABELS[s]}</option>
            ))}
          </select>
        </div>

        {stage === "SETTLED" && (() => {
          const overdue = Number(rc.overdue_amount || 0);
          const settled = Number(settledAmount || 0);
          const isPartial = settled > 0 && settled < overdue;
          const isFull = settled > 0 && settled >= overdue;
          const exceedsOverdue = settled > overdue && overdue > 0;
          return (
            <div className="mb-4">
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Settled Amount (₹) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={settledAmount}
                onChange={(e) => setSettledAmount(e.target.value)}
                className={`w-full h-9 rounded-xl border bg-background px-3 text-sm ${
                  exceedsOverdue ? "border-red-400" : "border-border"
                }`}
                placeholder="Amount actually recovered/settled"
              />
              {exceedsOverdue ? (
                <p className="mt-1 text-xs text-red-600">
                  Settled amount exceeds overdue amount ({fmt(rc.overdue_amount)}). This will be rejected.
                </p>
              ) : isPartial ? (
                <p className="mt-1 text-xs text-amber-600">
                  Partial settlement: {fmt(String(settled))} of {fmt(rc.overdue_amount)} ({Math.round((settled / overdue) * 100)}%).
                </p>
              ) : isFull ? (
                <p className="mt-1 text-xs text-green-700">
                  Full settlement: covers the entire overdue amount.
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Enter the actual amount recovered. Overdue: {fmt(rc.overdue_amount)}.
                </p>
              )}
            </div>
          );
        })()}

        <div className="mb-4">
          <label className="block text-xs font-semibold text-muted-foreground mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none"
            placeholder="Recovery notes, contact attempts, commitments…"
          />
        </div>

        {err && <div className="mb-3 text-sm text-red-600 rounded-xl border border-red-200 bg-red-50 px-3 py-2">{err}</div>}

        <button
          onClick={() => void save()}
          disabled={busy}
          className="w-full h-10 rounded-xl border border-primary bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

export default function DefaultersPage() {
  const [bucket, setBucket] = useState<Bucket>("");
  const [tab, setTab] = useState<"defaulters" | "recovery">("defaulters");
  const [defaulters, setDefaulters] = useState<DefaulterRow[]>([]);
  const [bucketSummary, setBucketSummary] = useState<Record<string, number>>({});
  const [cases, setCases] = useState<RecoveryCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<RecoveryCase | null>(null);
  const [stageFilter, setStageFilter] = useState("");
  const [actionBusy, setActionBusy] = useState<number | null>(null);

  const loadDefaulters = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listDefaulters({ bucket: bucket || undefined });
      setDefaulters(data.defaulters);
      setBucketSummary(data.bucket_summary);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [bucket]);

  const loadCases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listRecoveryCases({ stage: stageFilter || undefined });
      setCases(data.results);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [stageFilter]);

  useEffect(() => {
    if (tab === "defaulters") void loadDefaulters();
    else void loadCases();
  }, [tab, loadDefaulters, loadCases]);

  async function handleOpenCase(subId: number) {
    setActionBusy(subId);
    try {
      await createRecoveryCase(subId);
      setTab("recovery");
    } finally {
      setActionBusy(null);
    }
  }

  const bucketColor = (b: string) => {
    if (b === "0-30") return "bg-green-100 text-green-700";
    if (b === "31-60") return "bg-yellow-100 text-yellow-700";
    if (b === "61-90") return "bg-orange-100 text-orange-700";
    if (b === "91-120") return "bg-red-100 text-red-700";
    return "bg-red-200 text-red-800";
  };

  return (
    <ERPPageShell
      title="Defaulter Recovery"
      subtitle="Subscriptions with overdue EMIs, aging buckets, and recovery case management"
    >
      {/* Bucket summary chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {BUCKETS.map((b) => (
          <button
            key={b.value}
            onClick={() => { setBucket(b.value); setTab("defaulters"); }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${bucket === b.value ? "border-primary ring-1 ring-primary" : "border-transparent"} ${b.color}`}
          >
            {b.label}
            {b.value && bucketSummary[b.value] ? ` (${bucketSummary[b.value]})` : ""}
          </button>
        ))}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-border mb-4">
        {(["defaulters", "recovery"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t === "defaulters" ? `Overdue Subscriptions (${defaulters.length})` : `Recovery Cases (${cases.length})`}
          </button>
        ))}
        {tab === "recovery" && (
          <div className="ml-auto flex items-center gap-2 pb-1">
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="h-8 rounded-xl border border-border bg-background px-2 text-xs"
            >
              <option value="">All Stages</option>
              {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
            </select>
          </div>
        )}
      </div>

      {loading ? <ERPLoadingState label="Loading…" /> : null}
      {!loading && error ? <ERPErrorState title="Error" description={error} /> : null}

      {/* Defaulters tab */}
      {!loading && !error && tab === "defaulters" ? (
        defaulters.length === 0 ? (
          <ERPEmptyState title="No defaulters" description="No overdue EMIs in this bucket." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--surface-muted)]">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Contract</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3 text-right">Overdue EMIs</th>
                  <th className="px-4 py-3 text-right">Overdue Amount</th>
                  <th className="px-4 py-3">Aging</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {defaulters.map((r) => (
                  <tr key={r.subscription_id} className="border-t border-border/60">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{r.customer_name}</div>
                      <div className="text-xs text-muted-foreground">{r.customer_phone}</div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">{r.contract_ref}</td>
                    <td className="px-4 py-3 text-xs max-w-[130px] truncate">{r.product_name}</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-700">{r.overdue_emis}</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-700">{fmt(r.overdue_amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${bucketColor(r.aging_bucket)}`}>
                        {r.aging_bucket}d
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => void handleOpenCase(r.subscription_id)}
                        disabled={actionBusy === r.subscription_id}
                        className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                      >
                        {actionBusy === r.subscription_id ? "Opening…" : "Open Case"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {/* Recovery cases tab */}
      {!loading && !error && tab === "recovery" ? (
        cases.length === 0 ? (
          <ERPEmptyState title="No recovery cases" description="Open a case from the Overdue Subscriptions tab." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--surface-muted)]">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Contract</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3 text-right">Overdue</th>
                  <th className="px-4 py-3">Aging</th>
                  <th className="px-4 py-3">Assigned To</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((rc) => (
                  <tr key={rc.id} className="border-t border-border/60">
                    <td className="px-4 py-3">
                      <div className="font-medium">{rc.customer_name}</div>
                      <div className="text-xs text-muted-foreground">{rc.customer_phone}</div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">{rc.contract_ref}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STAGE_COLORS[rc.stage] ?? "bg-gray-100 text-gray-600"}`}>
                        {STAGE_LABELS[rc.stage] ?? rc.stage}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-red-700">{fmt(rc.overdue_amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${bucketColor(rc.aging_bucket)}`}>
                        {rc.aging_bucket}d
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">{rc.assigned_to ?? <span className="text-muted-foreground">Unassigned</span>}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedCase(rc)}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {selectedCase && (
        <RecoveryDrawer
          rc={selectedCase}
          onClose={() => setSelectedCase(null)}
          onSaved={(updated) => {
            setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            setSelectedCase(null);
          }}
        />
      )}
    </ERPPageShell>
  );
}
