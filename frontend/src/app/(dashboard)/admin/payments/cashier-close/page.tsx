"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type DayClose = {
  id: number;
  business_date: string;
  status: string;
  submitted_at: string | null;
  approved_at: string | null;
  cashier_username?: string | null;
  branch_name?: string | null;
  cash_counter_name?: string | null;
  system_cash_total?: string | number | null;
  cashier_declared_cash?: string | number | null;
  variance?: string | number | null;
  notes?: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SUBMITTED: "bg-yellow-100 text-yellow-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  VOIDED: "bg-gray-100 text-gray-400",
};

function rupee(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? "0")) || 0;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default function AdminCashierClosePage() {
  const [closes, setCloses] = useState<DayClose[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const load = () => {
    setLoading(true);
    apiFetch(`/settlements/cashier-day-closes/?date=${today}`)
      .then((d) => {
        const arr = Array.isArray(d) ? d : ((d as { results?: DayClose[] })?.results ?? []);
        setCloses(arr as DayClose[]);
      })
      .catch(() => setCloses([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAction = async (id: number, action: "approve" | "reject") => {
    if (!confirm(`${action === "approve" ? "Approve" : "Reject"} this day close?`)) return;
    setProcessing(id);
    try {
      await apiFetch(`/settlements/cashier-day-closes/${id}/${action}/`, { method: "POST" });
      showToast(`Day close ${action}d successfully.`);
      load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : `${action} failed.`, false);
    } finally {
      setProcessing(null);
    }
  };

  const pending = closes.filter((c) => c.status === "SUBMITTED");
  const approved = closes.filter((c) => c.status === "APPROVED");

  const todayLabel = new Date().toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return (
    <ERPPageShell
      title="Cashier Day Close — Admin Approval"
      subtitle={todayLabel}
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Payments", href: "/admin/payments" },
        { label: "Day Close" },
      ]}
    >
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      )}

      <div className="max-w-3xl mx-auto space-y-6">
        {/* Info banner */}
        <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
          Cashiers submit their day-close from the Cashier portal. As admin you can <strong>approve</strong> or <strong>reject</strong> submitted sessions here.
          To view the detailed settlement, go to{" "}
          <Link href="/admin/settlements/cashier-day-closes" className="underline font-medium">
            Settlements → Cashier Day Closes →
          </Link>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Pending approval", count: pending.length, color: "yellow" },
            { label: "Approved today", count: approved.length, color: "green" },
            { label: "Total sessions", count: closes.length, color: "gray" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-sm">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{s.count}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Sessions list */}
        <WorkspaceSection title={`Today's Sessions — ${today}`}>
          {loading && <div className="py-8 text-center text-gray-400">Loading sessions…</div>}

          {!loading && closes.length === 0 && (
            <div className="py-12 text-center text-gray-400">
              <div className="text-4xl mb-3">📋</div>
              <p className="font-medium">No cashier sessions for today yet</p>
              <p className="text-sm mt-1">Sessions appear here once a cashier submits a day close.</p>
            </div>
          )}

          <div className="space-y-3">
            {closes.map((c) => (
              <div key={c.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {c.cashier_username ?? `Session #${c.id}`}
                      </span>
                      {c.branch_name && (
                        <span className="text-xs text-gray-400">{c.branch_name}</span>
                      )}
                      {c.cash_counter_name && (
                        <span className="text-xs text-gray-400">· {c.cash_counter_name}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm mt-2">
                      <div>
                        <div className="text-xs text-gray-500">System total</div>
                        <div className="font-medium">{rupee(c.system_cash_total)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Declared cash</div>
                        <div className="font-medium">{rupee(c.cashier_declared_cash)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Variance</div>
                        <div className={`font-medium ${parseFloat(String(c.variance ?? 0)) !== 0 ? "text-red-600" : "text-green-600"}`}>
                          {rupee(c.variance)}
                        </div>
                      </div>
                    </div>
                    {c.notes && (
                      <div className="text-xs text-gray-500 mt-1 italic">{c.notes}</div>
                    )}
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_COLOR[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {c.status}
                  </span>
                </div>

                {c.status === "SUBMITTED" && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <button
                      onClick={() => handleAction(c.id, "approve")}
                      disabled={processing === c.id}
                      className="flex-1 py-1.5 bg-green-600 text-white text-sm rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      {processing === c.id ? "Processing…" : "Approve"}
                    </button>
                    <button
                      onClick={() => handleAction(c.id, "reject")}
                      disabled={processing === c.id}
                      className="flex-1 py-1.5 bg-red-600 text-white text-sm rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}

                {c.status === "APPROVED" && c.approved_at && (
                  <div className="mt-2 text-xs text-green-600 dark:text-green-400">
                    ✓ Approved {new Date(c.approved_at).toLocaleString("en-IN")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </WorkspaceSection>

        <div className="text-center">
          <Link
            href="/admin/settlements/cashier-day-closes"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            View full settlement history →
          </Link>
        </div>
      </div>
    </ERPPageShell>
  );
}
