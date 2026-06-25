"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Filter, FileDown, FileText } from "lucide-react";
import { useParams } from "next/navigation";

import type { EnterpriseColumnDef, GenericRecord } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ERPAuditNote from "@/components/erp/ERPAuditNote";
import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import DrawerShell from "@/components/ui/DrawerShell";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import StatCard from "@/components/ui/StatCard";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { downloadAuthenticatedFile } from "@/lib/export/auth-download";
import { ROUTES } from "@/lib/routes";
import {
  fetchReportCenterReport,
  reportCenterExportPath,
  type ReportCenterPayload,
} from "@/services/reports-center";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Failed to load report.";
}

export default function AdminReportCenterDetailPage() {
  const params = useParams<{ reportKey: string }>();
  const reportKey = decodeURIComponent(params.reportKey || "");

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<GenericRecord | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [branchId, setBranchId] = useState("");
  const [collectedById, setCollectedById] = useState("");

  const [payload, setPayload] = useState<ReportCenterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      branch_id: branchId || undefined,
      collected_by_id: collectedById || undefined,
    }),
    [dateFrom, dateTo, branchId, collectedById]
  );

  const load = useCallback(async () => {
    if (!reportKey) return;
    setLoading(true);
    try {
      const data = await fetchReportCenterReport(reportKey, query);
      setPayload(data);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [reportKey, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: EnterpriseColumnDef<GenericRecord>[] = useMemo(() => {
    if (!payload?.columns?.length) return [];
    return payload.columns.map((c) => ({
      key: c.key,
      header: c.header,
    }));
  }, [payload]);

  const rows = useMemo(() => (payload?.rows ?? []) as GenericRecord[], [payload]);

  async function onExport(format: "csv" | "pdf") {
    const q: Record<string, string> = {};
    if (dateFrom) q.date_from = dateFrom;
    if (dateTo) q.date_to = dateTo;
    if (branchId) q.branch_id = branchId;
    if (collectedById) q.collected_by_id = collectedById;
    setExporting(format);
    try {
      await downloadAuthenticatedFile(reportCenterExportPath(reportKey, format, q), `report-${reportKey}.${format}`);
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setExporting(null);
    }
  }

  return (
    <ERPPageShell
      eyebrow="BI & Reports"
      title={payload?.title || reportKey || "Report"}
      subtitle="Read-only dataset. Exports require the reports.export capability."
      headerMode="erp"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Reports & analysis", href: `${ROUTES.admin.reports}?catalog=1` },
        { label: payload?.title || reportKey },
      ]}
      actions={[
        {
          href: `${ROUTES.admin.reports}?catalog=1`,
          label: "Back to reports hub",
          variant: "secondary",
        },
      ]}
    >
      <ERPDataToolbar
        left={
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton type="button" variant="secondary" onClick={() => setFiltersOpen(true)}>
              <Filter className="mr-2 h-4 w-4" />
              Filters
            </ActionButton>
            <ActionButton type="button" variant="secondary" disabled={!!exporting} onClick={() => void onExport("csv")}>
              <FileDown className="mr-2 h-4 w-4" />
              {exporting === "csv" ? "Exporting…" : "Export CSV"}
            </ActionButton>
            <ActionButton type="button" variant="secondary" disabled={!!exporting} onClick={() => void onExport("pdf")}>
              <FileText className="mr-2 h-4 w-4" />
              {exporting === "pdf" ? "Exporting…" : "Export PDF summary"}
            </ActionButton>
          </div>
        }
        right={
          <div className="hidden min-h-10 items-center sm:flex">
            <span className="text-xs text-muted-foreground">
              Saved views: <em>placeholder</em> — presets will attach here in a future release.
            </span>
          </div>
        }
      />

      <div className="sm:hidden">
        <ERPAuditNote title="Saved views" tone="info">
          Presets will attach here in a future release. (Currently a placeholder label.)
        </ERPAuditNote>
      </div>

      {payload?.branch_placeholder ? (
        <p className="mt-3 text-xs text-muted-foreground">{payload.branch_placeholder}</p>
      ) : null}

      {loading && <LoadingBlock label="Running report…" />}
      {error && <ErrorState title="Report error" message={error} onRetry={() => void load()} />}

      {!loading && !error && payload && (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {payload.summary.map((s) => (
              <StatCard key={s.label} label={s.label} value={s.value} tone="info" />
            ))}
          </div>
          <EnterpriseDataTable
            title="Results"
            subtitle="Select a row for raw detail."
            data={rows}
            columns={columns}
            onRowClick={(row) => {
              setDetailRow(row);
              setDetailOpen(true);
            }}
            toolbar={
              <ActionButton type="button" variant="secondary" onClick={() => void load()}>
                Apply / refresh
              </ActionButton>
            }
            emptyTitle="No rows"
            emptyDescription="Adjust filters or widen the date window."
          />
        </div>
      )}

      <DrawerShell
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Report filters"
        description="Branch filter is passed through when the underlying model supports branch_id."
        size="wide"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            date_from
            <input
              type="date"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            date_to
            <input
              type="date"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            branch_id (optional)
            <input
              type="number"
              min={1}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              placeholder="Placeholder — numeric branch key"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            collected_by_id (cashier reports)
            <input
              type="number"
              min={1}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={collectedById}
              onChange={(e) => setCollectedById(e.target.value)}
              placeholder="User id of collector"
            />
          </label>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <ActionButton type="button" variant="primary" onClick={() => { setFiltersOpen(false); void load(); }}>
            Apply filters
          </ActionButton>
          <ActionButton
            type="button"
            variant="secondary"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setBranchId("");
              setCollectedById("");
            }}
          >
            Clear
          </ActionButton>
        </div>
      </DrawerShell>

      <DrawerShell
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="Row detail"
        description="Read-only snapshot of the selected row."
        size="compact"
      >
        {detailRow ? (
          <pre className="max-h-[60vh] overflow-auto rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            {JSON.stringify(detailRow, null, 2)}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">No row selected.</p>
        )}
      </DrawerShell>
    </ERPPageShell>
  );
}
