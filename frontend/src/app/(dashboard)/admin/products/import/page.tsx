"use client";

import Link from "next/link";
import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";

import ERPMetricStrip from "@/components/erp/ERPMetricStrip";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { DataTableShell } from "@/components/ui/operations";
import { normalizeApiError } from "@/services/api/errors";
import {
  postProductImport,
  previewProductImport,
  type ImportPreviewResponse,
} from "@/services/import-hub";

type ProductImportResponse = {
  created?: number;
  updated?: number;
  skipped?: number;
  source?: string;
  message?: string;
  errors?: string[];
};

export default function AdminProductImportPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ProductImportResponse | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);

  const selectedFileMeta = useMemo(() => {
    if (!file) return null;

    const sizeInKb = file.size / 1024;
    const prettySize =
      sizeInKb < 1024
        ? `${sizeInKb.toFixed(1)} KB`
        : `${(sizeInKb / 1024).toFixed(2)} MB`;

    return {
      name: file.name,
      size: prettySize,
      type: file.type || "text/csv",
    };
  }, [file]);

  function resetMessages() {
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function onSelectFile(nextFile: File | null) {
    resetMessages();
    setResult(null);
    setPreview(null);

    if (!nextFile) {
      setFile(null);
      return;
    }

    const isCsv =
      nextFile.type === "text/csv" ||
      nextFile.name.toLowerCase().endsWith(".csv");

    if (!isCsv) {
      setFile(null);
      setErrorMessage("Please select a valid CSV file.");
      return;
    }

    setFile(nextFile);
  }

  function onFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    onSelectFile(nextFile);
  }

  function onDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(true);
  }

  function onDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);

    const nextFile = event.dataTransfer.files?.[0] ?? null;
    onSelectFile(nextFile);
  }

  async function handleUploadImport() {
    resetMessages();
    setResult(null);

    if (!file) {
      setErrorMessage("Select a CSV file first.");
      return;
    }
    if (!preview) {
      setErrorMessage("Run preview first so the current file is validated before import.");
      return;
    }
    if (preview.invalid_count > 0) {
      setErrorMessage("Resolve preview errors before posting the product import.");
      return;
    }

    setIsUploading(true);

    try {
      const response = await postProductImport(file);

      setResult(response);
      setSuccessMessage(
        `Product import completed from uploaded CSV${
          response.source ? ` (${response.source})` : ""
        }.`
      );
      setPreview(null);
    } catch (error) {
      const normalized = normalizeApiError(error);
      setErrorMessage(normalized.message || "Failed to import products.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handlePreviewImport() {
    resetMessages();
    setResult(null);

    if (!file) {
      setErrorMessage("Select a CSV file first.");
      return;
    }

    setIsPreviewing(true);
    try {
      const response = await previewProductImport(file);
      setPreview(response);
      setSuccessMessage(
        response.invalid_count > 0
          ? "Preview generated. Resolve the invalid rows before importing."
          : `Preview ready. ${response.valid_count} row${response.valid_count === 1 ? "" : "s"} can be posted safely.`
      );
    } catch (error) {
      const normalized = normalizeApiError(error);
      setPreview(null);
      setErrorMessage(normalized.message || "Failed to preview product import.");
    } finally {
      setIsPreviewing(false);
    }
  }

  function handleClear() {
    setFile(null);
    setResult(null);
    setPreview(null);
    resetMessages();

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <ERPPageShell
      title="Import Products"
      subtitle="Bulk import product master data with category, sub-category, SKU, unit, description, and pricing while keeping product master as the shared catalog truth for subscriptions and future inventory."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Products", href: "/admin/products" },
        { label: "Import" },
      ]}
      actions={[
        {
          label: "Back to Products",
          href: "/admin/products",
          variant: "secondary",
        },
        {
          label: "Create Product",
          href: "/admin/products/create",
          variant: "primary",
        },
      ]}
      stats={[
        {
          label: "Preview ready",
          value: preview ? "Yes" : "No",
          tone: preview ? "info" : "default",
        },
        {
          label: "Created",
          value: result?.created ?? 0,
          tone: (result?.created ?? 0) > 0 ? "success" : "default",
        },
        {
          label: "Updated",
          value: result?.updated ?? 0,
          tone: (result?.updated ?? 0) > 0 ? "info" : "default",
        },
        {
          label: "Preview errors",
          value: preview?.invalid_count ?? 0,
          tone: (preview?.invalid_count ?? 0) > 0 ? "warning" : "default",
        },
      ]}
    >
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Upload CSV</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Import products using CSV. This page is structured for the real
                product catalog fields used in daily operations: name, category,
                sub-category, SKU, unit of measure, description, and base price.
                Imported catalog values stay aligned with the managed product
                masters instead of creating a second product truth.
              </p>
            </div>

            <label
              htmlFor="product-import-file"
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={[
                "block cursor-pointer rounded-xl border-2 border-dashed p-6 transition",
                dragActive
                  ? "border-slate-500 bg-slate-50"
                  : "border-slate-300 bg-slate-50/60 hover:border-slate-400 hover:bg-slate-50",
              ].join(" ")}
            >
              <input
                ref={inputRef}
                id="product-import-file"
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={onFileInputChange}
              />

              <div className="space-y-2 text-center">
                <div className="text-sm font-medium text-slate-900">
                  Drag and drop a CSV here
                </div>
                <div className="text-sm text-slate-500">
                  or click to browse for a file
                </div>
              </div>
            </label>

            {selectedFileMeta ? (
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-slate-900">
                  Selected file
                </div>
                <div className="mt-2 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                  <div>
                    <span className="font-medium text-slate-700">Name:</span>{" "}
                    {selectedFileMeta.name}
                  </div>
                  <div>
                    <span className="font-medium text-slate-700">Size:</span>{" "}
                    {selectedFileMeta.size}
                  </div>
                  <div>
                    <span className="font-medium text-slate-700">Type:</span>{" "}
                    {selectedFileMeta.type}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handlePreviewImport}
                disabled={isPreviewing || isUploading || !file}
                className="inline-flex h-11 items-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPreviewing ? "Previewing..." : "Preview Uploaded CSV"}
              </button>

              <button
                type="button"
                onClick={handleUploadImport}
                disabled={
                  isUploading ||
                  isPreviewing ||
                  !file ||
                  !preview ||
                  preview.invalid_count > 0
                }
                className="inline-flex h-11 items-center rounded-xl bg-slate-900 px-5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUploading ? "Importing..." : "Import Uploaded CSV"}
              </button>

              <button
                type="button"
                onClick={handleClear}
                disabled={isUploading || isPreviewing}
                className="inline-flex h-11 items-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Clear
              </button>
            </div>

            {successMessage ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {successMessage}
              </div>
            ) : null}

            {errorMessage ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              Uploaded CSV preview is now the governed operator path. The legacy server-default CSV shortcut remains backend-compatible for transition, but it is intentionally not exposed here for go-live use.
            </div>

            {result?.errors?.length ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="text-sm font-medium text-amber-900">
                  Import notices
                </div>
                <ul className="mt-2 space-y-1 text-sm text-amber-800">
                  {result.errors.map((item, index) => (
                    <li key={`${item}-${index}`}>• {item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">
                Expected CSV columns
              </h3>

              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  "product_code",
                  "name",
                  "category",
                  "sub_category",
                  "sku",
                  "unit_of_measure",
                  "description",
                  "base_price",
                  "image",
                ].map((column) => (
                  <span
                    key={column}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                  >
                    {column}
                  </span>
                ))}
              </div>

              <p className="mt-3 text-sm leading-6 text-slate-600">
                Category and sub-category should be included in the CSV so product
                master data remains structured for filtering, inventory, billing,
                and future rental or leasing expansion. Base price remains the total
                contract price.
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Safe rollout rule: preview first, then import. The import will not
                post if preview still shows invalid rows.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">
                Preview and result summary
              </h3>

              <div className="mt-4">
                <ERPMetricStrip
                  className="md:grid-cols-2 xl:grid-cols-2"
                  metrics={[
                    {
                      label: "Preview Valid",
                      value: preview?.valid_count ?? 0,
                      detail:
                        (preview?.valid_count ?? 0) > 0
                          ? "Ready to import when no invalid rows remain."
                          : "Run preview after selecting a CSV.",
                    },
                    {
                      label: "Created",
                      value: result?.created ?? 0,
                      detail: "Products created on last successful import.",
                    },
                    {
                      label: "Updated",
                      value: result?.updated ?? 0,
                      detail: "Products updated on last successful import.",
                    },
                    {
                      label: "Preview Invalid",
                      value: preview?.invalid_count ?? result?.skipped ?? 0,
                      detail: "Rows blocked until corrected or skipped per backend rules.",
                      className:
                        (preview?.invalid_count ?? result?.skipped ?? 0) > 0 ? "ring-1 ring-amber-200" : undefined,
                    },
                  ]}
                />
              </div>

              {preview ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                  <div className="font-medium text-slate-900">
                    Create candidates {preview.preview_rows.filter((row) => row.action === "create").length} ·
                    Update candidates {preview.preview_rows.filter((row) => row.action === "update").length}
                  </div>
                  {preview.errors.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-amber-800">
                      {preview.errors.slice(0, 5).map((item, index) => (
                        <li key={`${item.row_number}-${index}`}>Row {item.row_number}: {item.errors.join(", ")}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-slate-600">No blocking preview errors detected.</p>
                  )}
                </div>
              ) : null}

              {result?.source ? (
                <p className="mt-4 text-sm text-slate-600">
                  Source:{" "}
                  <span className="font-medium text-slate-900">{result.source}</span>
                </p>
              ) : null}

              {result?.message ? (
                <p className="mt-2 text-sm text-slate-600">{result.message}</p>
              ) : null}
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-amber-800">
                Operational note
              </h3>
              <p className="mt-2 text-sm leading-6 text-amber-800">
                This import page only affects product master data. It does not touch
                subscriptions, EMI schedules, payments, waivers, commission,
                reconciliation, or audit history.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <ERPSectionShell
        title="Sample CSV format"
        description="Reference row shape for operator CSV authoring. Uses the same columns as the governed import path."
      >
        <DataTableShell>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3">product_code</th>
                  <th className="px-4 py-3">name</th>
                  <th className="px-4 py-3">category</th>
                  <th className="px-4 py-3">sub_category</th>
                  <th className="px-4 py-3">sku</th>
                  <th className="px-4 py-3">unit_of_measure</th>
                  <th className="px-4 py-3">description</th>
                  <th className="px-4 py-3">base_price</th>
                  <th className="px-4 py-3">image</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-200">
                  <td className="px-4 py-3">BED-001</td>
                  <td className="px-4 py-3">Wooden King Bed</td>
                  <td className="px-4 py-3">Bed</td>
                  <td className="px-4 py-3">Wooden Carving Bed</td>
                  <td className="px-4 py-3">BED-KING-001</td>
                  <td className="px-4 py-3">PCS</td>
                  <td className="px-4 py-3">
                    Premium wooden carving king size bed
                  </td>
                  <td className="px-4 py-3">35000</td>
                  <td className="px-4 py-3">wooden-king-bed.jpg</td>
                </tr>
                <tr className="border-t border-slate-200">
                  <td className="px-4 py-3">ALM-002</td>
                  <td className="px-4 py-3">Steel Almirah</td>
                  <td className="px-4 py-3">Almirah</td>
                  <td className="px-4 py-3">Steel Almirah</td>
                  <td className="px-4 py-3">ALM-STEEL-002</td>
                  <td className="px-4 py-3">PCS</td>
                  <td className="px-4 py-3">
                    Double door heavy gauge steel almirah
                  </td>
                  <td className="px-4 py-3">18500</td>
                  <td className="px-4 py-3">steel-almirah.jpg</td>
                </tr>
              </tbody>
            </table>
          </div>
        </DataTableShell>

        <div className="mt-4 text-sm text-slate-600">
          After import, review the result in{" "}
          <Link
            href="/admin/products"
            className="font-medium text-blue-600 hover:underline"
          >
            Products
          </Link>
          .
        </div>
      </ERPSectionShell>
    </ERPPageShell>
  );
}
