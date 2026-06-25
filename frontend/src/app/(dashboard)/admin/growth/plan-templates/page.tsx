"use client";

import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { listPlanTemplates, type PlanTemplate } from "@/services/growth";

function planTypeBadge(planType: string) {
  if (planType === "EMI") return "bg-blue-100 text-blue-700 border border-blue-200";
  if (planType === "RENT") return "bg-green-100 text-green-700 border border-green-200";
  if (planType === "LEASE") return "bg-purple-100 text-purple-700 border border-purple-200";
  return "bg-muted text-muted-foreground border border-border";
}

function activeBadge(isActive: boolean) {
  return isActive
    ? "bg-green-100 text-green-800 border border-green-200"
    : "bg-muted text-muted-foreground border border-border";
}

export default function PlanTemplatesPage() {
  const [templates, setTemplates] = useState<PlanTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPlanTemplates()
      .then((r) => setTemplates(r.results))
      .catch((e) => setError(e?.message ?? "Failed to load plan templates."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ERPLoadingState />;
  if (error) return <ERPErrorState message={error} />;

  return (
    <ERPPageShell
      eyebrow="Growth & Offers"
      title="Plan Templates"
      subtitle="Reusable EMI, RENT, and LEASE plan configuration blueprints."
      actions={[{ href: ROUTES.admin.growth, label: "Growth Hub", variant: "secondary" }]}
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Growth & Offers", href: ROUTES.admin.growth },
        { label: "Plan Templates" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
      stats={[
        { label: "Plan Templates", value: loading ? "—" : templates.length, tone: "info" },
      ]}
    >
      {templates.length === 0 ? (
        <ERPEmptyState title="No plan templates" description="No plan templates configured yet." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Code</th>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Tenure</th>
                <th className="px-4 py-3 text-left font-medium">Lucky Eligible</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {templates.map((t) => (
                <tr key={t.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{t.template_code}</td>
                  <td className="px-4 py-3">{t.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${planTypeBadge(t.plan_type)}`}>
                      {t.plan_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">{t.tenure_months != null ? `${t.tenure_months}m` : "—"}</td>
                  <td className="px-4 py-3">{t.is_lucky_plan_eligible ? "Yes" : "No"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${activeBadge(t.is_active)}`}>
                      {t.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ERPPageShell>
  );
}
