"use client";

import { useCallback, useEffect, useState } from "react";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import RefreshBar from "@/components/feedback/RefreshBar";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import {
  forfeitAdvance,
  listAdvanceForfeitures,
  recordContactAttempt,
  reverseForfeiture,
  type AdvanceForfeiture,
  type DormantCandidate,
} from "@/services/advance-forfeiture";

const STATUS_COLOR: Record<string, string> = {
  PENDING_REVIEW: "bg-yellow-100 text-yellow-700",
  CONTACT_ATTEMPTED: "bg-blue-100 text-blue-700",
  FORFEITED: "bg-red-100 text-red-700",
  REVERSED: "bg-gray-100 text-gray-500",
};

export default function AdvanceForfeituresPage() {
  const [candidates, setCandidates] = useState<DormantCandidate[]>([]);
  const [forfeitures, setForfeitures] = useState<AdvanceForfeiture[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const data = await listAdvanceForfeitures();
      setCandidates(data.dormant_candidates);
      setForfeitures(data.existing_forfeitures);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void reload(true); }, [reload]);

  const totalForfeited = forfeitures
    .filter((f) => f.status === "FORFEITED")
    .reduce((s, f) => s + Number(f.forfeited_amount), 0);

  const kpis = [
    { label: "Dormant candidates", value: candidates.length },
    { label: "Active forfeitures", value: forfeitures.filter((f) => f.status === "FORFEITED").length },
    { label: "Total forfeited", value: `₹${totalForfeited.toLocaleString("en-IN")}` },
    { label: "Reversed", value: forfeitures.filter((f) => f.status === "REVERSED").length },
  ];

  const handleContact = async (advanceId: number) => {
    const method = prompt("Contact method (Phone/Email/Letter/Visit):");
    const outcome = prompt("Outcome (No response / Wrong number / Refused / etc):");
    if (!method || !outcome) return;
    try {
      await recordContactAttempt(advanceId, method, outcome);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    }
  };

  const handleForfeit = async (advanceId: number) => {
    if (!confirm("Forfeit this advance? This recognizes the amount as income under IT Act s.41(1).")) return;
    try {
      await forfeitAdvance(advanceId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    }
  };

  const handleReverse = async (id: number) => {
    const reason = prompt("Reversal reason:");
    if (!reason) return;
    try {
      await reverseForfeiture(id, reason);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    }
  };

  return (
    <ERPPageShell
      title="Advance Forfeitures"
      subtitle="Limitation Act 1963 s.3 — dormant customer advance forfeiture workflow"
      stats={kpis}
    >
      <RefreshBar active={refreshing} />
      {loading ? (
        <LoadingBlock label="Loading advance forfeitures…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : (
        <>
          <WorkspaceSection title={`Dormant candidates (${candidates.length})`}>
            {candidates.length === 0 ? (
              <EmptyState title="No dormant advances" description="No customer advances have been dormant for 3+ years." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-4">Customer</th>
                      <th className="pb-2 pr-4">Amount</th>
                      <th className="pb-2 pr-4">Unapplied</th>
                      <th className="pb-2 pr-4">Payment date</th>
                      <th className="pb-2 pr-4">Dormant days</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c) => (
                      <tr key={c.advance_id} className="border-b">
                        <td className="py-2 pr-4">{c.customer_name ?? `#${c.customer_id}`}</td>
                        <td className="py-2 pr-4">₹{Number(c.amount).toLocaleString("en-IN")}</td>
                        <td className="py-2 pr-4">₹{Number(c.unapplied_amount).toLocaleString("en-IN")}</td>
                        <td className="py-2 pr-4">{c.payment_date}</td>
                        <td className="py-2 pr-4">{c.dormant_days}</td>
                        <td className="py-2 space-x-2">
                          <button onClick={() => handleContact(c.advance_id)} className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200">Log contact</button>
                          <button onClick={() => handleForfeit(c.advance_id)} className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200">Forfeit</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </WorkspaceSection>

          <WorkspaceSection title={`Forfeiture register (${forfeitures.length})`}>
            {forfeitures.length === 0 ? (
              <EmptyState title="No forfeitures" description="Forfeiture records will appear here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-4">Customer</th>
                      <th className="pb-2 pr-4">Amount</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4">Attempts</th>
                      <th className="pb-2 pr-4">Forfeiture date</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forfeitures.map((f) => (
                      <tr key={f.id} className="border-b">
                        <td className="py-2 pr-4">{f.customer_name ?? `Adv#${f.advance_id}`}</td>
                        <td className="py-2 pr-4">₹{Number(f.forfeited_amount).toLocaleString("en-IN")}</td>
                        <td className="py-2 pr-4">
                          <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLOR[f.status] ?? ""}`}>{f.status}</span>
                        </td>
                        <td className="py-2 pr-4">{f.contact_attempts.length}</td>
                        <td className="py-2 pr-4">{f.forfeiture_date ?? "—"}</td>
                        <td className="py-2 space-x-2">
                          {f.status !== "FORFEITED" && f.status !== "REVERSED" && (
                            <>
                              <button onClick={() => handleContact(f.advance_id)} className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200">Log contact</button>
                              <button onClick={() => handleForfeit(f.advance_id)} className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200">Forfeit</button>
                            </>
                          )}
                          {f.status === "FORFEITED" && (
                            <button onClick={() => handleReverse(f.id)} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200">Reverse</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </WorkspaceSection>
        </>
      )}
    </ERPPageShell>
  );
}
