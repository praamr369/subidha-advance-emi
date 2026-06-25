"use client";

import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { listVendorCategories } from "@/services/vendors";

export default function AdminVendorCategoriesPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void listVendorCategories()
      .then((data) => {
        if (cancelled) return;
        const payload = data as { results?: Record<string, unknown>[] } | Record<string, unknown>[];
        setRows(Array.isArray(payload) ? payload : payload.results || []);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setRows([]);
        setError(err instanceof Error ? err.message : "Failed to load vendor categories.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ERPPageShell
      eyebrow="Purchases & Vendors"
      title="Vendor Categories"
      subtitle="Supplier and vendor category taxonomy for procurement routing and vendor profile classification."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Purchases", href: ROUTES.admin.purchases },
        { label: "Vendor Categories" },
      ]}
      actions={[
        { href: ROUTES.admin.purchases, label: "Purchases Hub", variant: "secondary" },
        { href: ROUTES.admin.vendors, label: "Vendors", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <ERPSectionShell
        title="Category Register"
        description="Reference categories for vendor segmentation and procurement analysis."
      >
        {loading ? <ERPLoadingState label="Loading vendor categories..." /> : null}
        {!loading && error ? (
          <ERPErrorState title="Unable to load vendor categories" description={error} />
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <ERPEmptyState title="No vendor categories" description="No vendor categories are configured yet." />
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <div className="rounded-xl border border-border bg-card p-4 text-sm">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((row, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-border bg-muted/40 px-3 py-2"
                >
                  <div className="text-sm font-semibold text-foreground">
                    {String(row.code)} <span className="text-muted-foreground">·</span> {String(row.name)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
