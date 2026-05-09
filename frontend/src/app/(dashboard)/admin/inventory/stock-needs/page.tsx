"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { StockNeedsOperationalWorkspace } from "@/components/workspace/StockNeedsOperationalWorkspace";
import { ROUTES } from "@/lib/routes";
import { listStockNeeds } from "@/services/inventory-ops";

type Row = Record<string, unknown>;

export default function StockNeedsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await listStockNeeds({ limit: "100" });
      const p = payload as { results?: Row[]; count?: number };
      setRows(p.results ?? []);
      setCount(typeof p.count === "number" ? p.count : (p.results ?? []).length);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stock needs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  return (
    <PortalPage
      title="Purchase need workspace"
      subtitle="Operational purchase/stock needs (PurchaseNeed). Mutations require admin privileges."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Stock needs" },
      ]}
      statusBadge={{ label: "Inventory Need Signals", tone: "info" }}
      actions={[
        { label: "Readiness", href: ROUTES.admin.inventoryReadiness, variant: "secondary" },
        { label: "Purchase needs (legacy workspace)", href: ROUTES.admin.inventoryPurchaseNeeds, variant: "secondary" },
      ]}
    >
      <div className="space-y-6">
      <div className="flex flex-wrap gap-2 text-sm">
        <Link className="rounded-full border border-border px-3 py-1 hover:bg-muted" href={ROUTES.admin.inventoryReadiness}>
          Readiness
        </Link>
        <Link className="rounded-full border border-border px-3 py-1 hover:bg-muted" href={ROUTES.admin.inventoryPurchaseNeeds}>
          Purchase needs (legacy workspace)
        </Link>
      </div>

      {loading ? <LoadingBlock label="Loading stock needs…" /> : null}
      {!loading && error ? (
        <ErrorState title="Unable to load stock needs" description={error} />
      ) : null}

      {!loading && !error ? (
        <StockNeedsOperationalWorkspace rows={rows} count={count} onRefresh={loadRows} />
      ) : null}
      </div>
    </PortalPage>
  );
}
