"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";

import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  postOpeningStockImport,
  previewOpeningStockImport,
  type OpeningStockPreview,
} from "@/services/inventory";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function InventoryOpeningStockPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [asOfDate, setAsOfDate] = useState(todayIso());
  const [preview, setPreview] = useState<OpeningStockPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canPreview = Boolean(file) && !loading && !posting;
  const canPost = Boolean(file) && Boolean(preview) && (preview?.error_rows ?? 0) === 0 && !posting;

  const stats = useMemo<
    { label: string; value: string; tone?: "default" | "success" | "warning" | "info" }[]
  >(
    () => [
      { label: "Selected File", value: file ? "Ready" : "None", tone: file ? "info" : "default" },
      { label: "Ready Rows", value: String(preview?.ready_rows ?? 0), tone: (preview?.ready_rows ?? 0) > 0 ? "success" : "default" },
      { label: "Error Rows", value: String(preview?.error_rows ?? 0), tone: (preview?.error_rows ?? 0) > 0 ? "warning" : "default" },
      { label: "As Of Date", value: asOfDate, tone: "info" },
    ],
    [asOfDate, file, preview]
  );

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setPreview(null);
    setError(null);
    setSuccess(null);
  }

  async function handlePreview() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = await previewOpeningStockImport(file);
      setPreview(payload);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Failed to preview opening stock import.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePost() {
    if (!file) return;
    setPosting(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = await postOpeningStockImport(file, asOfDate);
      setSuccess(
        `Opening stock posted for ${payload.processed_rows} row(s). Created ${payload.created_count} movement(s), skipped ${payload.existing_count} duplicate row(s).`
      );
      setPreview(null);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post opening stock import.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <PortalPage
      title="Opening Stock Import"
      subtitle="Preview and post opening stock as explicit inventory ledger movements without rewriting existing product or delivery history."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Opening Stock Import" },
      ]}
      actions={[
        { href: ROUTES.admin.inventoryStockOnHand, label: "Stock On Hand", variant: "secondary" },
        { href: ROUTES.admin.inventoryLedger, label: "Stock Ledger", variant: "secondary" },
      ]}
      stats={stats}
    >
      <div className="space-y-6">
        <WorkspaceSection
          title="Upload Opening Stock"
          description="Accepted CSV columns: product_code or sku, quantity, optional location_code/location_name, optional notes."
        >
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onFileChange}
              className="rounded-xl border border-border bg-background px-4 py-2 text-sm"
            />
            <input
              type="date"
              value={asOfDate}
              onChange={(event) => setAsOfDate(event.target.value)}
              className="rounded-xl border border-border bg-background px-4 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void handlePreview()}
              disabled={!canPreview}
              className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Previewing..." : "Preview"}
            </button>
            <button
              type="button"
              onClick={() => void handlePost()}
              disabled={!canPost}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {posting ? "Posting..." : "Post Opening Stock"}
            </button>
          </div>
          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
          {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}
        </WorkspaceSection>

        <WorkspaceSection
          title="Preview Rows"
          description="Rows must be error-free before posting. Re-running the same file/date combination is duplicate-safe at the ledger level."
        >
          {preview ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Row</th>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Quantity</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={`${row.row}-${row.inventory_item_id ?? "none"}`} className="border-t border-border">
                      <td className="px-4 py-3">{row.row}</td>
                      <td className="px-4 py-3">{row.product_code || "—"}</td>
                      <td className="px-4 py-3">{row.sku || "—"}</td>
                      <td className="px-4 py-3">{row.quantity || "—"}</td>
                      <td className="px-4 py-3">{row.location_name || row.location_code || "Default"}</td>
                      <td className="px-4 py-3">{row.action}</td>
                      <td className="px-4 py-3">{row.message || "Ready"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Upload a CSV and preview it before posting any opening stock movements.
            </p>
          )}
        </WorkspaceSection>
      </div>
    </PortalPage>
  );
}
