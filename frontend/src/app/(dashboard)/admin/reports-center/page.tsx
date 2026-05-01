"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { fetchReportsCenterCatalog, type ReportCenterCatalog } from "@/services/reports-center";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Failed to load report catalog.";
}

export default function AdminReportsCenterPage() {
  const [data, setData] = useState<ReportCenterCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const payload = await fetchReportsCenterCatalog();
        if (!active) return;
        setData(payload);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
        setData(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <PortalPage
      title="Reports center"
      subtitle="SME-style operational reports on SUBIDHA CORE data. All datasets are read-only; exports are permission-controlled."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Reports center" },
      ]}
      actions={[
        { href: ROUTES.admin.reports, label: "Classic reports hub", variant: "secondary" },
      ]}
    >
      {loading && <LoadingBlock label="Loading catalog…" />}
      {error && <ErrorState title="Could not load catalog" message={error} />}
      {!loading && !error && data && (
        <div className="space-y-10">
          <p className="text-sm text-muted-foreground">
            Saved filter presets and scheduled delivery are planned extensions; filters on each report support date range and
            branch where the underlying register exposes branch context.
          </p>
          {data.sections.map((section) => (
            <section key={section.id} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{section.label}</h2>
                <p className="text-xs text-muted-foreground">Section id: {section.id}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {section.reports.map((r) => (
                  <Link
                    key={r.key}
                    href={`${ROUTES.admin.reportsCenter}/${encodeURIComponent(r.key)}`}
                    className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-ring hover:bg-accent/30"
                  >
                    <div className="text-sm font-semibold text-card-foreground">{r.title}</div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{r.description}</p>
                    <p className="mt-3 text-xs font-medium text-primary">Open report →</p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
          {data.sections.length === 0 && (
            <EmptyState title="No sections" description="Catalog is empty." />
          )}
        </div>
      )}
    </PortalPage>
  );
}
