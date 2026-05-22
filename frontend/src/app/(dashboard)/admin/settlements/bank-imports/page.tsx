// src/app/(dashboard)/admin/settlements/bank-imports/page.tsx

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
import SettlementFinanceAccountLookup from "@/components/admin/settlements/SettlementFinanceAccountLookup";
import { ApiError } from "@/lib/api";
import { listBankImports, createBankImport } from "@/services/settlements";
import type { BankStatementImport } from "@/types/settlements";
import { ROUTES } from "@/lib/routes";

export default function BankImportsList() {
  const [imports, setImports] = useState<BankStatementImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [bankFinanceAccountId, setBankFinanceAccountId] = useState<string | null>(null);

  const formatError = useCallback((err: unknown, fallback: string) => {
    if (err instanceof ApiError) return err.readableMessage || fallback;
    if (err instanceof Error) return err.message || fallback;
    return fallback;
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await listBankImports();
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
    const bank_finance_account = Number(bankFinanceAccountId);
    const statement_period_from = String(formData.get("statement_period_from"));
    const statement_period_to = String(formData.get("statement_period_to"));
    const uploaded_file = formData.get("uploaded_file") as File;
    if (!bank_finance_account || !statement_period_from || !statement_period_to || !uploaded_file) {
      setUploadError("All fields are required");
      return;
    }
    setUploading(true);
    try {
      await createBankImport({
        bank_finance_account,
        statement_period_from,
        statement_period_to,
        uploaded_file,
      });
      setUploadError(null);
      setShowUpload(false);
      setBankFinanceAccountId(null);
      fetchData();
    } catch (err: unknown) {
      setUploadError(formatError(err, "Upload failed."));
    } finally {
      setUploading(false);
    }
  };

  return (
    <ERPPageShell
      title="Bank Statement Imports"
      subtitle="Admin-only evidence imports. Upload, review parsed lines, then apply manual allocations to existing targets."
      helperNote="Imports only store evidence. They do not match payments, post accounting, or close reconciliation items."
      helperTone="warning"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Settlements", href: ROUTES.admin.settlements },
        { label: "Bank Imports" },
      ]}
      actions={[
        { href: ROUTES.admin.settlementsUpiImports, label: "UPI imports", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
      headerMode="erp"
    >
      <ERPSectionShell title="Import register" description="Uploaded statement imports with status and checksum.">
        <ERPDataToolbar
          left={
            <div className="text-sm text-muted-foreground">
              Upload evidence only. Choose the bank finance account for the statement being imported.
            </div>
          }
          right={
            <button
              type="button"
              className="rounded-xl border border-border bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.6)] hover:bg-slate-800"
              onClick={() => setShowUpload((value) => !value)}
            >
              {showUpload ? "Cancel" : "Upload bank statement"}
            </button>
          }
        />
        {showUpload && (
          <form
            className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_var(--hairline-shine)]"
            onSubmit={handleUpload}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <SettlementFinanceAccountLookup
                label="Bank finance account"
                value={bankFinanceAccountId}
                onChange={(value) => setBankFinanceAccountId(value)}
                kind="BANK"
                required
                help={
                  <FieldHelp
                    meaning={
                      <>
                        Select the BANK finance account that owns this statement evidence. This only attributes evidence; it does not
                        post accounting or mutate payment/receipt/movement records.
                      </>
                    }
                  />
                }
              />
              <label className="text-sm text-muted-foreground">
                Statement period from
                <input
                  type="date"
                  name="statement_period_from"
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                  required
                />
              </label>
              <label className="text-sm text-muted-foreground">
                Statement period to
                <input
                  type="date"
                  name="statement_period_to"
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                  required
                />
              </label>
              <label className="text-sm text-muted-foreground">
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

        {loading ? <ERPLoadingState label="Loading bank imports..." /> : null}
        {!loading && error ? (
          <ERPErrorState title="Bank imports unavailable" description={error} onRetry={() => void fetchData()} />
        ) : null}
        {!loading && !error && imports.length === 0 ? (
          <ERPEmptyState
            title="No bank imports found"
            description="Upload a bank statement CSV to create evidence records and parsed lines."
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
                  Period
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
                      {imp.bank_finance_account_name ?? `#${imp.bank_finance_account}`}
                    </div>
                    <div className="text-xs text-muted-foreground">ID {imp.bank_finance_account}</div>
                  </td>
                  <td className="p-3 text-sm text-foreground">
                    {imp.statement_period_from} → {imp.statement_period_to}
                  </td>
                  <td className="p-3 text-sm">
                    <ERPStatusBadge status={imp.status} />
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">{imp.checksum}</td>
                  <td className="p-3 text-sm text-muted-foreground">{imp.uploaded_at}</td>
                  <td className="p-3 text-right text-sm">
                    <Link
                      href={`${ROUTES.admin.settlementsBankImports}/${imp.id}`}
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
