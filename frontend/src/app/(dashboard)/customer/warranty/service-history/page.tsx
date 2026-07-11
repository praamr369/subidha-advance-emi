"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type ServiceRecord = {
  id: number;
  defect_type: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  product_name: string;
  subscription_number: string;
};

export default function ServiceHistoryPage() {
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/v1/warranty/service-history/")
      .then((d) => setRecords(Array.isArray(d) ? d as ServiceRecord[] : ((d as { results?: ServiceRecord[] })?.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <ERPPageShell
      title="Service History"
      subtitle="All warranty claims and service visits for your products"
      breadcrumbs={[
        { label: "Home", href: "/customer/dashboard" },
        { label: "Warranty", href: "/customer/warranty/check" },
        { label: "Service History" },
      ]}
      actions={[{ href: "/customer/warranty/claim", label: "+ New Claim", variant: "primary" }]}
    >
      <WorkspaceSection title={`${records.length} Service Record${records.length !== 1 ? "s" : ""}`}>
        {loading && <div className="py-8 text-center text-gray-500">Loading...</div>}

        {!loading && records.length === 0 && (
          <div className="py-12 text-center text-gray-500">
            <div className="text-4xl mb-3">🔧</div>
            <p className="font-medium">No service history</p>
            <p className="text-sm mt-1">Your products haven&apos;t had any warranty service yet.</p>
          </div>
        )}

        {!loading && records.length > 0 && (
          <div className="space-y-3">
            {records.map((r) => (
              <div key={r.id} className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{r.product_name}</div>
                    <div className="text-sm text-gray-500 mt-0.5">{r.subscription_number} · {r.defect_type?.replace(/_/g, " ")}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    r.status === "RESOLVED" ? "bg-green-100 text-green-700" :
                    r.status === "IN_PROGRESS" ? "bg-orange-100 text-orange-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {r.status?.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <span>Filed: {new Date(r.created_at).toLocaleDateString("en-IN")}</span>
                  {r.resolved_at && <span>Resolved: {new Date(r.resolved_at).toLocaleDateString("en-IN")}</span>}
                  <Link href={`/customer/warranty/status/${r.id}`} className="text-orange-600 underline ml-auto">
                    View Details →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </WorkspaceSection>
    </ERPPageShell>
  );
}
