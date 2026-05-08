"use client";

import { useEffect, useState } from "react";
import PortalPage from "@/components/ui/PortalPage";
import { listVendorDashboard } from "@/services/vendor-ops";

export default function VendorDashboardPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    void listVendorDashboard().then((payload) => setData(payload));
  }, []);
  return (
    <PortalPage title="Vendor Dashboard" subtitle="Vendor-scoped procurement and quote operations.">
      <div className="grid gap-2 md:grid-cols-3">
        <div className="rounded border p-3 text-sm">Pending Quote Requests: {String(data?.pending_quote_requests ?? 0)}</div>
        <div className="rounded border p-3 text-sm">Accepted Quotes: {String(data?.accepted_quotes ?? 0)}</div>
        <div className="rounded border p-3 text-sm">Outstanding Payable: {String(data?.outstanding_payable ?? "0.00")}</div>
        <div className="rounded border p-3 text-sm">Purchase Orders: {String(data?.purchase_orders ?? 0)}</div>
        <div className="rounded border p-3 text-sm">Purchase Returns: {String(data?.purchase_returns ?? 0)}</div>
        <div className="rounded border p-3 text-sm">Products: {String(data?.products_count ?? 0)}</div>
      </div>
    </PortalPage>
  );
}
