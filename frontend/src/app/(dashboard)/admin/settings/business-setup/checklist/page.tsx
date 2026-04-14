"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import { getResetPreview, getSetupChecklist, type SetupChecklist } from "@/services/business-setup";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to load checklist.";
}

export default function BusinessSetupChecklistPage() {
  const [data, setData] = useState<SetupChecklist | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    Promise.all([getSetupChecklist(), getResetPreview()])
      .then(([checklist, resetPreview]) => {
        if (!isMounted) {
          return;
        }
        setData(checklist);
        setPreview(resetPreview);
        setError(null);
      })
      .catch((loadError) => {
        if (!isMounted) {
          return;
        }
        setError(toErrorMessage(loadError));
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business setup checklist"
        description="Review computed setup completion and go-live blockers."
      />
      <BusinessSetupLinks />

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {data ? (
        <>
          <section className="grid gap-5 md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="text-sm font-medium text-muted-foreground">Completion</div>
              <div className="mt-2 text-3xl font-semibold text-foreground">{data.percent_complete}%</div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="text-sm font-medium text-muted-foreground">Checklist items</div>
              <div className="mt-2 text-3xl font-semibold text-foreground">{data.items.length}</div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="text-sm font-medium text-muted-foreground">Status</div>
              <div className="mt-2 text-lg font-semibold text-foreground">
                {data.is_ready_for_go_live ? "Ready for go-live" : "Not ready yet"}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4 text-sm font-medium text-muted-foreground">
              Itemized checklist
            </div>
            <div className="divide-y divide-border">
              {data.items.map((item) => (
                <div key={item.key} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{item.label}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{item.detail}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                        item.status === "complete"
                          ? "bg-emerald-500/10 text-emerald-600"
                          : item.status === "warning"
                            ? "bg-amber-500/10 text-amber-600"
                            : "bg-rose-500/10 text-rose-600"
                      }`}
                    >
                      {item.status}
                    </span>
                    {item.route ? (
                      <Link href={item.route} className="text-sm font-medium text-primary hover:underline">
                        Open
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {preview ? (
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="text-sm font-medium text-muted-foreground">Reset preview</div>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-muted p-4 text-xs text-foreground">{JSON.stringify(preview, null, 2)}</pre>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
