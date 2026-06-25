"use client";

import { useState, useEffect, useCallback } from "react";
import {
  listTDSDeductions,
  createTDSDeduction,
  markTDSDeposited,
  downloadTDS26Q,
  TDS_SECTIONS,
  TDSDeduction,
} from "@/services/tds-tcs";

const FY_OPTIONS = ["2024-25", "2025-26", "2026-27"];
const QUARTER_OPTIONS = ["Q1", "Q2", "Q3", "Q4"];
const STATUS_OPTIONS = ["PENDING", "DEPOSITED", "FILED"];

export default function TDSPage() {
  const [rows, setRows] = useState<TDSDeduction[]>([]);
  const [totals, setTotals] = useState({ gross: "0.00", tds: "0.00" });
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterFy, setFilterFy] = useState("");
  const [filterQ, setFilterQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    vendor_id: "",
    section: "194C",
    transaction_date: "",
    gross_amount: "",
    tds_rate: "",
    reference_no: "",
    notes: "",
  });
  const [formBusy, setFormBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const [depositModal, setDepositModal] = useState<TDSDeduction | null>(null);
  const [challan, setChallan] = useState("");
  const [depositDate, setDepositDate] = useState("");
  const [depositBusy, setDepositBusy] = useState(false);

  const [exportFy, setExportFy] = useState("2025-26");
  const [exportQ, setExportQ] = useState("Q1");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  const handleExport26Q = async () => {
    if (!exportFy || !exportQ) { setExportErr("Select FY and Quarter."); return; }
    setExportBusy(true);
    setExportErr(null);
    try {
      await downloadTDS26Q(exportFy, exportQ);
    } catch {
      setExportErr("Export failed. Ensure DEPOSITED records exist for selected period.");
    } finally {
      setExportBusy(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listTDSDeductions({ fy: filterFy, quarter: filterQ, status: filterStatus });
      setRows(res.results);
      setTotals(res.totals);
      setCount(res.count);
    } catch {
      setError("Failed to load TDS deductions");
    } finally {
      setLoading(false);
    }
  }, [filterFy, filterQ, filterStatus]);

  useEffect(() => { void load(); }, [load]);

  const submitCreate = async () => {
    if (!form.vendor_id || !form.transaction_date || !form.gross_amount || !form.tds_rate) {
      setFormErr("Vendor ID, date, gross amount, and TDS rate are required.");
      return;
    }
    setFormBusy(true);
    setFormErr(null);
    try {
      await createTDSDeduction({
        vendor_id: Number(form.vendor_id),
        section: form.section,
        transaction_date: form.transaction_date,
        gross_amount: form.gross_amount,
        tds_rate: form.tds_rate,
        reference_no: form.reference_no,
        notes: form.notes,
      });
      setShowForm(false);
      setForm({ vendor_id: "", section: "194C", transaction_date: "", gross_amount: "", tds_rate: "", reference_no: "", notes: "" });
      void load();
    } catch {
      setFormErr("Failed to create TDS deduction.");
    } finally {
      setFormBusy(false);
    }
  };

  const submitDeposit = async () => {
    if (!depositModal) return;
    setDepositBusy(true);
    try {
      await markTDSDeposited(depositModal.id, { challan_no: challan, deposit_date: depositDate });
      setDepositModal(null);
      void load();
    } catch {
      // silent — user can retry
    } finally {
      setDepositBusy(false);
    }
  };

  const statusBadge = (s: string) => {
    if (s === "DEPOSITED") return "bg-green-50 text-green-700 border-green-200";
    if (s === "FILED") return "bg-blue-50 text-blue-700 border-blue-200";
    return "bg-yellow-50 text-yellow-700 border-yellow-200";
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-foreground">TDS Deductions</h1>
          <p className="text-sm text-muted-foreground">Tax Deducted at Source on vendor payments</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={exportFy} onChange={e => setExportFy(e.target.value)} className="h-9 rounded-xl border border-border bg-background px-2 text-sm">
            {FY_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={exportQ} onChange={e => setExportQ(e.target.value)} className="h-9 rounded-xl border border-border bg-background px-2 text-sm">
            {QUARTER_OPTIONS.map(q => <option key={q} value={q}>{q}</option>)}
          </select>
          <button
            onClick={() => void handleExport26Q()}
            disabled={exportBusy}
            className="h-9 px-3 rounded-xl border border-border bg-background text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {exportBusy ? "Exporting…" : "Form 26Q CSV"}
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
          >
            + Record TDS
          </button>
        </div>
      </div>

      {exportErr && <div className="text-sm text-red-600 mb-3">{exportErr}</div>}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select value={filterFy} onChange={e => setFilterFy(e.target.value)} className="h-9 rounded-xl border border-border bg-background px-3 text-sm">
          <option value="">All FY</option>
          {FY_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={filterQ} onChange={e => setFilterQ(e.target.value)} className="h-9 rounded-xl border border-border bg-background px-3 text-sm">
          <option value="">All Quarters</option>
          {QUARTER_OPTIONS.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-9 rounded-xl border border-border bg-background px-3 text-sm">
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={() => void load()} className="h-9 px-4 rounded-xl border border-border text-sm">Refresh</button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "Total Records", value: count },
          { label: "Gross Amount", value: `₹${totals.gross}` },
          { label: "TDS Amount", value: `₹${totals.tds}` },
        ].map(card => (
          <div key={card.label} className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">{card.label}</div>
            <div className="text-lg font-bold mt-1">{card.value}</div>
          </div>
        ))}
      </div>

      {loading && <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>}
      {error && <div className="text-sm text-red-600 py-4">{error}</div>}

      {!loading && rows.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-12">No TDS deduction records found.</div>
      )}

      {rows.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Section</th>
                <th className="px-4 py-3 text-left">Vendor ID</th>
                <th className="px-4 py-3 text-right">Gross</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">TDS</th>
                <th className="px-4 py-3 text-left">FY / Q</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Challan</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-4 py-3">{r.transaction_date}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.section}</td>
                  <td className="px-4 py-3">{r.vendor_id}</td>
                  <td className="px-4 py-3 text-right">₹{r.gross_amount}</td>
                  <td className="px-4 py-3 text-right">{r.tds_rate}%</td>
                  <td className="px-4 py-3 text-right font-semibold">₹{r.tds_amount}</td>
                  <td className="px-4 py-3 text-xs">{r.financial_year} / {r.quarter}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${statusBadge(r.status)}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">{r.challan_no || "—"}</td>
                  <td className="px-4 py-3">
                    {r.status === "PENDING" && (
                      <button
                        onClick={() => { setDepositModal(r); setChallan(""); setDepositDate(""); }}
                        className="text-xs px-2 py-1 rounded-lg border border-green-300 text-green-700 hover:bg-green-50"
                      >
                        Mark Deposited
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="font-semibold mb-4">Record TDS Deduction</div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Vendor ID</label>
                <input type="number" value={form.vendor_id} onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))}
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">TDS Section</label>
                <select value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value }))}
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1">
                  {TDS_SECTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Transaction Date</label>
                <input type="date" value={form.transaction_date} onChange={e => setForm(f => ({ ...f, transaction_date: e.target.value }))}
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">Gross Amount (₹)</label>
                  <input type="number" step="0.01" value={form.gross_amount} onChange={e => setForm(f => ({ ...f, gross_amount: e.target.value }))}
                    className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">TDS Rate (%)</label>
                  <input type="number" step="0.01" value={form.tds_rate} onChange={e => setForm(f => ({ ...f, tds_rate: e.target.value }))}
                    className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Reference No.</label>
                <input value={form.reference_no} onChange={e => setForm(f => ({ ...f, reference_no: e.target.value }))}
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm mt-1 resize-none" />
              </div>
              {formErr && <div className="text-xs text-red-600">{formErr}</div>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowForm(false)} className="flex-1 h-9 rounded-xl border border-border text-sm">Cancel</button>
                <button onClick={() => void submitCreate()} disabled={formBusy}
                  className="flex-1 h-9 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
                  {formBusy ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {depositModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl p-6 w-full max-w-sm shadow-xl">
            <div className="font-semibold mb-1">Mark TDS Deposited</div>
            <div className="text-sm text-muted-foreground mb-4">TDS Amount: ₹{depositModal.tds_amount}</div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Challan No.</label>
                <input value={challan} onChange={e => setChallan(e.target.value)}
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Deposit Date</label>
                <input type="date" value={depositDate} onChange={e => setDepositDate(e.target.value)}
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setDepositModal(null)} className="flex-1 h-9 rounded-xl border border-border text-sm">Cancel</button>
                <button onClick={() => void submitDeposit()} disabled={depositBusy}
                  className="flex-1 h-9 rounded-xl bg-green-600 text-white text-sm font-semibold disabled:opacity-50">
                  {depositBusy ? "Saving…" : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
