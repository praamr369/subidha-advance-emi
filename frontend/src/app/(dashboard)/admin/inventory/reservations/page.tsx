"use client";

import { useEffect, useMemo, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ERPAuditNote from "@/components/erp/ERPAuditNote";
import { ROUTES } from "@/lib/routes";

interface StockReservation {
  id: number;
  inventory_item: number;
  inventory_item_name: string;
  reserved_for: string;
  reserved_qty: number;
  fulfilled_qty: number;
  status: string;
  created_at: string;
  expires_at: string | null;
  reference: string | null;
}

interface ReservationResponse {
  results: StockReservation[];
  count: number;
}

async function fetchReservations(search?: string): Promise<ReservationResponse> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const res = await fetch(`/api/v1/inventory/reservations/?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function AdminInventoryReservationsPage() {
  const [data, setData] = useState<StockReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchReservations(search || undefined);
      setData(result.results ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reservations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [search]);

  const rows = useMemo(() => data, [data]);

  return (
    <ERPPageShell
      title="Stock Reservations"
      subtitle="Active stock reservations by item and purpose. Read-only visibility."
      headerMode="erp"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Reservations" },
      ]}
    >
      <ERPAuditNote title="Read-only" tone="info">
        Stock reservations are system-managed. To release a reservation, use the relevant
        source workflow (delivery, subscription, or direct-sale).
      </ERPAuditNote>

      <ERPDataToolbar
        left={
          <input
            type="search"
            placeholder="Search item or reference…"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        }
        right={null}
      />

      {loading && <LoadingBlock label="Loading reservations…" />}
      {error && <ERPErrorState title="Load error" message={error} onRetry={() => void load()} />}

      {!loading && !error && rows.length === 0 && (
        <ERPEmptyState
          title="No reservations"
          description="No active stock reservations found."
        />
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                {["ID", "Item", "Reserved For", "Qty Reserved", "Qty Fulfilled", "Status", "Expires", "Reference"].map((h) => (
                  <th key={h} className="px-4 py-2 font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/40">
                  <td className="px-4 py-2 font-mono text-xs">{r.id}</td>
                  <td className="px-4 py-2">{r.inventory_item_name || r.inventory_item}</td>
                  <td className="px-4 py-2">{r.reserved_for}</td>
                  <td className="px-4 py-2">{r.reserved_qty}</td>
                  <td className="px-4 py-2">{r.fulfilled_qty}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.status === "ACTIVE" ? "bg-green-100 text-green-700" :
                      r.status === "FULFILLED" ? "bg-blue-100 text-blue-700" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{r.expires_at ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{r.reference ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ERPPageShell>
  );
}
