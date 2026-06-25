"use client";

import { useState } from "react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { apiFetch } from "@/lib/api";

interface KycDocRow {
  doc_id: number;
  customer_id: number;
  customer_name: string;
  document_type: string;
  expiry_date: string;
  days_left: number;
  status_label: string;
}

interface PreviewResult {
  window_days: number;
  total: number;
  overdue_count: number;
  expiring_14d_count: number;
  expiring_30d_count: number;
  expiring_60d_count: number;
  documents: KycDocRow[];
}

interface NotifyResult {
  window_days: number;
  dry_run: boolean;
  customers_notified: number;
  skipped_no_email: number;
  results: { customer_id: number; email: string; dry_run?: boolean }[];
}

export default function KycExpiryNotificationsPage() {
  const [windowDays, setWindowDays] = useState(60);
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyResult, setNotifyResult] = useState<NotifyResult | null>(null);
  const [notifyError, setNotifyError] = useState("");
  const [dryRun, setDryRun] = useState(true);

  const handlePreview = async () => {
    setPreviewLoading(true);
    setPreviewError("");
    setPreviewData(null);
    try {
      const data: PreviewResult = await apiFetch(`/admin/kyc/expiry-preview/?window_days=${windowDays}`);
      setPreviewData(data);
    } catch {
      setPreviewError("Failed to load preview.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleNotify = async () => {
    setNotifyLoading(true);
    setNotifyError("");
    setNotifyResult(null);
    try {
      const data: NotifyResult = await apiFetch("/admin/kyc/expiry-notify/", {
        method: "POST",
        body: JSON.stringify({ window_days: windowDays, dry_run: dryRun }),
      });
      setNotifyResult(data);
    } catch {
      setNotifyError("Failed to send notifications.");
    } finally {
      setNotifyLoading(false);
    }
  };

  const urgencyColor = (daysLeft: number) => {
    if (daysLeft < 0) return "text-red-700 bg-red-50";
    if (daysLeft <= 14) return "text-orange-700 bg-orange-50";
    if (daysLeft <= 30) return "text-yellow-700 bg-yellow-50";
    return "text-blue-700 bg-blue-50";
  };

  return (
    <ERPPageShell
      eyebrow="CRM · KYC"
      title="KYC Expiry Notifications"
      subtitle="Preview expiring KYC documents and send email reminders to customers via Django email backend."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "CRM", href: ROUTES.admin.crm },
        { label: "KYC", href: ROUTES.admin.complianceKyc },
        { label: "Expiry Notifications" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
      stats={[
        { label: "Expiring (window)", value: previewData ? previewData.total : "—", tone: "info" },
        { label: "Overdue", value: previewData ? previewData.overdue_count : "—", tone: previewData && previewData.overdue_count > 0 ? "danger" : "success" },
        { label: "Within 14 days", value: previewData ? previewData.expiring_14d_count : "—", tone: previewData && previewData.expiring_14d_count > 0 ? "warning" : "success" },
        { label: "Within 30 days", value: previewData ? previewData.expiring_30d_count : "—", tone: "default" },
      ]}
    >

      {/* Controls */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-semibold">Configuration</h2>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Look-ahead Window (days)</label>
            <input
              type="number"
              min={1}
              max={365}
              value={windowDays}
              onChange={e => setWindowDays(Number(e.target.value))}
              className="w-28 h-9 rounded-xl border border-border bg-background px-3 text-sm"
            />
          </div>
          <button
            onClick={() => void handlePreview()}
            disabled={previewLoading}
            className="h-9 px-5 rounded-xl bg-muted text-foreground text-sm font-semibold disabled:opacity-50"
          >
            {previewLoading ? "Loading…" : "Preview Documents"}
          </button>
        </div>
        {previewError && <p className="text-sm text-red-600">{previewError}</p>}
      </div>

      {/* Preview Summary */}
      {previewData && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Preview — {previewData.total} document(s) expiring within {previewData.window_days} days</h2>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-center">
              <div className="text-2xl font-bold text-red-700">{previewData.overdue_count}</div>
              <div className="text-xs text-red-600 mt-1">Already Expired</div>
            </div>
            <div className="rounded-xl bg-orange-50 border border-orange-200 p-3 text-center">
              <div className="text-2xl font-bold text-orange-700">{previewData.expiring_14d_count}</div>
              <div className="text-xs text-orange-600 mt-1">Within 14 Days</div>
            </div>
            <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-3 text-center">
              <div className="text-2xl font-bold text-yellow-700">{previewData.expiring_30d_count}</div>
              <div className="text-xs text-yellow-600 mt-1">Within 30 Days</div>
            </div>
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-center">
              <div className="text-2xl font-bold text-blue-700">{previewData.expiring_60d_count}</div>
              <div className="text-xs text-blue-600 mt-1">Within 60 Days</div>
            </div>
          </div>

          {previewData.documents.length > 0 && (
            <div className="rounded-xl border border-border overflow-auto max-h-80">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Customer</th>
                    <th className="px-4 py-2 text-left">Document Type</th>
                    <th className="px-4 py-2 text-left">Expiry Date</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.documents.map(doc => (
                    <tr key={doc.doc_id} className="border-t border-border hover:bg-muted/20">
                      <td className="px-4 py-2">
                        <span className="font-medium">{doc.customer_name}</span>
                        <span className="text-xs text-muted-foreground ml-1">#{doc.customer_id}</span>
                      </td>
                      <td className="px-4 py-2 text-xs">{doc.document_type}</td>
                      <td className="px-4 py-2 text-xs">{doc.expiry_date}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${urgencyColor(doc.days_left)}`}>
                          {doc.status_label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Send Notifications */}
          <div className="border-t border-border pt-4 space-y-3">
            <h3 className="font-semibold text-sm">Send Email Reminders</h3>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={e => setDryRun(e.target.checked)}
                className="rounded"
              />
              Dry run (preview only — no emails sent)
            </label>
            <button
              onClick={() => void handleNotify()}
              disabled={notifyLoading || previewData.total === 0}
              className="h-9 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              {notifyLoading ? "Sending…" : dryRun ? "Simulate Notifications" : `Send Notifications (${previewData.total} docs)`}
            </button>
            {notifyError && <p className="text-sm text-red-600">{notifyError}</p>}
          </div>
        </div>
      )}

      {/* Notify Result */}
      {notifyResult && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h2 className="font-semibold">
            {notifyResult.dry_run ? "Simulation Result" : "Notification Result"}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-center">
              <div className="text-2xl font-bold text-green-700">{notifyResult.customers_notified}</div>
              <div className="text-xs text-green-600 mt-1">{notifyResult.dry_run ? "Would Notify" : "Customers Notified"}</div>
            </div>
            <div className="rounded-xl bg-muted p-3 text-center">
              <div className="text-2xl font-bold">{notifyResult.skipped_no_email}</div>
              <div className="text-xs text-muted-foreground mt-1">Skipped (No Email)</div>
            </div>
          </div>
          {notifyResult.results.length > 0 && (
            <div className="rounded-xl border border-border overflow-auto max-h-48">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Customer ID</th>
                    <th className="px-4 py-2 text-left">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {notifyResult.results.map(r => (
                    <tr key={r.customer_id} className="border-t border-border">
                      <td className="px-4 py-2 text-xs">#{r.customer_id}</td>
                      <td className="px-4 py-2 text-xs">{r.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </ERPPageShell>
  );
}
