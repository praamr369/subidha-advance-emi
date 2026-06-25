"use client";

import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { apiFetch } from "@/lib/api";

type RiskFlag = {
  code: string;
  severity: string;
  message: string;
};

type PartnerPerformanceSnapshot = {
  partner_id: number;
  partner_name: string;
  as_of: string;
  total_subscriptions: number;
  active_subscriptions: number;
  completed_subscriptions: number;
  referred_customer_count: number;
  collections_total: string;
  overdue_customer_count: number;
  commission_earned: string;
  commission_paid: string;
  pending_commission: string;
  growth_request_count: number;
  risk_flags: RiskFlag[];
};

function riskBadge(flag: RiskFlag) {
  if (flag.severity === "CRITICAL" || flag.severity === "HIGH") {
    return "bg-red-100 text-red-700 border border-red-200";
  }
  if (flag.severity === "WARNING") return "bg-amber-100 text-amber-700 border border-amber-200";
  return "bg-blue-50 text-blue-700 border border-blue-100";
}

export default function PartnerPerformancePage() {
  const [partners, setPartners] = useState<PartnerPerformanceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ results: PartnerPerformanceSnapshot[] }>("/admin/growth/partner-performance/")
      .then((r) => setPartners(r.results))
      .catch((e) => setError(e?.message ?? "Failed to load partner performance."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ERPLoadingState />;
  if (error) return <ERPErrorState message={error} />;

  return (
    <ERPPageShell
      eyebrow="Growth & Offers"
      title="Partner Performance"
      subtitle="Read-only partner activity: referrals, collections, overdue, commissions, risk flags. No payout or commission mutation."
      actions={[{ href: ROUTES.admin.growth, label: "Growth Hub", variant: "secondary" }]}
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Growth & Offers", href: ROUTES.admin.growth },
        { label: "Partner Performance" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
      stats={[
        { label: "Active Partners", value: loading ? "—" : partners.length, tone: "info" },
      ]}
    >
      {partners.length === 0 ? (
        <ERPEmptyState title="No partners" description="No active partners found." />
      ) : (
        <div className="space-y-4">
          {partners.map((p) => (
            <div key={p.partner_id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-sm">{p.partner_name}</p>
                  <p className="text-xs text-muted-foreground">Partner ID: {p.partner_id}</p>
                </div>
                {p.risk_flags.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {p.risk_flags.map((f, i) => (
                      <span key={i} className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${riskBadge(f)}`}>
                        {f.code.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Customers</p>
                  <p className="font-semibold">{p.referred_customer_count}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Active Subs</p>
                  <p className="font-semibold">{p.active_subscriptions}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Completed</p>
                  <p className="font-semibold">{p.completed_subscriptions}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Collections</p>
                  <p className="font-semibold">₹{p.collections_total}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Overdue</p>
                  <p className={`font-semibold ${p.overdue_customer_count > 0 ? "text-red-600" : ""}`}>
                    {p.overdue_customer_count}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Pending Comm.</p>
                  <p className="font-semibold">₹{p.pending_commission}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ERPPageShell>
  );
}
