"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { listCustomerDocuments, type FinanceDocumentRow } from "@/services/phase4-finance";

export default function CustomerDocumentsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<FinanceDocumentRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await listCustomerDocuments();
      setRows(payload.results ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ERPPageShell
      title="My Documents"
      subtitle="Contract and finance PDFs generated for your subscriptions."
      breadcrumbs={[{ label: "Dashboard", href: "/customer" }, { label: "Documents" }]}
      actions={[{ href: "/customer/account-statement", label: "Account Statement", variant: "secondary" }]}
      headerMode="erp"
    >
      <ERPSectionShell title="Document Center" description="Versioned PDF records with secure scoped access.">
        {loading ? <ERPLoadingState label="Loading documents..." /> : null}
        {!loading && error ? (
          <ERPErrorState title="Unable to load documents" message={error} onRetry={() => void load()} />
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <ERPEmptyState title="No documents yet" description="Generated PDFs will appear here." />
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
              >
                <div>
                  <div className="text-sm font-medium">{row.document_type}</div>
                  <div className="text-xs text-muted-foreground">
                    Version {row.document_version} • {row.generated_at}
                  </div>
                </div>
                {row.file_url ? (
                  <Link
                    href={row.file_url}
                    target="_blank"
                    className="inline-flex h-10 items-center rounded-lg border px-3 text-sm font-medium"
                  >
                    Download PDF
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground">File unavailable</span>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
