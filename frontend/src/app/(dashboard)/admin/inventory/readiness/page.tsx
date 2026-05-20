"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { WorkspaceNotice } from "@/components/ui/role-workspace";
import { ROUTES } from "@/lib/routes";
import { getInventoryReadiness } from "@/services/inventory-ops";

export default function InventoryReadinessPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getInventoryReadiness()
      .then((payload) => {
        if (!mounted) return;
        setData(payload as Record<string, unknown>);
        setError(null);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load readiness.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const warnings = (data?.warnings as { code?: string; message?: string }[]) || [];

  return (
    <ERPPageShell
      title="Inventory readiness"
      subtitle="Read-only ATP, opening-stock, and stock-need signals before fulfilling subscriptions or retail deliveries."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Readiness" },
      ]}
      actions={[
        { label: "Inventory workspace", href: ROUTES.admin.inventoryWorkspace, variant: "secondary" },
        { label: "Stock needs", href: ROUTES.admin.inventoryStockNeeds, variant: "secondary" },
      ]}
      statusBadge={{ label: "Operational Readiness", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2 text-sm">
        <Link className="rounded-full border border-border px-3 py-1 hover:bg-muted" href={ROUTES.admin.inventoryWorkspace}>
          Inventory workspace
        </Link>
        <Link className="rounded-full border border-border px-3 py-1 hover:bg-muted" href={ROUTES.admin.inventoryStockNeeds}>
          Stock needs
        </Link>
        </div>

        {loading ? <ERPLoadingState label="Loading readiness snapshot..." /> : null}
        {!loading && error ? (
          <ERPErrorState title="Unable to load inventory readiness" description={error} />
        ) : null}

        {data?.module_not_configured ? (
          <WorkspaceNotice tone="warning" title="Inventory module not configured">
            Inventory evaluation module is not configured on this deployment. Verify migrations and API connectivity.
          </WorkspaceNotice>
        ) : null}

        {!loading && !error && data && !data.module_not_configured ? (
          <ERPSectionShell
            title="Readiness Snapshot"
            description="Operational readiness signals only; no mutation actions are performed from this surface."
          >
            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="text-xs font-medium uppercase text-muted-foreground">Inventory ready</div>
                <div className="mt-2 text-2xl font-semibold">{String(data.inventory_ready)}</div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="text-xs font-medium uppercase text-muted-foreground">Tracked SKUs</div>
                <div className="mt-2 text-2xl font-semibold">{String(data.active_tracked_stock_items ?? "—")}</div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="text-xs font-medium uppercase text-muted-foreground">Open stock needs</div>
                <div className="mt-2 text-2xl font-semibold">{String(data.stock_needs_open ?? "—")}</div>
              </div>
            </section>
          </ERPSectionShell>
        ) : null}

        {!loading && !error && !data ? (
          <ERPEmptyState
            title="No readiness data"
            description="Inventory readiness data is currently unavailable for this branch."
          />
        ) : null}

        {warnings.length > 0 ? (
          <Collapsible defaultOpen className="rounded-2xl border border-amber-500/40 bg-amber-500/5">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left [&[data-state=open]>svg]:rotate-180">
              <div className="text-sm font-semibold text-foreground">Warnings ({warnings.length})</div>
              <ChevronDown className="size-4 shrink-0 text-amber-900/70 transition-transform duration-200" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="list-disc space-y-1 px-4 pb-4 pl-9 text-sm text-muted-foreground">
                {warnings.map((w) => (
                  <li key={`${w.code}-${w.message}`}>
                    <span className="font-medium text-foreground">{w.code}</span>: {w.message}
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
