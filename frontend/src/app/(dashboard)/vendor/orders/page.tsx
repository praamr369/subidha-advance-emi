"use client";

import { useEffect, useState } from "react";
import PortalPage from "@/components/ui/PortalPage";
import { listVendorPurchaseOrders } from "@/services/vendor-ops";

export default function VendorOrdersPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    void listVendorPurchaseOrders().then((payload) => setRows((payload.results as Record<string, unknown>[]) || []));
  }, []);
  return (
    <PortalPage title="Purchase Orders" subtitle="Vendor-scoped purchase order visibility.">
      <div className="rounded border p-3 text-sm space-y-1">
        {rows.map((row, idx) => (
          <div key={idx}>
            {String(row.po_no)} - {String(row.status)} - {String(row.expected_date || "—")}
          </div>
        ))}
      </div>
    </PortalPage>
  );
}
