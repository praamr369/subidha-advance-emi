"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { listKycReviewQueue, type KycQueueRow, type KycReviewQueueResponse } from "@/services/kyc";

const ALWAYS_ALLOWED_ACTIONS = [
  "Lead creation",
  "Quotation creation",
  "Brochure enquiry",
  "Draft subscription / rent / lease creation",
  "Admin manual review",
];

const GATED_ACTIONS = [
  "Lucky Plan activation",
  "Rent activation",
  "Lease activation",
  "Contract generation",
  "Delivery handover",
  "Refund release",
  "Winner settlement",
];

function toneForStatus(status: string): string {
  if (status === "READY" || status === "APPROVED" || status === "VERIFIED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "SUBMITTED" || status === "PENDING" || status === "EXPIRING_SOON") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "REJECTED" || status === "EXPIRED" || status === "BLOCKED") return "border-red-200 bg-red-50 text-red-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN");
}

function listValue(value: number | undefined): string {
  return value === undefined ? "0" : String(value);
}

function statusCount(summary: Record<string, number> | undefined, key: string): number {
  return Number(summary?.[key] ?? 0);
}

export default function AdminComplianceKycPage() {
  const [queue, setQueue] = useState<KycReviewQueueResponse | null>(null);
  const [expiryQueue, setExpiryQueue] = useState<KycReviewQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [queuePayload, expiryPayload] = await Promise.all([
          listKycReviewQueue(),
          listKycReviewQueue({ expires_within_days: 60 }),
        ]);
        if (!active) return;
        setQueue(queuePayload);
        setExpiryQueue(expiryPayload);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load KYC compliance data.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const summary = queue?.summary;
    const expirySummary = expiryQueue?.summary;
    return [
      { label: "Queue total", value: listValue(queue?.count), tone: queue?.count ? "amber" : "emerald" },
      { label: "Pending review", value: listValue(statusCount(summary?.by_status, "SUBMITTED") + statusCount(summary?.by_status, "PENDING")), tone: "amber" },
      { label: "Approved / verified", value: listValue(statusCount(summary?.by_status, "APPROVED") + statusCount(summary?.by_status, "VERIFIED") + statusCount(summary?.by_status, "EXCEPTION_APPROVED")), tone: "emerald" },
      { label: "Rejected", value: listValue(statusCount(summary?.by_status, "REJECTED")), tone: "red" },
      { label: "Expiring in 60 days", value: listValue(expiryQueue?.count), tone: expiryQueue?.count ? "amber" : "emerald" },
      { label: "Expired in window", value: listValue(statusCount(expirySummary?.by_status, "EXPIRED")), tone: statusCount(expirySummary?.by_status, "EXPIRED") ? "red" : "emerald" },
    ];
  }, [expiryQueue?.count, expiryQueue?.summary, queue?.count, queue?.summary]);

  const ownerBreakdown = useMemo(() => {
    const byOwner = queue?.summary?.by_owner_type ?? {};
    return [
      { label: "Customers", value: listValue(statusCount(byOwner, "customer")) },
      { label: "Partners", value: listValue(statusCount(byOwner, "partner")) },
      { label: "Vendors", value: listValue(statusCount(byOwner, "vendor")) },
      { label: "Staff", value: listValue(statusCount(byOwner, "staff")) },
    ];
  }, [queue?.summary?.by_owner_type]);

  const queueRows: KycQueueRow[] = (expiryQueue?.results.length ? expiryQueue.results : queue?.results || []).slice(0, 8);

  return (
    <PortalPage
      title="KYC compliance"
      subtitle="Free-only KYC governance across Lucky Plan EMI, rent, lease, delivery, refund, and winner settlement workflows."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Governance" },
        { label: "KYC Compliance" },
      ]}
      actions={[
        { href: ROUTES.admin.crmKyc, label: "CRM KYC queue", variant: "primary" },
        { href: ROUTES.admin.kycReverification, label: "Re-verification", variant: "secondary" },
        { href: ROUTES.admin.kycExpiryNotifications, label: "Expiry notifications", variant: "secondary" },
        { href: ROUTES.admin.settingsBusinessCompliance, label: "Business compliance", variant: "secondary" },
      ]}
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-amber-300/70 bg-amber-50/90 p-4 text-sm text-amber-900 shadow-sm">
          No paid KYC vendor API, no SMS gateway, and no live Aadhaar auth are required for the current launch path. The operating model stays
          file-based, reviewed, auditable, and reversible.
        </section>

        <WorkspaceSection title="Operational snapshot" description="Queue pressure and expiry pressure across all KYC owner types.">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading KYC queue snapshot...</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {stats.map((card) => (
                <div key={card.label} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{card.label}</div>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneForStatus(card.tone)}`}>{card.tone.toUpperCase()}</span>
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-foreground">{card.value}</div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {ownerBreakdown.map((item) => (
              <div key={item.label} className="rounded-xl border border-border bg-background p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</div>
                <div className="mt-2 text-lg font-semibold text-foreground">{item.value}</div>
              </div>
            ))}
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="Policy surface" description="What stays open, what is gated, and where operators should work next.">
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Always allowed</h3>
              <ul className="mt-3 space-y-2 text-sm text-foreground">
                {ALWAYS_ALLOWED_ACTIONS.map((action) => (
                  <li key={action} className="rounded-lg border border-border bg-background px-3 py-2">{action}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Gated until KYC is ready</h3>
              <ul className="mt-3 space-y-2 text-sm text-foreground">
                {GATED_ACTIONS.map((action) => (
                  <li key={action} className="rounded-lg border border-border bg-background px-3 py-2">{action}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Reusable surfaces</h3>
              <div className="mt-3 space-y-2 text-sm">
                <Link href={ROUTES.admin.crmKyc} className="block rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground hover:bg-muted">
                  CRM KYC review queue
                </Link>
                <Link href={ROUTES.admin.kycReverification} className="block rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground hover:bg-muted">
                  KYC re-verification queue
                </Link>
                <Link href={ROUTES.admin.kycExpiryNotifications} className="block rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground hover:bg-muted">
                  KYC expiry notifications
                </Link>
                <Link href={ROUTES.admin.settingsBusinessCompliance} className="block rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground hover:bg-muted">
                  Business compliance evidence
                </Link>
              </div>
            </div>
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="Review queue" description="Latest documents that are pending review, approved, or close to expiry.">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading queue rows...</p>
          ) : queueRows.length ? (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Owner</th>
                    <th className="px-4 py-3">Document</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Expiry</th>
                    <th className="px-4 py-3">Allowed actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {queueRows.map((row) => (
                    <tr key={`${row.owner_type}-${row.document_id}`} className="bg-background">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{row.owner_name || `Owner #${row.owner_id}`}</div>
                        <div className="text-xs text-muted-foreground">{row.owner_type.toUpperCase()} · {row.owner_email || row.owner_phone || "No contact"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{row.document_type}</div>
                        <div className="text-xs text-muted-foreground">{row.category || "Unclassified"} · {row.upload_source || "Unknown source"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneForStatus(row.status)}`}>{row.status}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        <div>{formatDate(row.expiry_date)}</div>
                        <div className="text-xs text-muted-foreground">{row.expiry_status}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {row.allowed_actions.length ? row.allowed_actions.slice(0, 4).map((action) => (
                            <span key={action} className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-semibold text-foreground">
                              {action}
                            </span>
                          )) : <span className="text-xs text-muted-foreground">No operator actions exposed</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
              No review queue rows are currently available.
            </div>
          )}
        </WorkspaceSection>
      </div>
    </PortalPage>
  );
}
