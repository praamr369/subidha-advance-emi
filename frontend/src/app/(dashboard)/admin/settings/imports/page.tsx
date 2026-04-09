"use client";

import Link from "next/link";
import { useState, type ChangeEvent } from "react";

import ErrorState from "@/components/feedback/ErrorState";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  postChartOfAccountsImport,
  postVendorImport,
  previewChartOfAccountsImport,
  previewVendorImport,
  type ImportPostResponse,
  type ImportPreviewResponse,
} from "@/services/import-hub";

type ImportKey = "chartOfAccounts" | "vendors";

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
  return (
    <div className="rounded-[1.35rem] border border-border bg-background p-5 shadow-sm">
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
          <ActionButton variant="primary" onClick={onPost} loading={loading} disabled={!file}>
            Post Import
          </ActionButton>
        </div>
        {preview ? (
          <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Valid {preview.valid_count} • Invalid {preview.invalid_count}
          </div>
        ) : null}
        {result ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
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
  });
  const [previews, setPreviews] = useState<Record<ImportKey, ImportPreviewResponse | null>>({
    chartOfAccounts: null,
    vendors: null,
  });
  const [results, setResults] = useState<Record<ImportKey, ImportPostResponse | null>>({
    chartOfAccounts: null,
    vendors: null,
  });

  async function handlePreview(key: ImportKey) {
    const file = files[key];
    if (!file) return;
    setLoadingKey(key);
    try {
      const payload =
        key === "chartOfAccounts"
          ? await previewChartOfAccountsImport(file)
          : await previewVendorImport(file);
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
    setLoadingKey(key);
    try {
      const payload =
        key === "chartOfAccounts"
          ? await postChartOfAccountsImport(file)
          : await postVendorImport(file);
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
        { label: "Live Import Panels", value: "4", tone: "info" },
        { label: "Master CSV Imports", value: "2", tone: "info" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        {error ? <ErrorState title="Import action failed" description={error} /> : null}

        <WorkspaceSection
          title="Existing import flows"
          description="These routes already exist in the repo and remain the canonical operator flows for product master and opening stock imports."
          contentClassName="grid gap-4 md:grid-cols-2"
        >
          <Link
            href="/admin/products/import"
            className="rounded-[1.35rem] border border-border bg-background p-5 shadow-sm transition hover:border-ring hover:bg-accent/40"
          >
            <div className="text-base font-semibold text-foreground">Product catalog import</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Import product code, name, category, subcategory, SKU, unit of measure, price, and plan-mode flags.
            </p>
          </Link>
          <Link
            href={ROUTES.admin.inventoryOpeningStock}
            className="rounded-[1.35rem] border border-border bg-background p-5 shadow-sm transition hover:border-ring hover:bg-accent/40"
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
            onFileChange={(file) =>
              setFiles((current) => ({ ...current, chartOfAccounts: file }))
            }
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
            onFileChange={(file) => setFiles((current) => ({ ...current, vendors: file }))}
            onPreview={() => void handlePreview("vendors")}
            onPost={() => void handlePost("vendors")}
          />
        </WorkspaceSection>

        <div className="rounded-[1.35rem] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          Opening-balance bulk import is intentionally deferred here. Changing balances on finance accounts that already have posted activity would risk creating a second uncontrolled truth source, so that flow should stay controlled and case-by-case until an approved posting-safe policy exists.
        </div>
      </div>
    </PortalPage>
  );
}
