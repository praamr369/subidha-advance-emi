"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

const REPORT_TYPES = [
  { key: "outstanding_emis", label: "Outstanding EMIs" },
  { key: "overdue_emis", label: "Overdue EMIs" },
  { key: "tds_pending", label: "TDS Pending Deposit" },
  { key: "batch_fill_rates", label: "Batch Fill Rates" },
  { key: "kyc_expiring", label: "KYC Expiring Documents (60 days)" },
];

interface ExportResult {
  report_type: string;
  label: string;
  date_from: string;
  date_to: string;
  row_count: number;
  filename: string;
  notify_email: string;
  dry_run: boolean;
  message: string;
}

export default function ScheduledExportPage() {
  const [reportType, setReportType] = useState("outstanding_emis");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [dryRun, setDryRun] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    if (!notifyEmail) { setError("Notify email is required."); return; }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res: ExportResult = await apiFetch("/reports/scheduled-export/", {
        method: "POST",
        body: JSON.stringify({
          report_type: reportType,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          notify_email: notifyEmail,
          dry_run: dryRun,
        }),
      });
      setResult(res);
    } catch {
      setError("Export failed. Please check settings and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Scheduled Report Export</h1>
        <p className="text-sm text-muted-foreground mt-1">Generate and email a report CSV to a recipient immediately.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Report Type</label>
          <select
            value={reportType}
            onChange={e => setReportType(e.target.value)}
            className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
          >
            {REPORT_TYPES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">Leave blank for last 30 days</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">Leave blank for today</p>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Notify Email *</label>
          <input
            type="email"
            value={notifyEmail}
            onChange={e => setNotifyEmail(e.target.value)}
            placeholder="manager@example.com"
            className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="dry_run"
            checked={dryRun}
            onChange={e => setDryRun(e.target.checked)}
            className="rounded"
          />
          <label htmlFor="dry_run" className="text-sm">Dry run (preview only — no email sent)</label>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <button
          onClick={() => void handleExport()}
          disabled={busy}
          className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Generating…" : dryRun ? "Preview Report" : "Generate & Email Report"}
        </button>
      </div>

      {result && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 mt-4">
          <div className="text-sm font-semibold text-green-700 mb-2">{result.message}</div>
          <div className="grid grid-cols-2 gap-y-1 text-xs text-green-800">
            <span className="font-medium">Report:</span><span>{result.label}</span>
            <span className="font-medium">File:</span><span className="font-mono">{result.filename}</span>
            <span className="font-medium">Period:</span><span>{result.date_from} → {result.date_to}</span>
            <span className="font-medium">Records:</span><span>{result.row_count}</span>
            <span className="font-medium">Sent to:</span><span>{result.notify_email}</span>
            {result.dry_run && <><span className="font-medium col-span-2 text-amber-600">Dry run — no email sent</span></>}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4 mt-4">
        <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Available Reports</div>
        <ul className="space-y-1">
          {REPORT_TYPES.map(r => (
            <li key={r.key} className="text-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary/40 flex-shrink-0" />
              <span className="font-mono text-xs text-muted-foreground">{r.key}</span>
              <span>— {r.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
