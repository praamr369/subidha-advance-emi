"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { EnterpriseColumnDef, GenericRecord } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import RegisterPrintDocument from "@/components/print/RegisterPrintDocument";
import PrintActionBanner from "@/components/print/PrintActionBanner";
import {
  accountingDate,
  accountingErrorMessage,
  AccountingPeriodFilters,
  AccountingRefreshButton,
} from "@/components/accounting/shared";
import { ROUTES } from "@/lib/routes";

type RegisterReport<T extends GenericRecord> = {
  start_date: string | null;
  end_date: string | null;
  rows: T[];
};

type BookRegisterPageProps<T extends GenericRecord> = {
  title: string;
  subtitle: string;
  printTitle: string;
  fetchReport: (params: { start_date?: string; end_date?: string }) => Promise<RegisterReport<T>>;
  columns: EnterpriseColumnDef<T>[];
  toPrintRow: (row: T) => React.ReactNode[];
  breadcrumbs?: Array<{ label: string; href?: string }>;
};

export default function BookRegisterPage<T extends GenericRecord>({
  title,
  subtitle,
  printTitle,
  fetchReport,
  columns,
  toPrintRow,
  breadcrumbs,
}: BookRegisterPageProps<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rangeLabel, setRangeLabel] = useState("Current filter");
  const previewLimit = 12;

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const payload = await fetchReport({
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        });
        setRows(payload.rows);
        setRangeLabel(
          payload.start_date || payload.end_date
            ? `${accountingDate(payload.start_date)} to ${accountingDate(payload.end_date)}`
            : "All posted rows"
        );
        setError(null);
      } catch (err) {
        setError(accountingErrorMessage(err, `Failed to load ${title.toLowerCase()}.`));
        setRows([]);
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [endDate, fetchReport, startDate, title]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const printableRows = useMemo(
    () => rows.slice(0, previewLimit).map(toPrintRow),
    [previewLimit, rows, toPrintRow]
  );
  const overflowRows = Math.max(rows.length - previewLimit, 0);

  return (
    <PortalPage
      className="receipt-print-page"
      title={title}
      subtitle={subtitle}
      breadcrumbs={
        breadcrumbs ?? [
          { label: "Admin", href: ROUTES.admin.dashboard },
          { label: "Accounting", href: ROUTES.admin.accounting },
          { label: "Books", href: ROUTES.admin.accountingBooks },
          { label: title },
        ]
      }
      statusBadge={{ label: "Posted Data Only", tone: "info" }}
      stats={[
        { label: "Rows", value: String(rows.length) },
        { label: "Range", value: rangeLabel, tone: "info" },
      ]}
    >
      <WorkspaceSection
        className="receipt-print-hide"
        title={`${title} Filters`}
        description="Books remain powered from posted accounting journals and finalized operational registers only."
        action={<AccountingRefreshButton loading={loading} refreshing={refreshing} onClick={() => void loadPage("refresh")} />}
      >
        <AccountingPeriodFilters
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
      </WorkspaceSection>

      {loading ? <LoadingBlock label={`Loading ${title.toLowerCase()}...`} /> : null}

      <WorkspaceSection
        className="receipt-print-hide"
        title={title}
        description="Use the table for operational review and the print surface for branded export/print."
      >
        <EnterpriseDataTable
          data={rows}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={() => void loadPage("initial")}
          emptyTitle={`No ${title.toLowerCase()} rows found`}
          emptyDescription="Adjust the date filter or post new operational documents."
        />
      </WorkspaceSection>

      <PrintActionBanner
        className="mb-4"
        title="Register Print / PDF"
        description="Print this view for filing or save as PDF. The printable preview keeps the latest rows compact for one-page output."
      />

      <WorkspaceSection
        title="Printable Register"
        description="This print layout uses live rows and stays compact for one-page filing where possible."
      >
        <RegisterPrintDocument
          title={printTitle}
          subtitle={subtitle}
          reference={rangeLabel}
          headers={columns.map((column) => column.header)}
          rows={printableRows}
          footerNote={
            overflowRows > 0
              ? `Showing ${previewLimit} of ${rows.length} rows for compact print output. Use date filters to print additional slices without shrinking readability.`
              : undefined
          }
        />
      </WorkspaceSection>
    </PortalPage>
  );
}
