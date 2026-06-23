"use client";

import { useCallback, useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import {
  getLeaderboard,
  listStaffTargets,
  setStaffTarget,
  type LeaderboardRow,
  type StaffTarget,
} from "@/services/gstr-recovery";

const now = new Date();
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function rankEmoji(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

export default function LeaderboardPage() {
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  const [targets, setTargets] = useState<StaffTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTargetForm, setShowTargetForm] = useState(false);
  const [targetForm, setTargetForm] = useState({ staff_id: "", target_leads: "0", target_conversions: "0", target_revenue: "0", notes: "" });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lb, tgts] = await Promise.all([
        getLeaderboard({ year, month }),
        listStaffTargets({ year, month }),
      ]);
      setBoard(lb.leaderboard);
      setTargets(tgts);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { void load(); }, [load]);

  async function handleSetTarget() {
    if (!targetForm.staff_id) { setSaveErr("Staff ID is required."); return; }
    setSaving(true);
    setSaveErr(null);
    try {
      await setStaffTarget({
        staff_id: Number(targetForm.staff_id),
        month,
        year,
        target_leads: Number(targetForm.target_leads),
        target_conversions: Number(targetForm.target_conversions),
        target_revenue: targetForm.target_revenue,
        notes: targetForm.notes,
      });
      setShowTargetForm(false);
      setTargetForm({ staff_id: "", target_leads: "0", target_conversions: "0", target_revenue: "0", notes: "" });
      void load();
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);

  return (
    <ERPPageShell
      title="Staff Leaderboard"
      description="Monthly sales performance, lead conversion, and targets per staff member"
    >
      {/* Period selector */}
      <ERPSectionShell title="Period">
        <div className="flex flex-wrap gap-3 items-center">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Month</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
            >
              {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="pt-5">
            <button
              onClick={() => setShowTargetForm((v) => !v)}
              className="h-9 rounded-xl border border-border bg-background px-4 text-xs font-semibold hover:bg-muted"
            >
              {showTargetForm ? "Cancel" : "Set Target"}
            </button>
          </div>
        </div>

        {showTargetForm && (
          <div className="mt-4 rounded-xl border border-border bg-[var(--surface-muted)] p-4 space-y-3 max-w-lg">
            <div className="text-xs font-semibold text-foreground">Set Monthly Target</div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Staff ID *", key: "staff_id", type: "number", placeholder: "User ID from staff list" },
                { label: "Target Leads", key: "target_leads", type: "number" },
                { label: "Target Conversions", key: "target_conversions", type: "number" },
                { label: "Target Revenue (₹)", key: "target_revenue", type: "number" },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs text-muted-foreground mb-1">{label}</label>
                  <input
                    type={type}
                    value={targetForm[key as keyof typeof targetForm]}
                    onChange={(e) => setTargetForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Notes</label>
              <input
                value={targetForm.notes}
                onChange={(e) => setTargetForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
                placeholder="Optional note"
              />
            </div>
            {saveErr && <div className="text-xs text-red-600 rounded-xl border border-red-200 bg-red-50 px-3 py-2">{saveErr}</div>}
            <button
              onClick={() => void handleSetTarget()}
              disabled={saving}
              className="h-9 rounded-xl border border-primary bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Target"}
            </button>
          </div>
        )}
      </ERPSectionShell>

      {loading ? <ERPLoadingState label="Loading leaderboard…" /> : null}
      {!loading && error ? <ERPErrorState title="Error" description={error} /> : null}

      {!loading && !error && (
        <>
          {/* Leaderboard */}
          <ERPSectionShell
            title={`Leaderboard — ${MONTHS[month - 1]} ${year}`}
            description="Ranked by conversions then leads assigned"
          >
            {board.length === 0 ? (
              <ERPEmptyState title="No activity" description="No leads assigned to staff in this period." />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--surface-muted)]">
                    <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3">Rank</th>
                      <th className="px-4 py-3">Staff</th>
                      <th className="px-4 py-3 text-right">Leads</th>
                      <th className="px-4 py-3 text-right">Converted</th>
                      <th className="px-4 py-3 text-right">Target Conv.</th>
                      <th className="px-4 py-3 text-right">Conv. Rate</th>
                      <th className="px-4 py-3">Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.map((row) => (
                      <tr
                        key={row.staff_id}
                        className={`border-t border-border/60 ${row.rank <= 3 ? "bg-[var(--surface-card-elevated)]" : ""}`}
                      >
                        <td className="px-4 py-3 font-bold text-lg">{rankEmoji(row.rank)}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{row.staff_name}</td>
                        <td className="px-4 py-3 text-right">{row.leads_assigned}</td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground">{row.leads_converted}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{row.target_conversions || "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-semibold ${row.conversion_rate >= 30 ? "text-green-700" : row.conversion_rate >= 15 ? "text-yellow-700" : "text-muted-foreground"}`}>
                            {row.conversion_rate}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {row.target_hit === true ? (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-semibold">✓ Hit</span>
                          ) : row.target_hit === false ? (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 font-semibold">Missed</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">No target</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ERPSectionShell>

          {/* Targets summary */}
          {targets.length > 0 && (
            <ERPSectionShell title="Monthly Targets" description={`${targets.length} target(s) set for ${MONTHS[month - 1]} ${year}`}>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--surface-muted)]">
                    <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3">Staff</th>
                      <th className="px-4 py-3 text-right">Target Leads</th>
                      <th className="px-4 py-3 text-right">Target Conv.</th>
                      <th className="px-4 py-3 text-right">Target Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {targets.map((t) => (
                      <tr key={t.id} className="border-t border-border/60">
                        <td className="px-4 py-3 font-medium">{t.staff_name}</td>
                        <td className="px-4 py-3 text-right">{t.target_leads}</td>
                        <td className="px-4 py-3 text-right">{t.target_conversions}</td>
                        <td className="px-4 py-3 text-right">₹{Number(t.target_revenue).toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ERPSectionShell>
          )}
        </>
      )}
    </ERPPageShell>
  );
}
