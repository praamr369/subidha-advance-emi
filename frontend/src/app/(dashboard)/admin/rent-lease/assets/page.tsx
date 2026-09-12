"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import {
  listRentalAssets,
  releaseRentalAsset,
  type RentalAssetPage,
} from "@/services/customer-intelligence";

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "AVAILABLE", label: "Available" },
  { value: "RESERVED", label: "Reserved" },
  { value: "HANDED_OVER", label: "On hire" },
  { value: "RETURNED", label: "Returned" },
  { value: "UNDER_REPAIR", label: "Under repair" },
  { value: "RETIRED", label: "Retired" },
];

const RELEASABLE = new Set(["RETURNED", "UNDER_REPAIR"]);

const STATUS_TONE: Record<string, string> = {
  AVAILABLE: "border-emerald-200 bg-emerald-50 text-emerald-800",
  RESERVED: "border-sky-200 bg-sky-50 text-sky-800",
  HANDED_OVER: "border-indigo-200 bg-indigo-50 text-indigo-800",
  RETURNED: "border-amber-200 bg-amber-50 text-amber-800",
  UNDER_REPAIR: "border-orange-200 bg-orange-50 text-orange-800",
  RETIRED: "border-border bg-muted text-muted-foreground",
};

export default function RentalAssetsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RentalAssetPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await listRentalAssets({ status: statusFilter || undefined, page }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rental assets.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function release(assetId: number, assetCode: string) {
    setBusyId(assetId);
    setActionError(null);
    setActionMessage(null);
    try {
      await releaseRentalAsset(assetId);
      setActionMessage(`${assetCode} released — available to hire again.`);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Release failed.");
    } finally {
      setBusyId(null);
    }
  }

  const rows = data?.results ?? [];

  return (
    <ERPPageShell
      eyebrow="Sales"
      title="Rental Assets"
      subtitle="Every physical unit you hire out on rent or lease. Units back from hire stay out of the pool until you release them."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Rent/Lease", href: ROUTES.admin.rentLease },
        { label: "Rental Assets" },
      ]}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value || "all"}
              type="button"
              aria-pressed={statusFilter === filter.value}
              onClick={() => {
                setStatusFilter(filter.value);
                setPage(1);
              }}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                statusFilter === filter.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {actionError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {actionError}
          </div>
        ) : null}
        {actionMessage ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
            {actionMessage}
          </div>
        ) : null}

        {loading ? (
          <ERPLoadingState label="Loading rental assets..." />
        ) : error ? (
          <ERPErrorState title="Unable to load rental assets" description={error} onRetry={() => void load()} />
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            No rental assets{statusFilter ? " with this status" : ""} yet. Register units from a rent or lease contract.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2">Asset</th>
                  <th scope="col" className="px-4 py-2">Product</th>
                  <th scope="col" className="px-4 py-2">Status</th>
                  <th scope="col" className="px-4 py-2">On hire to</th>
                  <th scope="col" className="px-4 py-2">Location</th>
                  <th scope="col" className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((asset) => (
                  <tr key={asset.id} data-testid="rental-asset-register-row">
                    <td className="px-4 py-2">
                      <div className="font-medium text-foreground">{asset.asset_code}</div>
                      {asset.serial_no ? (
                        <div className="text-xs text-muted-foreground">SN {asset.serial_no}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-foreground">{asset.product_name ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${
                          STATUS_TONE[asset.status] ?? "border-border bg-muted text-foreground"
                        }`}
                      >
                        {asset.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {asset.current_subscription_id ? (
                        <Link
                          href={`${ROUTES.admin.subscriptions}/${asset.current_subscription_id}`}
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          {asset.current_customer_name ?? "Customer"} ·{" "}
                          {asset.current_subscription_number ?? `#${asset.current_subscription_id}`}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{asset.current_location_code ?? "—"}</td>
                    <td className="px-4 py-2 text-right">
                      {RELEASABLE.has(asset.status) ? (
                        <button
                          type="button"
                          disabled={busyId !== null}
                          onClick={() => void release(asset.id, asset.asset_code)}
                          className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-95 disabled:opacity-50"
                        >
                          {busyId === asset.id ? "Releasing..." : "Release to available"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && (data.previous || data.next) ? (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {data.count} asset{data.count === 1 ? "" : "s"} · page {page}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!data.previous || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded-md border border-border bg-background px-3 py-1 hover:bg-muted disabled:opacity-50"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={!data.next || loading}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-md border border-border bg-background px-3 py-1 hover:bg-muted disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Releasing a unit under repair also lifts the maintenance hold its return inspection placed on stock.
        </p>
      </div>
    </ERPPageShell>
  );
}
