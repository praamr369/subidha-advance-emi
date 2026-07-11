"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type DefectClaim = {
  id: number;
  subscription: number;
  subscription_number?: string;
  customer_name?: string;
  severity: "MINOR" | "MAJOR" | "DANGEROUS";
  status: "FILED" | "UNDER_REVIEW" | "ACCEPTED" | "REJECTED" | "RESOLVED";
  defect_description: string;
  product_name?: string;
  filed_at: string;
  reviewed_at: string | null;
  resolution_notes: string;
  replacement_dispatched: boolean;
  refund_issued: boolean;
};

const SEVERITY_COLOR: Record<string, string> = {
  MINOR: "bg-yellow-100 text-yellow-700",
  MAJOR: "bg-orange-100 text-orange-700",
  DANGEROUS: "bg-red-100 text-red-700",
};

const STATUS_COLOR: Record<string, string> = {
  FILED: "bg-blue-100 text-blue-700",
  UNDER_REVIEW: "bg-yellow-100 text-yellow-700",
  ACCEPTED: "bg-green-100 text-green-700",
  REJECTED: "bg-gray-100 text-gray-600",
  RESOLVED: "bg-emerald-100 text-emerald-700",
};

export default function DefectClaimsPage() {
  const [items, setItems] = useState<DefectClaim[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    setLoading(true);
    apiFetch("/api/v1/admin/consumer/defect-claims/")
      .then((d) => setItems(Array.isArray(d) ? d as DefectClaim[] : ((d as { results?: DefectClaim[] })?.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  const kpis = [
    { label: "Total", value: items.length },
    { label: "Filed", value: items.filter((i) => i.status === "FILED").length },
    { label: "Under review", value: items.filter((i) => i.status === "UNDER_REVIEW").length },
    { label: "Dangerous", value: items.filter((i) => i.severity === "DANGEROUS").length },
  ];

  const advance = async (id: number, action: string) => {
    await apiFetch(`/api/v1/admin/consumer/defect-claims/${id}/${action}/`, { method: "POST" });
    reload();
  };

  return (
    <ERPPageShell
      title="Defect Claims"
      subtitle="CTRL-CONS-1 â€” CPA 2019 s.2(47) product defect classification and resolution"
      stats={kpis}
    >
      <WorkspaceSection title="Product defect claims">
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loadingâ€¦</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No defect claims on file.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium">ID</th>
                  <th className="text-left py-2 px-3 font-medium">Customer</th>
                  <th className="text-left py-2 px-3 font-medium">Product</th>
                  <th className="text-left py-2 px-3 font-medium">Severity</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="text-left py-2 px-3 font-medium">Filed</th>
                  <th className="text-left py-2 px-3 font-medium">Description</th>
                  <th className="text-left py-2 px-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-3 font-mono text-xs">DC-{c.id}</td>
                    <td className="py-2 px-3">{c.customer_name ?? "â€”"}</td>
                    <td className="py-2 px-3 text-xs">{c.product_name ?? `Sub #${c.subscription}`}</td>
                    <td className="py-2 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLOR[c.severity] ?? ""}`}>
                        {c.severity}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[c.status] ?? ""}`}>
                        {c.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{new Date(c.filed_at).toLocaleDateString()}</td>
                    <td className="py-2 px-3 text-xs max-w-[200px] truncate" title={c.defect_description}>
                      {c.defect_description}
                    </td>
                    <td className="py-2 px-3 flex gap-1">
                      {c.status === "FILED" && (
                        <button onClick={() => advance(c.id, "review")}
                          className="text-xs bg-yellow-600 text-white px-2 py-1 rounded hover:bg-yellow-700">
                          Review
                        </button>
                      )}
                      {c.status === "UNDER_REVIEW" && (
                        <>
                          <button onClick={() => advance(c.id, "accept")}
                            className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">
                            Accept
                          </button>
                          <button onClick={() => advance(c.id, "reject")}
                            className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700">
                            Reject
                          </button>
                        </>
                      )}
                      {c.status === "ACCEPTED" && (
                        <button onClick={() => advance(c.id, "resolve")}
                          className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700">
                          Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WorkspaceSection>
    </ERPPageShell>
  );
}

