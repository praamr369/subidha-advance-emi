"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { apiFetch } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import { Database } from "lucide-react";

function toErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "readableMessage" in e) return String((e as { readableMessage: unknown }).readableMessage);
  return "Request failed.";
}

type LegacyReceivable = {
  id: number;
  customer_id?: number | null;
  customer_url?: string | null;
  customer_name: string;
  phone: string;
  outstanding_amount: string;
  collected_amount: string;
  balance_remaining: string;
  entry_date: string;
  notes: string;
  is_settled: boolean;
  settled_at: string | null;
  admin_verified: boolean;
  admin_verified_at: string | null;
  admin_verification_notes: string;
  migration_row_id: number | null;
  migration_batch_id: number | null;
  migration_batch_number: string | null;
  created_at: string;
};

export default function CustomerOpeningBalancesPage() {
  const [rows, setRows] = useState<LegacyReceivable[]>([]);
  const [totalOutstanding, setTotalOutstanding] = useState("0.00");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ newly_linked: number; already_linked: number; unresolvable: number } | null>(null);

  async function syncCustomerLinks() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await apiFetch("/api/v1/admin/opening-balances/customers/sync/", {
        method: "POST",
      }) as { newly_linked: number; already_linked: number; unresolvable: number };
      setSyncResult(res);
      await fetchRows();
    } catch (e) {
      alert(toErr(e));
    } finally {
      setSyncing(false);
    }
  }

  async function fetchRows() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/v1/admin/opening-balances/customers/") as { results?: LegacyReceivable[]; total_outstanding?: string; };
      setRows(res.results || []);
      setTotalOutstanding(res.total_outstanding || "0.00");
    } catch (e) {
      setError(toErr(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRows();
  }, []);

  async function toggleVerified(row: LegacyReceivable) {
    if (togglingId) return;
    setTogglingId(row.id);
    try {
      const newStatus = !row.admin_verified;
      await apiFetch(`/api/v1/admin/opening-balances/customers/${row.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ admin_verified: newStatus }),
      });
      await fetchRows();
    } catch (e) {
      alert(toErr(e));
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <ERPPageShell
      title="Customer Opening Balances"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Legacy Receivables", href: "/admin/opening-balances/customers" },
      ]}
      actions={[
        {
          href: "/admin/settings/business-setup/data-migration",
          label: "Quick Entry",
          variant: "primary"
        }
      ]}
    >
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-foreground">Total Unsettled Legacy Receivables</div>
              <div className="mt-1 text-2xl font-semibold text-foreground">₹{totalOutstanding}</div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={syncCustomerLinks}
                disabled={syncing}
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
              >
                {syncing ? "Syncing..." : "Sync Customer Links"}
              </button>
              <button onClick={fetchRows} className="text-sm text-primary hover:underline">
                Refresh
              </button>
            </div>
          </div>
        </div>

        {syncResult && (
          <div className="border-b border-border bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-300">
            Sync complete: {syncResult.newly_linked} newly linked, {syncResult.already_linked} already linked, {syncResult.unresolvable} unresolvable (no matching phone or name).
          </div>
        )}

        {error ? (
          <div className="p-4 text-sm text-red-600">{error}</div>
        ) : loading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No customer opening balances found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">ID / Date</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Remaining</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Verification</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="transition hover:bg-muted/20">
                    <td className="px-4 py-3 align-top">
                      <div className="font-semibold text-foreground">#{row.id}</div>
                      <div className="text-xs text-muted-foreground">{new Date(row.entry_date).toLocaleDateString()}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {row.customer_url ? (
                        <Link href={row.customer_url} className="font-medium text-primary hover:underline">
                          {row.customer_name}
                        </Link>
                      ) : (
                        <span className="font-medium text-foreground">{row.customer_name}</span>
                      )}
                      <div className="text-xs text-muted-foreground">{row.phone || "No phone"}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="font-semibold text-foreground">₹{row.balance_remaining}</div>
                      <div className="text-[10px] text-muted-foreground uppercase mt-1">Orig: ₹{row.outstanding_amount}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {row.is_settled ? (
                        <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                          Settled
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                          Unsettled
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <button
                        onClick={() => toggleVerified(row)}
                        disabled={togglingId === row.id}
                        className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset transition ${
                          row.admin_verified
                            ? "bg-blue-50 text-blue-700 ring-blue-600/20 hover:bg-blue-100"
                            : "bg-red-50 text-red-700 ring-red-600/20 hover:bg-red-100"
                        }`}
                      >
                        {row.admin_verified ? "Verified" : "Unverified"}
                      </button>
                      {row.admin_verified_at && (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          {new Date(row.admin_verified_at).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {row.migration_batch_number ? (
                        <div className="text-xs text-muted-foreground">Batch #{row.migration_batch_number}</div>
                      ) : (
                        <div className="text-xs text-muted-foreground">Manual</div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {!row.is_settled && Number(row.balance_remaining) > 0 && (
                        <Link
                          href={`/admin/finance/collect?workflow=legacy-receivable&outstanding=${row.id}`}
                          className="text-xs font-medium text-amber-700 hover:underline"
                        >
                          Collect
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ERPPageShell>
  );
}
