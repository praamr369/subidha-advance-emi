"use client";

import Link from "next/link";
import { useState, type ChangeEvent } from "react";

import ErrorState from "@/components/feedback/ErrorState";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  postBranchImport,
  postCounterImport,
  postChartOfAccountsImport,
  postEmployeeImport,
  postVendorImport,
  previewBranchImport,
  previewCounterImport,
  previewChartOfAccountsImport,
  previewEmployeeImport,
  previewVendorImport,
  type ImportPostResponse,
  type ImportPreviewResponse,
} from "@/services/import-hub";

type ImportKey = "chartOfAccounts" | "vendors" | "employees" | "branches" | "counters";

function UploadPanel({
  title,
  description,
  file,
  preview,
  result,
  loading,
  onFileChange,
  onPreview,
  onPost,
}: {
  title: string;
  description: string;
  file: File | null;
  preview: ImportPreviewResponse | null;
  result: ImportPostResponse | null;
  loading: boolean;
  onFileChange: (file: File | null) => void;
  onPreview: () => void;
  onPost: () => void;
}) {
  const readyToPost = Boolean(file && preview && preview.invalid_count === 0);

  return (
    <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
      <div className="text-base font-semibold text-foreground">{title}</div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      <div className="mt-4 space-y-3">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onFileChange(event.target.files?.[0] ?? null)
          }
          className="block w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <div className="flex flex-wrap gap-2">
          <ActionButton variant="secondary" onClick={onPreview} loading={loading} disabled={!file}>
            Preview
          </ActionButton>
          <ActionButton
            variant="primary"
            onClick={onPost}
            loading={loading}
            disabled={!readyToPost}
          >
            Post Import
          </ActionButton>
        </div>
        {!preview ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Preview is required before posting this import.
          </div>
        ) : null}
        {preview ? (
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Valid {preview.valid_count} • Invalid {preview.invalid_count}
          </div>
        ) : null}
        {preview?.errors.length ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="font-medium">Preview errors</div>
            <ul className="mt-2 space-y-1">
              {preview.errors.slice(0, 5).map((row, index) => (
                <li key={`${row.row_number}-${index}`}>
                  Row {row.row_number ?? "header"}: {row.errors.join(", ")}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {result ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Created {result.created} • Updated {result.updated} • Skipped {result.skipped}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminSettingsImportsPage() {
  const [error, setError] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<ImportKey | null>(null);
  const [files, setFiles] = useState<Record<ImportKey, File | null>>({
    chartOfAccounts: null,
    vendors: null,
    employees: null,
    branches: null,
    counters: null,
  });
  const [previews, setPreviews] = useState<Record<ImportKey, ImportPreviewResponse | null>>({
    chartOfAccounts: null,
    vendors: null,
    employees: null,
    branches: null,
    counters: null,
  });
  const [results, setResults] = useState<Record<ImportKey, ImportPostResponse | null>>({
    chartOfAccounts: null,
    vendors: null,
    employees: null,
    branches: null,
    counters: null,
  });

  function setSelectedFile(key: ImportKey, file: File | null) {
    setFiles((current) => ({ ...current, [key]: file }));
    setPreviews((current) => ({ ...current, [key]: null }));
    setResults((current) => ({ ...current, [key]: null }));
    setError(null);
  }

  async function handlePreview(key: ImportKey) {
    const file = files[key];
    if (!file) return;
    setLoadingKey(key);
    try {
      const payload =
        key === "chartOfAccounts"
          ? await previewChartOfAccountsImport(file)
          : key === "vendors"
            ? await previewVendorImport(file)
            : key === "employees"
              ? await previewEmployeeImport(file)
              : key === "branches"
                ? await previewBranchImport(file)
                : await previewCounterImport(file);
      setPreviews((current) => ({ ...current, [key]: payload }));
      setResults((current) => ({ ...current, [key]: null }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import preview failed.");
    } finally {
      setLoadingKey(null);
    }
  }

  async function handlePost(key: ImportKey) {
    const file = files[key];
    if (!file) return;
    const preview = previews[key];
    if (!preview) {
      setError("Run preview first so the current file is validated before posting.");
      return;
    }
    if (preview.invalid_count > 0) {
      setError("Resolve preview errors before posting the import.");
      return;
    }
    setLoadingKey(key);
    try {
      const payload =
        key === "chartOfAccounts"
          ? await postChartOfAccountsImport(file)
          : key === "vendors"
            ? await postVendorImport(file)
            : key === "employees"
              ? await postEmployeeImport(file)
              : key === "branches"
                ? await postBranchImport(file)
                : await postCounterImport(file);
      setResults((current) => ({ ...current, [key]: payload }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import post failed.");
    } finally {
      setLoadingKey(null);
    }
  }

  return (
    <PortalPage
      title="Import Hub"
      subtitle="Use preview and post flows for master-data imports. Live Lucky Plan finance history remains unchanged by these imports."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Settings", href: ROUTES.admin.settings },
        { label: "Imports" },
      ]}
      actions={[
        { href: ROUTES.admin.products, label: "Products", variant: "secondary" },
        { href: ROUTES.admin.inventoryOpeningStock, label: "Opening Stock", variant: "secondary" },
      ]}
      stats={[
        { label: "Live Import Panels", value: "8", tone: "info" },
        { label: "Preview-First Masters", value: "5", tone: "info" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        {error ? <ErrorState title="Import action failed" description={error} /> : null}

        <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
          Before wide exports or selective resets, run validation in the{" "}
          <Link href={ROUTES.admin.settingsBusinessSetupDryRuns} className="font-semibold text-primary hover:underline">
            Dry Run Control Center
          </Link>{" "}
          (read-only; no packages stored there).
        </div>

        <WorkspaceSection
          title="Existing import flows"
          description="These routes already exist in the repo and remain the canonical operator flows for product master and opening stock imports."
          contentClassName="grid gap-4 md:grid-cols-2"
        >
          <Link
            href="/admin/customers"
            className="rounded-xl border border-border bg-background p-5 shadow-sm transition hover:border-ring hover:bg-accent/40"
          >
            <div className="text-base font-semibold text-foreground">Customer import</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Preview and confirm customer profile preload from the customer workspace. Keep subscription onboarding separate and controlled.
            </p>
          </Link>
          <Link
            href="/admin/products/import"
            className="rounded-xl border border-border bg-background p-5 shadow-sm transition hover:border-ring hover:bg-accent/40"
          >
            <div className="text-base font-semibold text-foreground">Product catalog import</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Import product code, name, category, subcategory, SKU, unit of measure, price, and plan-mode flags.
            </p>
          </Link>
          <Link
            href={ROUTES.admin.inventoryOpeningStock}
            className="rounded-xl border border-border bg-background p-5 shadow-sm transition hover:border-ring hover:bg-accent/40"
          >
            <div className="text-base font-semibold text-foreground">Opening stock import</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Preview and post stock-on-hand baselines into the additive stock ledger with explicit dates and auditability.
            </p>
          </Link>
        </WorkspaceSection>

        <WorkspaceSection
          title="Finance master imports"
          description="These additive imports update accounting masters only. They do not rewrite Payment, EMI, FinancialLedger, or subscription history."
          contentClassName="grid gap-4 xl:grid-cols-2"
        >
          <UploadPanel
            title="Chart of Accounts CSV"
            description="Import or update chart accounts by code, with optional parent linkage and system-code preservation."
            file={files.chartOfAccounts}
            preview={previews.chartOfAccounts}
            result={results.chartOfAccounts}
            loading={loadingKey === "chartOfAccounts"}
            onFileChange={(file) => setSelectedFile("chartOfAccounts", file)}
            onPreview={() => void handlePreview("chartOfAccounts")}
            onPost={() => void handlePost("chartOfAccounts")}
          />

          <UploadPanel
            title="Vendor master CSV"
            description="Import or update vendor masters using GSTIN, email, phone, or safe exact-name matching when unambiguous."
            file={files.vendors}
            preview={previews.vendors}
            result={results.vendors}
            loading={loadingKey === "vendors"}
            onFileChange={(file) => setSelectedFile("vendors", file)}
            onPreview={() => void handlePreview("vendors")}
            onPost={() => void handlePost("vendors")}
          />

          <UploadPanel
            title="Staff master CSV"
            description="Import or update employee master records with branch, joining date, salary baseline, and payroll-ready workforce metadata. This does not post salary, reimbursement, or attendance money events."
            file={files.employees}
            preview={previews.employees}
            result={results.employees}
            loading={loadingKey === "employees"}
            onFileChange={(file) => setSelectedFile("employees", file)}
            onPreview={() => void handlePreview("employees")}
            onPost={() => void handlePost("employees")}
          />
        </WorkspaceSection>

        <WorkspaceSection
          title="Branch rollout imports"
          description="Use these only for governed branch and counter setup. They create or update masters; they do not post collections, stock, or accounting history."
          contentClassName="grid gap-4 xl:grid-cols-2"
        >
          <UploadPanel
            title="Branch master CSV"
            description="Import or update branch code, name, status, and primary-branch posture. Existing single-branch behavior remains backward-compatible through the primary branch."
            file={files.branches}
            preview={previews.branches}
            result={results.branches}
            loading={loadingKey === "branches"}
            onFileChange={(file) => setSelectedFile("branches", file)}
            onPreview={() => void handlePreview("branches")}
            onPost={() => void handlePost("branches")}
          />

          <UploadPanel
            title="Counter / cash-desk CSV"
            description="Import or update counters with branch code, finance account mapping, and optional cashier username assignment. Counter import never posts payment rows."
            file={files.counters}
            preview={previews.counters}
            result={results.counters}
            loading={loadingKey === "counters"}
            onFileChange={(file) => setSelectedFile("counters", file)}
            onPreview={() => void handlePreview("counters")}
            onPost={() => void handlePost("counters")}
          />
        </WorkspaceSection>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          Subscription bulk import remains intentionally unavailable here. Opening-balance bulk import is also deferred. Those flows would risk bypassing EMI, reconciliation, posting, or audit controls if they were reduced to unchecked CSV writes.
        </div>
      </div>
    </PortalPage>
  );
}
