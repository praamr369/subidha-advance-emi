"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type WaiverSettlement = {
  id: number;
  subscription: number;
  subscription_number?: string;
  customer_name?: string;
  batch: number;
  batch_code?: string;
  draw_month: number;
  waiver_amount: string;
  remaining_emi_count: number;
  settlement_status: "PENDING" | "APPROVED" | "PAID" | "CANCELLED";
  settlement_date: string | null;
  payment_reference: string;
  created_at: string;
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  APPROVED: "bg-blue-100 text-blue-700",
  PAID: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

export default function WaiverSettlementsPage() {
  const [items, setItems] = useState<WaiverSettlement[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    setLoading(true);
    apiFetch("/api/v1/admin/lucky-plan/waiver-settlements/")
      .then((d) => setItems(Array.isArray(d) ? d as WaiverSettlement[] : ((d as { results?: WaiverSettlement[] })?.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  const kpis = [
    { label: "Total", value: items.length },
    { label: "Pending", value: items.filter((i) => i.settlement_status === "PENDING").length },
    { label: "Approved", value: items.filter((i) => i.settlement_status === "APPROVED").length },
    { label: "Paid out", value: items.filter((i) => i.settlement_status === "PAID").length },
  ];

  const totalWaived = items
    .filter((i) => i.settlement_status === "PAID")
    .reduce((s, i) => s + Number(i.waiver_amount), 0);

  const approve = async (id: number) => {
    await apiFetch(`/api/v1/admin/lucky-plan/waiver-settlements/${id}/approve/`, { method: "POST" });
    reload();
  };

  return (
    <ERPPageShell
      title="EMI Waiver Settlements"
      subtitle="CTRL-LP-3 â€” Waiver settlement records for lucky-plan draw winners"
      stats={kpis}
    >
      {totalWaived > 0 && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          Total waived amount paid out: <strong>â‚¹{totalWaived.toLocaleString("en-IN")}</strong>
        </div>
      )}
      <WorkspaceSection title="Settlement records">
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loadingâ€¦</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No waiver settlement records.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium">Subscription</th>
                  <th className="text-left py-2 px-3 font-medium">Customer</th>
                  <th className="text-left py-2 px-3 font-medium">Batch / Month</th>
                  <th className="text-left py-2 px-3 font-medium">Waiver amt</th>
                  <th className="text-left py-2 px-3 font-medium">EMIs remaining</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="text-left py-2 px-3 font-medium">Settlement date</th>
                  <th className="text-left py-2 px-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-3 font-mono text-xs">{s.subscription_number ?? `#${s.subscription}`}</td>
                    <td className="py-2 px-3">{s.customer_name ?? "â€”"}</td>
                    <td className="py-2 px-3 text-xs">{s.batch_code ?? `#${s.batch}`} / M{s.draw_month}</td>
                    <td className="py-2 px-3 font-mono font-medium">â‚¹{Number(s.waiver_amount).toLocaleString("en-IN")}</td>
                    <td className="py-2 px-3 text-center">{s.remaining_emi_count}</td>
                    <td className="py-2 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[s.settlement_status] ?? ""}`}>
                        {s.settlement_status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{s.settlement_date ?? "â€”"}</td>
                    <td className="py-2 px-3">
                      {s.settlement_status === "PENDING" && (
                        <button onClick={() => approve(s.id)}
                          className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700">
                          Approve
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

