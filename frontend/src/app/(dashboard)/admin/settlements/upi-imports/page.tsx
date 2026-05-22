// src/app/(dashboard)/admin/settlements/upi-imports/page.tsx

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import FieldHelp from "@/components/erp/forms/FieldHelp";
import { ApiError } from "@/lib/api";
import { listUpiImports, createUpiImport } from "@/services/settlements";
import type { UpiSettlementImport } from "@/types/settlements";
import { ROUTES } from "@/lib/routes";

export default function UpiImportsList() {
  const [imports, setImports] = useState<UpiSettlementImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const formatError = useCallback((err: unknown, fallback: string) => {
    if (err instanceof ApiError) return err.readableMessage || fallback;
    if (err instanceof Error) return err.message || fallback;
    return fallback;
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await listUpiImports();
      setImports(resp.results ?? []);
      setError(null);
    } catch (err: unknown) {
      setError(formatError(err, "Failed to load imports."));
    } finally {
      setLoading(false);
    }
  }, [formatError]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const upi_finance_account = Number(formData.get("upi_finance_account"));
    const settlement_date = String(formData.get("settlement_date"));
    const uploaded_file = formData.get("uploaded_file") as File;
    if (!upi_finance_account || !settlement_date || !uploaded_file) {
      setUploadError("All fields are required");
      return;
    }
    setUploading(true);
    try {
      await createUpiImport({ upi_finance_account, settlement_date, uploaded_file });
      setUploadError(null);
      setShowUpload(false);
      fetchData();
    } catch (err: unknown) {
      setUploadError(formatError(err, "Upload failed."));
    } finally {
      setUploading(false);
    }
  };

  return (
    <ERPPageShell
      title="UPI Settlement Imports"
      subtitle="Admin-only evidence imports. Upload, review parsed lines, then apply manual allocations to existing targets."
      helperNote="Imports only store evidence. They do not match payments, post accounting, or close reconciliation items."
      helperTone="warning"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Settlements", href: ROUTES.admin.settlements },
        { label: "UPI Imports" },
      ]}
      actions={[
        { href: ROUTES.admin.settlementsBankImports, label: "Bank imports", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
      headerMode="erp"
    >
      <ERPSectionShell title="Import register" description="Uploaded settlement imports with status and checksum.">
        <ERPDataToolbar
          left={
            <div className="text-sm text-muted-foreground">
              Use a finance account ID. A lookup selector is intentionally not added in this phase.
            </div>
          }
          right={
            <button
              type="button"
              className="rounded-xl border border-border bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.6)] hover:bg-slate-800"
              onClick={() => setShowUpload((value) => !value)}
            >
              {showUpload ? "Cancel" : "Upload UPI settlement"}
            </button>
          }
        />
        {showUpload && (
          <form
            className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_var(--hairline-shine)]"
            onSubmit={handleUpload}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-muted-foreground">
                UPI finance account ID
                <input
                  type="number"
                  name="upi_finance_account"
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                  required
                  min={1}
                />
                <div className="mt-2">
                  <FieldHelp
                    meaning={
                      <>Use the numeric `FinanceAccount.id` for the UPI account that owns this settlement evidence.</>
                    }
                  />
                </div>
              </label>
              <label className="text-sm text-muted-foreground">
                Settlement date
                <input
                  type="date"
                  name="settlement_date"
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                  required
                />
              </label>
              <label className="text-sm text-muted-foreground md:col-span-2">
                CSV file
                <input
                  type="file"
                  name="uploaded_file"
                  accept=".csv,text/csv"
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-semibold"
                  required
                />
              </label>
            </div>
            {uploadError ? (
              <div className="mt-3">
                <ERPErrorState title="Upload failed" message={uploadError} />
              </div>
            ) : null}
            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={uploading}
                className="rounded-xl border border-border bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {uploading ? "Uploading..." : "Submit import"}
              </button>
            </div>
          </form>
        )}

        {loading ? <ERPLoadingState label="Loading UPI imports..." /> : null}
        {!loading && error ? (
          <ERPErrorState title="UPI imports unavailable" description={error} onRetry={() => void fetchData()} />
        ) : null}
        {!loading && !error && imports.length === 0 ? (
          <ERPEmptyState
            title="No UPI imports found"
            description="Upload a UPI settlement CSV to create evidence records and parsed lines."
          />
        ) : null}
        {!loading && !error && imports.length > 0 ? (
          <table className="min-w-full overflow-hidden rounded-[1.2rem] border border-border/70 bg-[var(--surface-card-elevated)]">
            <thead className="bg-[var(--surface-muted)]/60">
              <tr>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Import
                </th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Finance account
                </th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Settlement date
                </th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Status
                </th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Checksum
                </th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Uploaded
                </th>
                <th className="p-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {imports.map((imp) => (
                <tr key={imp.id} className="border-t border-border/60">
                  <td className="p-3 text-sm font-semibold text-foreground">{imp.import_no}</td>
                  <td className="p-3 text-sm text-foreground">
                    <div className="font-semibold text-foreground">
                      {imp.upi_finance_account_name ?? `#${imp.upi_finance_account}`}
                    </div>
                    <div className="text-xs text-muted-foreground">ID {imp.upi_finance_account}</div>
                  </td>
                  <td className="p-3 text-sm text-foreground">{imp.settlement_date}</td>
                  <td className="p-3 text-sm">
                    <ERPStatusBadge status={imp.status} />
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">{imp.checksum}</td>
                  <td className="p-3 text-sm text-muted-foreground">{imp.uploaded_at}</td>
                  <td className="p-3 text-right text-sm">
                    <Link
                      href={`${ROUTES.admin.settlementsUpiImports}/${imp.id}`}
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
