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
      title="Vendor Categories"
      subtitle="Supplier category master."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Vendor Categories" },
      ]}
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
          <div className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4 text-sm shadow-[inset_0_1px_0_var(--hairline-shine)]">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((row, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-border/60 bg-[color-mix(in_oklab,var(--surface-muted)_40%,transparent)] px-3 py-2"
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
