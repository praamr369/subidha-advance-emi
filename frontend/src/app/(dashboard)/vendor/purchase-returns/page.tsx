"use client";

import { useEffect, useState } from "react";
import PortalPage from "@/components/ui/PortalPage";
import { listVendorPurchaseReturns } from "@/services/vendor-ops";

export default function VendorPurchaseReturnsPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    void listVendorPurchaseReturns().then((payload) => setRows((payload.results as Record<string, unknown>[]) || []));
  }, []);
  return (
    <PortalPage title="Purchase Returns" subtitle="Vendor-scoped purchase return visibility.">
      <div className="rounded border p-3 text-sm space-y-1">
        {rows.map((row, idx) => (
          <div key={idx}>
            {String(row.return_no)} - {String(row.status)} - {String(row.grand_total)}
          </div>
        ))}
      </div>
    </PortalPage>
  );
}
