"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type Handover = {
  id: number;
  subscription_number: string;
  product_name: string;
  delivery_date: string;
  handover_type: "DELIVERY" | "RETURN";
  signed_by: string;
  condition_at_handover: string;
  notes: string;
  receipt_url: string | null;
};

export default function HandoverReceiptPage() {
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/v1/deliveries/handover-receipts/")
      .then((d) => setHandovers(Array.isArray(d) ? d as Handover[] : ((d as { results?: Handover[] })?.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <ERPPageShell
      title="Delivery & Handover Receipts"
      subtitle="Signed delivery and return receipts for all your products"
      breadcrumbs={[
        { label: "Home", href: "/customer/dashboard" },
        { label: "Deliveries", href: "/customer/deliveries" },
        { label: "Handover Receipts" },
      ]}
    >
      <WorkspaceSection title={`${handovers.length} Handover Record${handovers.length !== 1 ? "s" : ""}`}>
        {loading && <div className="py-8 text-center text-gray-500">Loading...</div>}

        {!loading && handovers.length === 0 && (
          <div className="py-12 text-center text-gray-500">
            <div className="text-4xl mb-3">📦</div>
            <p className="font-medium">No handover records</p>
            <p className="text-sm mt-1">Delivery receipts will appear here once your order is delivered.</p>
          </div>
        )}

        {!loading && handovers.map((h) => (
          <div key={h.id} className="p-4 border rounded-lg mb-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">{h.product_name}</div>
                <div className="text-sm text-gray-500">{h.subscription_number}</div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                h.handover_type === "DELIVERY" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
              }`}>
                {h.handover_type}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-gray-500 text-xs">Date</div>
                <div className="font-medium">{new Date(h.delivery_date).toLocaleDateString("en-IN")}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Condition</div>
                <div className="font-medium">{h.condition_at_handover}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Signed By</div>
                <div className="font-medium">{h.signed_by || "—"}</div>
              </div>
            </div>
            {h.notes && <div className="mt-2 text-xs text-gray-500">{h.notes}</div>}
            {h.receipt_url && (
              <a
                href={h.receipt_url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-sm text-blue-600 underline"
              >
                Download Signed Receipt →
              </a>
            )}
          </div>
        ))}
      </WorkspaceSection>
    </ERPPageShell>
  );
}
