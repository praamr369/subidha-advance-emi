"use client";

import { useCallback, useEffect, useState } from "react";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import RefreshBar from "@/components/feedback/RefreshBar";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import {
  issueForfeitureInvoice,
  listForfeitureInvoices,
  type ForfeitureInvoice,
} from "@/services/finance-gaps";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-yellow-100 text-yellow-700",
  ISSUED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

export default function ForfeitureInvoicesPage() {
  const [items, setItems] = useState<ForfeitureInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      setItems(await listForfeitureInvoices());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load forfeiture invoices.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void reload(true);
  }, [reload]);

  const totalForfeited = items
    .filter((i) => i.status === "ISSUED")
    .reduce((s, i) => s + Number(i.total_invoice_amount), 0);

  const kpis = [
    { label: "Total", value: items.length },
    { label: "Draft", value: items.filter((i) => i.status === "DRAFT").length },
    { label: "Issued", value: items.filter((i) => i.status === "ISSUED").length },
    {
      label: "Total forfeited",
      value: `₹${totalForfeited.toLocaleString("en-IN")}`,
    },
  ];

  const issue = async (id: number) => {
    try {
      await issueForfeitureInvoice(id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to issue invoice.");
    }
  };

  return (
    <ERPPageShell
      title="Deposit Forfeiture Invoices"
      subtitle="CTRL-RENT-5 — GST tax invoices for security deposit forfeitures (CGST + SGST)"
      stats={kpis}
    >
      <WorkspaceSection title="Forfeiture invoice register">
        <RefreshBar active={refreshing} />
        {loading ? (
          <LoadingBlock label="Loading forfeiture invoices…" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void reload()} />
        ) : items.length === 0 ? (
          <EmptyState
            title="No forfeiture invoices"
            description="Deposit forfeiture tax invoices will appear here once deposits are forfeited."
          />
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
                    <td className="py-2 px-3">{inv.customer_name ?? "—"}</td>
                    <td className="py-2 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[inv.status] ?? ""}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-xs">₹{Number(inv.forfeited_amount).toLocaleString("en-IN")}</td>
                    <td className="py-2 px-3 font-mono text-xs">₹{Number(inv.cgst_amount).toLocaleString("en-IN")}</td>
                    <td className="py-2 px-3 font-mono text-xs">₹{Number(inv.sgst_amount).toLocaleString("en-IN")}</td>
                    <td className="py-2 px-3 font-mono text-xs font-medium">₹{Number(inv.total_invoice_amount).toLocaleString("en-IN")}</td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{inv.invoice_date}</td>
                    <td className="py-2 px-3 text-xs max-w-[150px] truncate" title={inv.forfeiture_reason}>
                      {inv.forfeiture_reason || "—"}
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
