"use client";

import { useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { apiFetch } from "@/lib/api";

interface BatchKpi {
  batch_id: number;
  batch_ref: string;
  fill_rate: number;
  filled_slots: number;
  total_slots: number;
  payment_discipline: number;
  paid_emis: number;
  total_emis: number;
  draw_completion: number;
  conducted_draws: number;
  expected_draws: number;
  alerts?: Array<{ metric: string; value: number; threshold: number; message: string }>;
}

interface CheckResult {
  checked_at: string;
  thresholds: { fill_rate: number; payment_discipline: number; draw_completion: number };
  total_active_batches: number;
  batches_with_alerts: number;
  batches_healthy: number;
  alerts: BatchKpi[];
  healthy: BatchKpi[];
}

interface AlertResult {
  dry_run: boolean;
  email: string;
  batches_with_alerts: number;
  alert_summary: string[];
  message: string;
}

export default function BatchAlertsPage() {
  const [fillThreshold, setFillThreshold] = useState(80);
  const [paymentThreshold, setPaymentThreshold] = useState(75);
  const [drawThreshold, setDrawThreshold] = useState(90);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [dryRun, setDryRun] = useState(false);

  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [alertResult, setAlertResult] = useState<AlertResult | null>(null);
  const [checkBusy, setCheckBusy] = useState(false);
  const [alertBusy, setAlertBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async () => {
    setCheckBusy(true);
    setError(null);
    setCheckResult(null);
    try {
      const q = new URLSearchParams({
        fill_rate_threshold: String(fillThreshold),
        payment_discipline_threshold: String(paymentThreshold),
        draw_completion_threshold: String(drawThreshold),
      });
      const res: CheckResult = await apiFetch(`/batches/performance-check/?${q}`);
      setCheckResult(res);
    } catch {
      setError("Failed to check batch performance.");
    } finally {
      setCheckBusy(false);
    }
  };

  const handleAlert = async () => {
    if (!notifyEmail) { setError("Notify email is required."); return; }
    setAlertBusy(true);
    setError(null);
    setAlertResult(null);
    try {
      const res: AlertResult = await apiFetch("/batches/performance-alert/", {
        method: "POST",
        body: JSON.stringify({
          fill_rate_threshold: fillThreshold,
          payment_discipline_threshold: paymentThreshold,
          draw_completion_threshold: drawThreshold,
          notify_email: notifyEmail,
          dry_run: dryRun,
        }),
      });
      setAlertResult(res);
    } catch {
      setError("Failed to send alert.");
    } finally {
      setAlertBusy(false);
    }
  };

  const kpiBar = (value: number, threshold: number) => {
    const pct = Math.min(value, 100);
    const color = value >= threshold ? "bg-green-500" : "bg-red-500";
    return (
      <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    );
  };

  return (
    <ERPPageShell
      eyebrow="BI & Reports"
      title="Batch Performance Alerts"
      subtitle="Check active batches against thresholds and send email alerts for under-performers."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Reports", href: ROUTES.admin.reports },
        { label: "Batch Performance Alerts" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >

      {/* Thresholds */}
      <div className="rounded-xl border border-border bg-card p-5 mb-5">
        <div className="text-xs font-semibold text-muted-foreground uppercase mb-3">Alert Thresholds</div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Fill Rate (%)", value: fillThreshold, setter: setFillThreshold },
            { label: "Payment Discipline (%)", value: paymentThreshold, setter: setPaymentThreshold },
            { label: "Draw Completion (%)", value: drawThreshold, setter: setDrawThreshold },
          ].map(({ label, value, setter }) => (
            <div key={label}>
              <label className="text-xs text-muted-foreground block mb-1">{label}</label>
              <input
                type="number"
                min={0}
                max={100}
                value={value}
                onChange={e => setter(Number(e.target.value))}
                className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>
          ))}
        </div>
        <button
          onClick={() => void handleCheck()}
          disabled={checkBusy}
          className="mt-4 h-9 px-5 rounded-xl border border-border bg-background text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          {checkBusy ? "Checking…" : "Check All Batches"}
        </button>
      </div>

      {/* Email alert config */}
      <div className="rounded-xl border border-border bg-card p-5 mb-5">
        <div className="text-xs font-semibold text-muted-foreground uppercase mb-3">Send Email Alert</div>
        <div className="flex gap-3 items-center mb-3">
          <input
            type="email"
            value={notifyEmail}
            onChange={e => setNotifyEmail(e.target.value)}
            placeholder="manager@example.com"
            className="flex-1 h-9 rounded-xl border border-border bg-background px-3 text-sm"
          />
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} className="rounded" />
            Dry run
          </label>
        </div>
        <button
          onClick={() => void handleAlert()}
          disabled={alertBusy || !notifyEmail}
          className="h-9 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {alertBusy ? "Sending…" : dryRun ? "Preview Alert" : "Send Alert Email"}
        </button>
        {alertResult && (
          <div className={`mt-3 text-sm rounded-xl p-3 ${alertResult.batches_with_alerts > 0 ? "bg-orange-50 text-orange-700 border border-orange-200" : "bg-green-50 text-green-700 border border-green-200"}`}>
            {alertResult.message}
            {alertResult.alert_summary.length > 0 && (
              <div className="text-xs mt-1">Batches: {alertResult.alert_summary.join(", ")}</div>
            )}
          </div>
        )}
      </div>

      {error && <div className="text-sm text-red-600 mb-4">{error}</div>}

      {/* Check results */}
      {checkResult && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: "Active Batches", value: checkResult.total_active_batches },
              { label: "Batches with Alerts", value: checkResult.batches_with_alerts, warn: checkResult.batches_with_alerts > 0 },
              { label: "Healthy Batches", value: checkResult.batches_healthy },
            ].map(c => (
              <div key={c.label} className={`rounded-xl border p-4 ${c.warn ? "border-orange-200 bg-orange-50" : "border-border bg-card"}`}>
                <div className="text-xs text-muted-foreground">{c.label}</div>
                <div className={`text-2xl font-bold mt-1 ${c.warn ? "text-orange-700" : ""}`}>{c.value}</div>
              </div>
            ))}
          </div>

          {checkResult.alerts.length > 0 && (
            <div className="rounded-xl border border-orange-200 overflow-hidden mb-4">
              <div className="bg-orange-50 px-4 py-2 text-xs font-semibold text-orange-700 uppercase">Batches with Alerts</div>
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Batch</th>
                    <th className="px-4 py-2 text-left">Fill Rate</th>
                    <th className="px-4 py-2 text-left">Payment Disc.</th>
                    <th className="px-4 py-2 text-left">Draw Compl.</th>
                    <th className="px-4 py-2 text-left">Alerts</th>
                  </tr>
                </thead>
                <tbody>
                  {checkResult.alerts.map(b => (
                    <tr key={b.batch_id} className="border-t border-border">
                      <td className="px-4 py-3 font-mono text-xs">{b.batch_ref}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {kpiBar(b.fill_rate, fillThreshold)}
                          <span className={`text-xs ${b.fill_rate < fillThreshold ? "text-red-600 font-semibold" : "text-green-700"}`}>{b.fill_rate}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {kpiBar(b.payment_discipline, paymentThreshold)}
                          <span className={`text-xs ${b.payment_discipline < paymentThreshold ? "text-red-600 font-semibold" : "text-green-700"}`}>{b.payment_discipline}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {kpiBar(b.draw_completion, drawThreshold)}
                          <span className={`text-xs ${b.draw_completion < drawThreshold ? "text-red-600 font-semibold" : "text-green-700"}`}>{b.draw_completion}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-orange-600">{(b.alerts || []).map(a => a.metric).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {checkResult.healthy.length > 0 && (
            <details className="rounded-xl border border-green-200 overflow-hidden">
              <summary className="bg-green-50 px-4 py-2 text-xs font-semibold text-green-700 uppercase cursor-pointer">Healthy Batches ({checkResult.healthy.length})</summary>
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Batch</th>
                    <th className="px-4 py-2 text-left">Fill Rate</th>
                    <th className="px-4 py-2 text-left">Payment Disc.</th>
                    <th className="px-4 py-2 text-left">Draw Compl.</th>
                  </tr>
                </thead>
                <tbody>
                  {checkResult.healthy.map(b => (
                    <tr key={b.batch_id} className="border-t border-border">
                      <td className="px-4 py-3 font-mono text-xs">{b.batch_ref}</td>
                      <td className="px-4 py-3 text-xs text-green-700">{b.fill_rate}%</td>
                      <td className="px-4 py-3 text-xs text-green-700">{b.payment_discipline}%</td>
                      <td className="px-4 py-3 text-xs text-green-700">{b.draw_completion}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </>
      )}
    </ERPPageShell>
  );
}
