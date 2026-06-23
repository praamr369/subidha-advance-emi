"use client";

import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { buildGstrCsvUrl, getGstrReport, type GstrReport } from "@/services/gstr-recovery";

function fmt(v: string | undefined): string {
  if (!v) return "₹0.00";
  return `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
      title="GSTR Report"
      description="GSTR-1 / GSTR-3B summary — B2B invoices, B2CS, and HSN breakdown"
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
                  className={`rounded-xl border px-4 py-3 ${c.accent ? "border-primary/30 bg-primary/5" : "border-border bg-[var(--surface-card-elevated)]"}`}
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
                    <thead className="bg-[var(--surface-muted)]">
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
                  <thead className="bg-[var(--surface-muted)]">
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
                    <thead className="bg-[var(--surface-muted)]">
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
    </ERPPageShell>
  );
}
