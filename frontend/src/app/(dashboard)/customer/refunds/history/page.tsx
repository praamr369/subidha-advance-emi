"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { fetchRefundHistory } from "@/services/customer-portal";

type RefundRow = {
  id: number;
  subscription_number: string;
  product_name: string;
  reason: string;
  status: string;
  refund_amount: number;
  created_at: string;
};

const STATUS_COLOR: Record<string, string> = {
  REQUESTED: "bg-yellow-100 text-yellow-800",
  UNDER_REVIEW: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-600",
};

export default function RefundHistoryPage() {
  const [rows, setRows] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRefundHistory()
      .then((d) => setRows(Array.isArray(d) ? d as RefundRow[] : ((d as { results?: RefundRow[] })?.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <ERPPageShell
      title="Returns & Refund History"
      subtitle="All your return requests and refund status"
      breadcrumbs={[{ label: "Home", href: "/customer/dashboard" }, { label: "Returns & Refunds" }]}
      actions={[{ href: "/customer/refunds/request", label: "+ New Return", variant: "primary" }]}
    >
      <WorkspaceSection title={`${rows.length} Return Request${rows.length !== 1 ? "s" : ""}`}>
        {loading && <div className="py-8 text-center text-gray-500">Loading...</div>}

        {!loading && rows.length === 0 && (
          <div className="py-12 text-center text-gray-500">
            <div className="text-4xl mb-3">📦</div>
            <p className="font-medium">No return requests</p>
            <p className="text-sm mt-1">Need to return something? Start a new request.</p>
            <Link href="/customer/refunds/request" className="mt-4 inline-block text-blue-600 underline text-sm">
              Request a Return →
            </Link>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-gray-500 text-left">
                  <th className="pb-3 pr-4">ID</th>
                  <th className="pb-3 pr-4">Subscription</th>
                  <th className="pb-3 pr-4">Reason</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4">Refund</th>
                  <th className="pb-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="py-3 pr-4">
                      <Link href={`/customer/refunds/status/${r.id}`} className="text-blue-600 underline">
                        #{r.id}
                      </Link>
                    </td>
                    <td className="py-3 pr-4">{r.subscription_number || "—"}</td>
                    <td className="py-3 pr-4">{r.reason?.replace(/_/g, " ") || "—"}</td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {r.status?.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {r.refund_amount > 0 ? `₹${r.refund_amount.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="py-3 text-gray-500">{new Date(r.created_at).toLocaleDateString("en-IN")}</td>
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
