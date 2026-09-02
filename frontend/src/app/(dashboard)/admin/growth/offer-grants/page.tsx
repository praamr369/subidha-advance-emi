"use client";

import { useCallback, useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import {
  decideCustomerOfferGrant,
  listPendingOfferGrants,
  type CustomerOfferGrant,
} from "@/services/growth";

function planBadge(p: string) {
  if (p === "EMI") return "bg-blue-50 text-blue-700 border border-blue-100";
  if (p === "RENT") return "bg-teal-50 text-teal-700 border border-teal-100";
  if (p === "LEASE") return "bg-purple-50 text-purple-700 border border-purple-100";
  return "bg-muted text-muted-foreground border border-border";
}

export default function OfferGrantApprovalsPage() {
  const [grants, setGrants] = useState<CustomerOfferGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listPendingOfferGrants()
      .then((r) => setGrants(r.results))
      .catch((e) => setError(e?.message ?? "Failed to load pending offer grants."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const decide = async (grant: CustomerOfferGrant, approve: boolean) => {
    setBusyId(grant.id);
    setMessage(null);
    setError(null);
    try {
      await decideCustomerOfferGrant(grant.id, approve, notes[grant.id] ?? "");
      setMessage(
        approve
          ? `Approved “${grant.package_name}” for ${grant.customer_name ?? "customer"} — their price now reflects it.`
          : `Rejected “${grant.package_name}” for ${grant.customer_name ?? "customer"}.`
      );
      setGrants((prev) => prev.filter((g) => g.id !== grant.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record that decision.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <ERPLoadingState />;
  if (error && grants.length === 0) return <ERPErrorState message={error} />;

  return (
    <ERPPageShell
      title="Offer Approvals"
      subtitle="Customer offers wait here until a person approves them. Nothing changes a customer's price until it is approved."
    >
      {message ? (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/20 dark:text-green-300">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {grants.length === 0 ? (
        <ERPEmptyState
          title="Nothing awaiting approval"
          description="Offers requested for a customer will appear here for review."
        />
      ) : (
        <div className="space-y-3">
          {grants.map((g) => (
            <div key={g.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{g.package_name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${planBadge(g.plan_type)}`}>
                      {g.plan_type}
                    </span>
                    <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {g.audience_type.replaceAll("_", " ").toLowerCase()}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    For <span className="font-medium text-foreground">{g.customer_name ?? `#${g.customer_id}`}</span>
                    {g.requested_by ? ` · requested by ${g.requested_by}` : null}
                    {g.expires_on ? ` · expires ${g.expires_on}` : null}
                  </div>
                  {g.note ? (
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{g.note}</p>
                  ) : null}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <input
                    type="text"
                    value={notes[g.id] ?? ""}
                    onChange={(e) => setNotes((p) => ({ ...p, [g.id]: e.target.value }))}
                    placeholder="Decision note (optional)"
                    aria-label={`Decision note for ${g.package_name}`}
                    className="w-56 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === g.id}
                      onClick={() => decide(g, false)}
                      className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={busyId === g.id}
                      onClick={() => decide(g, true)}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                    >
                      {busyId === g.id ? "Saving..." : "Approve"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ERPPageShell>
  );
}
