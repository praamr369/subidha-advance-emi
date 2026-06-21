"use client";

import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { listOfferPackages, type OfferPackage } from "@/services/growth";

function statusBadge(s: string) {
  if (s === "ACTIVE") return "bg-green-100 text-green-800 border border-green-200";
  if (s === "DRAFT") return "bg-amber-100 text-amber-700 border border-amber-200";
  if (s === "PAUSED") return "bg-orange-100 text-orange-700 border border-orange-200";
  if (s === "EXPIRED") return "bg-muted text-muted-foreground border border-border";
  if (s === "ARCHIVED") return "bg-muted text-muted-foreground border border-border";
  return "bg-muted text-muted-foreground border border-border";
}

function audienceBadge(a: string) {
  if (a === "ALL") return "bg-blue-50 text-blue-700 border border-blue-100";
  if (a === "NEW_CUSTOMER") return "bg-teal-50 text-teal-700 border border-teal-100";
  if (a === "HIGH_TRUST_CUSTOMER") return "bg-purple-50 text-purple-700 border border-purple-100";
  return "bg-muted text-muted-foreground border border-border";
}

export default function OfferPackagesPage() {
  const [packages, setPackages] = useState<OfferPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listOfferPackages()
      .then((r) => setPackages(r.results))
      .catch((e) => setError(e?.message ?? "Failed to load offer packages."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <ERPLoadingState />;
  if (error) return <ERPErrorState message={error} />;

  return (
    <ERPPageShell
      title="Offer Packages"
      subtitle="Time-bounded offers built on plan templates. No subscription is created automatically."
      actions={[
        { href: ROUTES.admin.growthPlanTemplates, label: "Plan Templates", variant: "secondary" },
        { href: ROUTES.admin.growth, label: "Growth Hub", variant: "secondary" },
      ]}
    >
      {packages.length === 0 ? (
        <ERPEmptyState title="No offer packages" description="No offer packages configured yet." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Code</th>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Template</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Audience</th>
                <th className="px-4 py-3 text-left font-medium">Valid From</th>
                <th className="px-4 py-3 text-left font-medium">Valid To</th>
                <th className="px-4 py-3 text-left font-medium">Lines</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {packages.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{p.package_code}</td>
                  <td className="px-4 py-3">{p.name}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{p.plan_template_code ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${statusBadge(p.status)}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${audienceBadge(p.audience_type)}`}>
                      {p.audience_type.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">{p.start_date ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">{p.end_date ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">{p.lines.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ERPPageShell>
  );
}
