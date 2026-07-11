"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type ForfeitureInvoice = {
  id: number;
  subscription: number;
  subscription_number?: string;
  customer_name?: string;
  invoice_number: string;
  forfeiture_amount: string;
  cgst_amount: string;
  sgst_amount: string;
  total_amount: string;
  forfeiture_reason: string;
  invoice_date: string;
  status: "DRAFT" | "ISSUED" | "CANCELLED";
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-yellow-100 text-yellow-700",
  ISSUED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

export default function ForfeitureInvoicesPage() {
  const [items, setItems] = useState<ForfeitureInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    setLoading(true);
    apiFetch("/api/v1/admin/finance/forfeiture-invoices/")
      .then((d) => setItems(Array.isArray(d) ? d as ForfeitureInvoice[] : ((d as { results?: ForfeitureInvoice[] })?.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  const totalForfeited = items
    .filter((i) => i.status === "ISSUED")
    .reduce((s, i) => s + Number(i.total_amount), 0);

  const kpis = [
    { label: "Total", value: items.length },
    { label: "Draft", value: items.filter((i) => i.status === "DRAFT").length },
    { label: "Issued", value: items.filter((i) => i.status === "ISSUED").length },
    {
      label: "Total forfeited",
      value: `â‚¹${totalForfeited.toLocaleString("en-IN")}`,
    },
  ];

  const issue = async (id: number) => {
    await apiFetch(`/api/v1/admin/finance/forfeiture-invoices/${id}/issue/`, { method: "POST" });
    reload();
  };

  return (
    <ERPPageShell
      title="Deposit Forfeiture Invoices"
      subtitle="CTRL-RENT-5 â€” GST tax invoices for security deposit forfeitures (CGST + SGST)"
      stats={kpis}
    >
      <WorkspaceSection title="Forfeiture invoice register">
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loadingâ€¦</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No forfeiture invoices on record.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium">Invoice #</th>
                  <th className="text-left py-2 px-3 font-medium">Customer</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="text-left py-2 px-3 font-medium">Forfeiture</th>
                  <th className="text-left py-2 px-3 font-medium">CGST</th>
                  <th className="text-left py-2 px-3 font-medium">SGST</th>
                  <th className="text-left py-2 px-3 font-medium">Total</th>
                  <th className="text-left py-2 px-3 font-medium">Date</th>
                  <th className="text-left py-2 px-3 font-medium">Reason</th>
                  <th className="text-left py-2 px-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((inv) => (
                  <tr key={inv.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-3 font-mono text-xs">{inv.invoice_number}</td>
                    <td className="py-2 px-3">{inv.customer_name ?? "â€”"}</td>
                    <td className="py-2 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[inv.status] ?? ""}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-xs">â‚¹{Number(inv.forfeiture_amount).toLocaleString("en-IN")}</td>
                    <td className="py-2 px-3 font-mono text-xs">â‚¹{Number(inv.cgst_amount).toLocaleString("en-IN")}</td>
                    <td className="py-2 px-3 font-mono text-xs">â‚¹{Number(inv.sgst_amount).toLocaleString("en-IN")}</td>
                    <td className="py-2 px-3 font-mono text-xs font-medium">â‚¹{Number(inv.total_amount).toLocaleString("en-IN")}</td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{inv.invoice_date}</td>
                    <td className="py-2 px-3 text-xs max-w-[150px] truncate" title={inv.forfeiture_reason}>
                      {inv.forfeiture_reason || "â€”"}
                    </td>
                    <td className="py-2 px-3">
                      {inv.status === "DRAFT" && (
                        <button onClick={() => issue(inv.id)}
                          className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">
                          Issue
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

