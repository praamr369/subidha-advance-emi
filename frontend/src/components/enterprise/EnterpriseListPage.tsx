"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EnterpriseColumnDef, GenericRecord } from "@/components/enterprise/columns";

import PortalPage from "@/components/ui/PortalPage";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { toArray } from "@/lib/api";
import { request } from "@/services/api";
import { previewCustomerImport, type CustomerImportPreviewResponse } from "@/domains/customers/api";
import { downloadCsv } from "@/lib/export/csv";
import { normalizeApiError } from "@/services/api/errors";

type FilterOption = { label: string; value: string };

type Props<T extends GenericRecord> = {
  title: string;
  subtitle: string;
  resourcePath: string;
  columns: EnterpriseColumnDef<T>[];
  statusFilterKey?: string;
  statusOptions?: FilterOption[];
};

export default function EnterpriseListPage<T extends GenericRecord>({
  title,
  subtitle,
  resourcePath,
  columns,
  statusFilterKey = "status",
  statusOptions = [
    { label: "All", value: "" },
    { label: "Active", value: "ACTIVE" },
    { label: "Pending", value: "PENDING" },
  ],
}: Props<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const [customerImportPreview, setCustomerImportPreview] = useState<CustomerImportPreviewResponse | null>(null);
  const [customerImportMessage, setCustomerImportMessage] = useState<string | null>(null);

  const reload = useCallback(() => setReloadKey((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = status ? { [statusFilterKey]: status } : undefined;
    const queryString = params ? new URLSearchParams(params as Record<string, string>).toString() : "";
    const url = queryString ? `${resourcePath}?${queryString}` : resourcePath;

    request<T[]>(url)
      .then((res) => {
        if (cancelled) return;
        setRows(toArray<T>(res));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRows([]);
        setError(normalizeApiError(err).message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [resourcePath, status, statusFilterKey, reloadKey]);

  const total = useMemo(() => rows.length, [rows]);

  const csvColumns = useMemo(() => {
    const first = rows[0] as Record<string, unknown> | undefined;
    if (!first) return [];
    return Object.keys(first).map((key) => ({ key, header: key }));
  }, [rows]);

  async function handleProductImport(): Promise<void> {
    if (!importFile) {
      setImportMessage("Select a CSV file first.");
      return;
    }

    setImporting(true);
    setImportMessage(null);

    const form = new FormData();
    form.append("file", importFile);

    try {
      const response = await request<Record<string, unknown>>("/admin/products/import-csv/", {
        method: "POST",
        body: form,
        retryCount: 0,
      });

      setImportMessage(`Import completed: ${JSON.stringify(response)}`);
      reload();
    } catch (err) {
      setImportMessage(normalizeApiError(err).message);
    } finally {
      setImporting(false);
    }
  }

  async function handleCustomerImportPreview(file: File | null): Promise<void> {
    setCustomerImportPreview(null);
    setCustomerImportMessage(null);

    if (!file) return;

    try {
      const preview = await previewCustomerImport(file);
      setCustomerImportPreview(preview);
      setCustomerImportMessage("Preview generated from backend validation endpoint.");
    } catch (err) {
      setCustomerImportMessage(normalizeApiError(err).message);
    }
  }

  return (
    <PortalPage title={title} subtitle={subtitle}>
      <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Total records</p>
            <p className="text-2xl font-semibold text-slate-900">{total}</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              Filter
              <select
                className="rounded-md border border-slate-300 px-2 py-1"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-1 text-sm"
              disabled={rows.length === 0}
              onClick={() =>
                downloadCsv(
                  `${title.toLowerCase().replace(/\s+/g, "-")}.csv`,
                  csvColumns,
                  rows,
                )
              }
            >
              Export CSV
            </button>
          </div>
        </div>

        {resourcePath === "/admin/products/" ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setImportFile(event.target.files?.[0] || null)}
            />
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-1 text-sm"
              onClick={handleProductImport}
              disabled={importing}
            >
              {importing ? "Importing..." : "Import Products CSV"}
            </button>
            {importMessage ? <span className="text-xs text-slate-600">{importMessage}</span> : null}
          </div>
        ) : null}

        {resourcePath === "/admin/customers/" ? (
          <div className="mt-3 border-t border-slate-200 pt-3">
            <p className="mb-2 text-sm font-medium text-slate-700">Customer Bulk Import Preview</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  handleCustomerImportPreview(file).catch(() => setCustomerImportMessage("Unable to generate import preview."));
                }}
              />
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-500"
                disabled
                title="Customer confirm-import endpoint is not available"
              >
                Confirm Import (Not Available Yet)
              </button>
            </div>

            {customerImportMessage ? <p className="mt-2 text-xs text-slate-600">{customerImportMessage}</p> : null}

            {customerImportPreview ? (
              <div className="mt-3 rounded border border-slate-200 p-2 text-xs">
                <p className="mb-1 text-slate-700">
                  Valid rows: <b>{customerImportPreview.valid_count}</b> · Invalid rows: <b>{customerImportPreview.invalid_count}</b>
                </p>
                <p className="mb-2 text-slate-700">Detected columns: {customerImportPreview.columns.join(", ") || "-"}</p>
                <div className="overflow-auto">
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr>
                        {customerImportPreview.columns.map((header) => (
                          <th key={header} className="border px-2 py-1 text-left">{header}</th>
                        ))}
                        <th className="border px-2 py-1 text-left">valid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerImportPreview.preview_rows.map((row) => (
                        <tr key={row.row_number}>
                          {customerImportPreview.columns.map((header) => (
                            <td key={`${row.row_number}-${header}`} className="border px-2 py-1">
                              {header === "name" ? row.name : header === "phone" ? row.phone : ""}
                            </td>
                          ))}
                          <td className="border px-2 py-1">{row.valid ? "yes" : "no"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {customerImportPreview.errors.length > 0 ? (
                  <div className="mt-3">
                    <p className="font-medium text-red-700">Row Errors</p>
                    <ul className="list-disc pl-5 text-red-700">
                      {customerImportPreview.errors.map((item, index) => (
                        <li key={`${item.row_number}-${index}`}>
                          Row {item.row_number ?? "header"}{item.phone ? ` (phone: ${item.phone})` : ""}: {item.errors.join(", ")}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <EnterpriseDataTable<T>
        data={rows}
        columns={columns}
        loading={loading}
        error={error}
        onRetry={reload}
      />
    </PortalPage>
  );
}
