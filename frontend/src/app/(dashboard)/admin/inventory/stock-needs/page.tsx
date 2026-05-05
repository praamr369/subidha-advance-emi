"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PageHeader from "@/components/ui/PageHeader";
import { StockNeedsOperationalWorkspace } from "@/components/workspace/StockNeedsOperationalWorkspace";
import { ROUTES } from "@/lib/routes";
import { listStockNeeds } from "@/services/inventory-ops";

type Row = Record<string, unknown>;

export default function StockNeedsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    listStockNeeds({ limit: "100" })
      .then((payload) => {
        if (!mounted) return;
        const p = payload as { results?: Row[]; count?: number };
        setRows(p.results ?? []);
        setCount(typeof p.count === "number" ? p.count : (p.results ?? []).length);
        setError(null);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load stock needs.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase need workspace"
        description="Operational purchase/stock needs (PurchaseNeed). Mutations require admin privileges."
      />
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
        <StockNeedsOperationalWorkspace rows={rows} count={count} />
      ) : null}
    </div>
  );
}
