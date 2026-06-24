"use client";

import { useState, useEffect, useCallback } from "react";
import {
  listTCSCollections,
  createTCSCollection,
  markTCSDeposited,
  TCS_SECTIONS,
  TCSCollection,
} from "@/services/tds-tcs";

const FY_OPTIONS = ["2024-25", "2025-26", "2026-27"];
const QUARTER_OPTIONS = ["Q1", "Q2", "Q3", "Q4"];
const STATUS_OPTIONS = ["PENDING", "DEPOSITED", "FILED"];

export default function TCSPage() {
  const [rows, setRows] = useState<TCSCollection[]>([]);
  const [totals, setTotals] = useState({ sale: "0.00", tcs: "0.00" });
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterFy, setFilterFy] = useState("");
  const [filterQ, setFilterQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    customer_name: "",
    customer_pan: "",
    section: "206C(1H)",
    transaction_date: "",
    sale_amount: "",
    tcs_rate: "",
    reference_no: "",
    notes: "",
  });
  const [formBusy, setFormBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const [depositModal, setDepositModal] = useState<TCSCollection | null>(null);
  const [challan, setChallan] = useState("");
  const [depositDate, setDepositDate] = useState("");
  const [depositBusy, setDepositBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listTCSCollections({ fy: filterFy, quarter: filterQ, status: filterStatus });
      setRows(res.results);
      setTotals(res.totals);
      setCount(res.count);
    } catch {
      setError("Failed to load TCS collections");
    } finally {
      setLoading(false);
    }
  }, [filterFy, filterQ, filterStatus]);

  useEffect(() => { void load(); }, [load]);

  const submitCreate = async () => {
    if (!form.customer_name || !form.transaction_date || !form.sale_amount || !form.tcs_rate) {
      setFormErr("Customer name, date, sale amount, and TCS rate are required.");
      return;
    }
    setFormBusy(true);
    setFormErr(null);
    try {
      await createTCSCollection({
        customer_name: form.customer_name,
        customer_pan: form.customer_pan,
        section: form.section,
        transaction_date: form.transaction_date,
        sale_amount: form.sale_amount,
        tcs_rate: form.tcs_rate,
        reference_no: form.reference_no,
        notes: form.notes,
      });
      setShowForm(false);
      setForm({ customer_name: "", customer_pan: "", section: "206C(1H)", transaction_date: "", sale_amount: "", tcs_rate: "", reference_no: "", notes: "" });
      void load();
    } catch {
      setFormErr("Failed to create TCS collection record.");
    } finally {
      setFormBusy(false);
    }
  };

  const submitDeposit = async () => {
    if (!depositModal) return;
    setDepositBusy(true);
    try {
      await markTCSDeposited(depositModal.id, { challan_no: challan, deposit_date: depositDate });
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
          <h1 className="text-xl font-bold text-foreground">TCS Collections</h1>
          <p className="text-sm text-muted-foreground">Tax Collected at Source on customer transactions</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
        >
          + Record TCS
        </button>
      </div>

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
          { label: "Sale Amount", value: `₹${totals.sale}` },
          { label: "TCS Collected", value: `₹${totals.tcs}` },
        ].map(card => (
          <div key={card.label} className="rounded-2xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">{card.label}</div>
            <div className="text-lg font-bold mt-1">{card.value}</div>
          </div>
        ))}
      </div>

      {loading && <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>}
      {error && <div className="text-sm text-red-600 py-4">{error}</div>}

      {!loading && rows.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-12">No TCS collection records found.</div>
      )}

      {rows.length > 0 && (
        <div className="rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Section</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">PAN</th>
                <th className="px-4 py-3 text-right">Sale Amt</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">TCS</th>
                <th className="px-4 py-3 text-left">FY / Q</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-4 py-3">{r.transaction_date}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.section}</td>
                  <td className="px-4 py-3">{r.customer_name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.customer_pan || "—"}</td>
                  <td className="px-4 py-3 text-right">₹{r.sale_amount}</td>
                  <td className="px-4 py-3 text-right">{r.tcs_rate}%</td>
                  <td className="px-4 py-3 text-right font-semibold">₹{r.tcs_amount}</td>
                  <td className="px-4 py-3 text-xs">{r.financial_year} / {r.quarter}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${statusBadge(r.status)}`}>{r.status}</span>
                  </td>
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
          <div className="bg-background rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="font-semibold mb-4">Record TCS Collection</div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Customer Name</label>
                <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Customer PAN</label>
                <input value={form.customer_pan} onChange={e => setForm(f => ({ ...f, customer_pan: e.target.value }))}
                  placeholder="ABCDE1234F" className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">TCS Section</label>
                <select value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value }))}
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1">
                  {TCS_SECTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Transaction Date</label>
                <input type="date" value={form.transaction_date} onChange={e => setForm(f => ({ ...f, transaction_date: e.target.value }))}
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">Sale Amount (₹)</label>
                  <input type="number" step="0.01" value={form.sale_amount} onChange={e => setForm(f => ({ ...f, sale_amount: e.target.value }))}
                    className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">TCS Rate (%)</label>
                  <input type="number" step="0.01" value={form.tcs_rate} onChange={e => setForm(f => ({ ...f, tcs_rate: e.target.value }))}
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
          <div className="bg-background rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="font-semibold mb-1">Mark TCS Deposited</div>
            <div className="text-sm text-muted-foreground mb-4">TCS Amount: ₹{depositModal.tcs_amount}</div>
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
