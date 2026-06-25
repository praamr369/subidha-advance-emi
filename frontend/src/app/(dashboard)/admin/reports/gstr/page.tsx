"use client";

import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import {
  buildGstrCsvUrl,
  getGstrReport,
  reconcileGstr2b,
  type Gstr2bMatchedRow,
  type Gstr2bNotInBooksRow,
  type Gstr2bNotIn2bRow,
  type Gstr2bReconcileResult,
  type Gstr2bRow,
  type GstrReport,
} from "@/services/gstr-recovery";

function fmt(v: string | undefined): string {
  if (!v) return "₹0.00";
  return `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusChip(s: string) {
  if (s === "MATCHED") return "bg-green-100 text-green-800 border border-green-200";
  if (s === "DISCREPANCY") return "bg-amber-100 text-amber-800 border border-amber-200";
  if (s === "NOT_IN_BOOKS") return "bg-red-100 text-red-800 border border-red-200";
  if (s === "NOT_IN_2B") return "bg-blue-100 text-blue-800 border border-blue-200";
  return "bg-muted text-foreground";
}

function Gstr2bReconcileTab({
  jsonText,
  onJsonChange,
  loading,
  error,
  result,
  onRun,
}: {
  jsonText: string;
  onJsonChange: (v: string) => void;
  loading: boolean;
  error: string | null;
  result: Gstr2bReconcileResult | null;
  onRun: () => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium text-foreground">Paste GSTR-2B JSON</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Paste the JSON downloaded from the GSTN portal (standard B2B format) or a simplified list.
          The reconciliation matches supplier GSTIN + invoice number against your purchase tax invoices.
        </p>
        <textarea
          className="mt-3 h-32 w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs"
          placeholder={'{"b2b": [{"supplier_gstin": "27AADCM...", "invoice_no": "INV-001", "invoice_date": "2024-01-02", "taxable_value": 100000, "cgst": 9000, "sgst": 9000, "igst": 0}]}'}
          value={jsonText}
          onChange={(e) => onJsonChange(e.target.value)}
        />
        <button
          type="button"
          disabled={loading || !jsonText.trim()}
          onClick={() => void onRun()}
          className="mt-3 inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-95 disabled:opacity-60"
        >
          {loading ? "Reconciling..." : "Run Reconciliation"}
        </button>
        {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      </div>

      {result ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "Total in 2B", value: result.summary.total_in_2b },
              { label: "Matched", value: result.summary.matched, accent: "green" },
              { label: "Discrepancies", value: result.summary.discrepancies, accent: "amber" },
              { label: "Not in books", value: result.summary.not_in_books, accent: "red" },
              { label: "Not in 2B", value: result.summary.not_in_2b, accent: "blue" },
            ].map((c) => (
              <div key={c.label} className="rounded-xl border border-border bg-card px-4 py-3">
                <div className={`text-xl font-bold ${c.accent === "green" ? "text-green-700" : c.accent === "amber" ? "text-amber-700" : c.accent === "red" ? "text-red-700" : c.accent === "blue" ? "text-blue-700" : "text-foreground"}`}>
                  {c.value}
                </div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
              </div>
            ))}
          </div>

          {result.matched.length > 0 ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Matched Invoices ({result.matched.length})</h3>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">GSTIN</th>
                      <th className="px-3 py-2 text-left">Inv No</th>
                      <th className="px-3 py-2 text-right">Taxable (2B)</th>
                      <th className="px-3 py-2 text-right">Taxable (Books)</th>
                      <th className="px-3 py-2 text-right">Taxable Diff</th>
                      <th className="px-3 py-2 text-right">CGST Diff</th>
                      <th className="px-3 py-2 text-right">SGST Diff</th>
                      <th className="px-3 py-2 text-right">IGST Diff</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.matched.map((r: Gstr2bMatchedRow) => (
                      <tr key={`${r.supplier_gstin}-${r.invoice_no}`} className="hover:bg-muted/20">
                        <td className="px-3 py-2 font-mono">{r.supplier_gstin}</td>
                        <td className="px-3 py-2 font-mono">{r.invoice_no}</td>
                        <td className="px-3 py-2 text-right">{fmt(r.taxable_value_2b)}</td>
                        <td className="px-3 py-2 text-right">{fmt(r.taxable_value_books)}</td>
                        <td className={`px-3 py-2 text-right font-medium ${Number(r.taxable_diff) !== 0 ? "text-amber-700" : ""}`}>{fmt(r.taxable_diff)}</td>
                        <td className={`px-3 py-2 text-right ${Number(r.cgst_diff) !== 0 ? "text-amber-700" : ""}`}>{fmt(r.cgst_diff)}</td>
                        <td className={`px-3 py-2 text-right ${Number(r.sgst_diff) !== 0 ? "text-amber-700" : ""}`}>{fmt(r.sgst_diff)}</td>
                        <td className={`px-3 py-2 text-right ${Number(r.igst_diff) !== 0 ? "text-amber-700" : ""}`}>{fmt(r.igst_diff)}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${statusChip(r.match_status)}`}>{r.match_status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {result.not_in_books.length > 0 ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">In GSTR-2B but Not in Books ({result.not_in_books.length})</h3>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">GSTIN</th>
                      <th className="px-3 py-2 text-left">Inv No</th>
                      <th className="px-3 py-2 text-left">Inv Date</th>
                      <th className="px-3 py-2 text-right">Taxable (2B)</th>
                      <th className="px-3 py-2 text-right">CGST</th>
                      <th className="px-3 py-2 text-right">SGST</th>
                      <th className="px-3 py-2 text-right">IGST</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.not_in_books.map((r: Gstr2bNotInBooksRow) => (
                      <tr key={`${r.supplier_gstin}-${r.invoice_no}`} className="bg-red-50/30 hover:bg-red-50/60">
                        <td className="px-3 py-2 font-mono">{r.supplier_gstin}</td>
                        <td className="px-3 py-2 font-mono">{r.invoice_no}</td>
                        <td className="px-3 py-2">{r.invoice_date}</td>
                        <td className="px-3 py-2 text-right">{fmt(r.taxable_value_2b)}</td>
                        <td className="px-3 py-2 text-right">{fmt(r.cgst_2b)}</td>
                        <td className="px-3 py-2 text-right">{fmt(r.sgst_2b)}</td>
                        <td className="px-3 py-2 text-right">{fmt(r.igst_2b)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {result.not_in_2b.length > 0 ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">In Books but Not in GSTR-2B ({result.not_in_2b.length})</h3>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">GSTIN</th>
                      <th className="px-3 py-2 text-left">Supplier</th>
                      <th className="px-3 py-2 text-left">Inv No</th>
                      <th className="px-3 py-2 text-left">Inv Date</th>
                      <th className="px-3 py-2 text-right">Taxable</th>
                      <th className="px-3 py-2 text-right">CGST</th>
                      <th className="px-3 py-2 text-right">SGST</th>
                      <th className="px-3 py-2 text-right">IGST</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.not_in_2b.map((r: Gstr2bNotIn2bRow) => (
                      <tr key={r.tax_invoice_id} className="bg-blue-50/30 hover:bg-blue-50/60">
                        <td className="px-3 py-2 font-mono">{r.supplier_gstin}</td>
                        <td className="px-3 py-2">{r.supplier_name}</td>
                        <td className="px-3 py-2 font-mono">{r.invoice_no}</td>
                        <td className="px-3 py-2">{r.invoice_date_books}</td>
                        <td className="px-3 py-2 text-right">{fmt(r.taxable_value_books)}</td>
                        <td className="px-3 py-2 text-right">{fmt(r.cgst_books)}</td>
                        <td className="px-3 py-2 text-right">{fmt(r.sgst_books)}</td>
                        <td className="px-3 py-2 text-right">{fmt(r.igst_books)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

const currentYear = new Date().getFullYear();
const MONTHS = [
  { label: "April", value: 4 }, { label: "May", value: 5 }, { label: "June", value: 6 },
  { label: "July", value: 7 }, { label: "August", value: 8 }, { label: "September", value: 9 },
  { label: "October", value: 10 }, { label: "November", value: 11 }, { label: "December", value: 12 },
  { label: "January", value: 1 }, { label: "February", value: 2 }, { label: "March", value: 3 },
];

export default function GstrReportPage() {
  const [dateFrom, setDateFrom] = useState(() => `${currentYear}-04-01`);
  const [dateTo, setDateTo] = useState(() => `${currentYear}-03-31`);
  const [report, setReport] = useState<GstrReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"b2b" | "b2cs" | "hsn">("b2b");
  const [recon2bJson, setRecon2bJson] = useState("");
  const [recon2bLoading, setRecon2bLoading] = useState(false);
  const [recon2bError, setRecon2bError] = useState<string | null>(null);
  const [recon2bResult, setRecon2bResult] = useState<Gstr2bReconcileResult | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getGstrReport({ date_from: dateFrom, date_to: dateTo });
      setReport(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load GSTR report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const s = report?.summary;

  return (
    <ERPPageShell
      eyebrow="BI & Reports"
      title="GSTR Report"
      subtitle="GSTR-1 / GSTR-3B summary — B2B invoices, B2CS, and HSN breakdown."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Reports", href: ROUTES.admin.reports },
        { label: "GSTR Report" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      {/* Period picker */}
      <ERPSectionShell title="Report Period">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">From Date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">To Date</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
            />
          </div>
          <button
            onClick={() => void load()}
            className="h-9 rounded-xl border border-primary bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Generate Report
          </button>
          {report && (
            <a
              href={buildGstrCsvUrl({ date_from: dateFrom, date_to: dateTo })}
              download
              className="h-9 rounded-xl border border-border bg-background px-5 text-sm font-medium hover:bg-muted flex items-center"
            >
              ↓ Download CSV
            </a>
          )}
        </div>
      </ERPSectionShell>

      {loading ? <ERPLoadingState label="Generating GSTR report…" /> : null}
      {!loading && error ? <ERPErrorState title="Unable to load GSTR report" description={error} /> : null}

      {!loading && report ? (
        <>
          {/* Summary cards */}
          <ERPSectionShell
            title="Summary"
            description={`Period: ${report.period.from} to ${report.period.to}`}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Total Taxable", value: fmt(s?.total_taxable_value) },
                { label: "Total CGST", value: fmt(s?.total_cgst) },
                { label: "Total SGST", value: fmt(s?.total_sgst) },
                { label: "Total IGST", value: fmt(s?.total_igst) },
                { label: "Total Tax", value: fmt(s?.total_tax), accent: true },
                { label: "Grand Total", value: fmt(s?.grand_total), accent: true },
                { label: "B2B Invoices", value: String(s?.b2b_invoices ?? 0) },
                { label: "B2CS Total", value: fmt(s?.b2cs_total) },
              ].map((c) => (
                <div
                  key={c.label}
                  className={`rounded-xl border px-4 py-3 ${c.accent ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}
                >
                  <div className={`text-lg font-bold ${c.accent ? "text-primary" : "text-foreground"}`}>{c.value}</div>
                  <div className="text-xs text-muted-foreground">{c.label}</div>
                </div>
              ))}
            </div>
          </ERPSectionShell>

          {/* Tabs */}
          <ERPSectionShell title="Detail">
            <div className="flex gap-2 border-b border-border mb-4">
              {(["b2b", "b2cs", "hsn"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  {t === "b2b" ? `B2B (${report.b2b.length})` : t === "b2cs" ? "B2CS" : `HSN Summary (${report.hsn_summary.length})`}
                </button>
              ))}
            </div>

            {tab === "b2b" ? (
              report.b2b.length === 0 ? (
                <ERPEmptyState title="No B2B invoices" description="No invoices with customer GSTIN in this period." />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-2.5">Invoice No</th>
                        <th className="px-3 py-2.5">Date</th>
                        <th className="px-3 py-2.5">Customer</th>
                        <th className="px-3 py-2.5">GSTIN</th>
                        <th className="px-3 py-2.5 text-right">Taxable</th>
                        <th className="px-3 py-2.5 text-right">CGST</th>
                        <th className="px-3 py-2.5 text-right">SGST</th>
                        <th className="px-3 py-2.5 text-right">IGST</th>
                        <th className="px-3 py-2.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.b2b.map((r, i) => (
                        <tr key={i} className="border-t border-border/60">
                          <td className="px-3 py-2 font-mono text-xs">{r.doc_no}</td>
                          <td className="px-3 py-2 text-xs">{r.doc_date}</td>
                          <td className="px-3 py-2 text-xs max-w-[140px] truncate">{r.customer_name}</td>
                          <td className="px-3 py-2 font-mono text-xs">{r.customer_gstin}</td>
                          <td className="px-3 py-2 text-right text-xs">{fmt(r.taxable_value)}</td>
                          <td className="px-3 py-2 text-right text-xs">{fmt(r.cgst)}</td>
                          <td className="px-3 py-2 text-right text-xs">{fmt(r.sgst)}</td>
                          <td className="px-3 py-2 text-right text-xs">{fmt(r.igst)}</td>
                          <td className="px-3 py-2 text-right text-xs font-semibold">{fmt(r.invoice_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : null}

            {tab === "b2cs" ? (
              <div className="rounded-xl border border-border overflow-hidden max-w-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2.5">Field</th>
                      <th className="px-4 py-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: "Taxable Value", value: fmt(report.b2cs.taxable_value) },
                      { label: "CGST", value: fmt(report.b2cs.cgst) },
                      { label: "SGST", value: fmt(report.b2cs.sgst) },
                      { label: "IGST", value: fmt(report.b2cs.igst) },
                      { label: "Total", value: fmt(report.b2cs.total) },
                    ].map((r) => (
                      <tr key={r.label} className="border-t border-border/60">
                        <td className="px-4 py-2.5 font-medium">{r.label}</td>
                        <td className="px-4 py-2.5 text-right">{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {tab === "hsn" ? (
              report.hsn_summary.length === 0 ? (
                <ERPEmptyState title="No HSN data" description="No GST lines with HSN codes in this period." />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-2.5">HSN/SAC</th>
                        <th className="px-4 py-2.5 text-right">GST %</th>
                        <th className="px-4 py-2.5 text-right">Taxable</th>
                        <th className="px-4 py-2.5 text-right">CGST</th>
                        <th className="px-4 py-2.5 text-right">SGST</th>
                        <th className="px-4 py-2.5 text-right">IGST</th>
                        <th className="px-4 py-2.5 text-right">Total Tax</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.hsn_summary.map((r) => (
                        <tr key={r.hsn} className="border-t border-border/60">
                          <td className="px-4 py-2.5 font-mono font-semibold">{r.hsn}</td>
                          <td className="px-4 py-2.5 text-right">{r.rate}%</td>
                          <td className="px-4 py-2.5 text-right">{fmt(r.taxable_value)}</td>
                          <td className="px-4 py-2.5 text-right">{fmt(r.cgst)}</td>
                          <td className="px-4 py-2.5 text-right">{fmt(r.sgst)}</td>
                          <td className="px-4 py-2.5 text-right">{fmt(r.igst)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold">{fmt(r.total_tax)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : null}

          </ERPSectionShell>
        </>
      ) : null}

      {!loading && !error && !report ? (
        <ERPEmptyState title="No data" description="Select a date range and click Generate Report." />
      ) : null}

      {/* GSTR-2B ITC Reconciliation — standalone, no report required */}
      <ERPSectionShell
        title="GSTR-2B ITC Reconciliation"
        description="Paste GSTR-2B JSON downloaded from the GSTN portal and match against your purchase tax invoices. No report generation required."
      >
        <Gstr2bReconcileTab
          jsonText={recon2bJson}
          onJsonChange={setRecon2bJson}
          loading={recon2bLoading}
          error={recon2bError}
          result={recon2bResult}
          onRun={async () => {
            setRecon2bLoading(true);
            setRecon2bError(null);
            setRecon2bResult(null);
            try {
              let parsed: unknown;
              try {
                parsed = JSON.parse(recon2bJson);
              } catch {
                throw new Error("Invalid JSON. Paste valid GSTR-2B JSON.");
              }
              const body =
                parsed && typeof parsed === "object" && "b2b" in (parsed as object)
                  ? { b2b: (parsed as { b2b: Gstr2bRow[] }).b2b }
                  : { gstn_raw: parsed };
              const result = await reconcileGstr2b(body);
              setRecon2bResult(result);
            } catch (e) {
              setRecon2bError(e instanceof Error ? e.message : "Reconciliation failed.");
            } finally {
              setRecon2bLoading(false);
            }
          }}
        />
      </ERPSectionShell>
    </ERPPageShell>
  );
}
