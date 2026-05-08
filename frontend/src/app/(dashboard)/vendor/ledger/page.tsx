"use client";

import { useEffect, useState } from "react";
import PortalPage from "@/components/ui/PortalPage";
import { listVendorLedger } from "@/services/vendor-ops";

export default function VendorLedgerPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    void listVendorLedger().then((payload) => setRows((payload.results as Record<string, unknown>[]) || []));
  }, []);
  return (
    <PortalPage title="Vendor Ledger" subtitle="Vendor-only ledger entries.">
      <div className="rounded border p-3 text-sm space-y-1">
        {rows.map((row, idx) => (
          <div key={idx}>
            {String(row.entry_type)} - Dr {String(row.debit)} / Cr {String(row.credit)} / Bal {String(row.balance_after)}
          </div>
        ))}
      </div>
    </PortalPage>
  );
}
