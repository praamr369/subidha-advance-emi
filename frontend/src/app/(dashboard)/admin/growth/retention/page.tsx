"use client";

import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { apiFetch } from "@/lib/api";

type RetentionSignal = {
  signal_type: string;
  severity: "CRITICAL" | "HIGH" | "WARNING" | "INFO";
  due_date?: string;
  source_model?: string;
  source_id?: number;
  subscription_id?: number;
  suggested_action?: string;
  risk_band?: string;
  request_type?: string;
};

type CustomerRetentionProfile = {
  customer_id: number;
  as_of: string;
  signal_count: number;
  signals: RetentionSignal[];
  has_critical: boolean;
  has_high: boolean;
};

type RetentionListResponse = {
  results: CustomerRetentionProfile[];
  total: number;
};

const severityStyle: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800 border border-red-200",
  HIGH: "bg-orange-100 text-orange-700 border border-orange-200",
  WARNING: "bg-amber-100 text-amber-700 border border-amber-200",
  INFO: "bg-blue-50 text-blue-700 border border-blue-100",
};

function SignalBadge({ severity }: { severity: string }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${severityStyle[severity] ?? "bg-muted text-muted-foreground"}`}>
      {severity}
    </span>
  );
}

function profileBorderClass(profile: CustomerRetentionProfile) {
  if (profile.has_critical) return "border-red-300";
  if (profile.has_high) return "border-orange-300";
  return "border-border";
}

export default function RetentionIntelligencePage() {
  const [profiles, setProfiles] = useState<CustomerRetentionProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<RetentionListResponse>("/admin/growth/retention/")
      .then((r) => {
        setProfiles(r.results);
        setTotal(r.total);
      })
      .catch((e) => setError(e?.message ?? "Failed to load retention intelligence."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ERPLoadingState />;
  if (error) return <ERPErrorState message={error} />;

  return (
    <ERPPageShell
      eyebrow="Growth & Offers"
      title="Retention Intelligence"
      subtitle={`Advisory signals only. No Payment, EMI, or Subscription records are mutated. ${total} customer${total === 1 ? "" : "s"} with active signals.`}
      actions={[{ href: ROUTES.admin.growth, label: "Growth Hub", variant: "secondary" }]}
    >
      {profiles.length === 0 ? (
        <ERPEmptyState
          title="No retention signals"
          description="All customers are in good standing — no overdue EMIs, expiring contracts, or high-risk flags."
        />
      ) : (
        <div className="space-y-3">
          {profiles.map((profile) => (
            <div
              key={profile.customer_id}
              className={`rounded-lg border bg-card p-4 ${profileBorderClass(profile)}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">Customer #{profile.customer_id}</p>
                  <span className="text-xs text-muted-foreground">
                    {profile.signal_count} signal{profile.signal_count !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex gap-1">
                  {profile.has_critical && <SignalBadge severity="CRITICAL" />}
                  {profile.has_high && !profile.has_critical && <SignalBadge severity="HIGH" />}
                </div>
              </div>
              <div className="space-y-1.5">
                {profile.signals.map((sig, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <SignalBadge severity={sig.severity} />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-foreground">
                        {sig.signal_type.replace(/_/g, " ")}
                      </span>
                      {sig.due_date && (
                        <span className="text-muted-foreground ml-1">· due {sig.due_date}</span>
                      )}
                      {sig.suggested_action && (
                        <p className="text-muted-foreground mt-0.5">{sig.suggested_action}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </ERPPageShell>
  );
}
