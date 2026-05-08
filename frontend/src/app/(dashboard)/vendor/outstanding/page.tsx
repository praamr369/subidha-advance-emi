"use client";

import { useEffect, useState } from "react";
import PortalPage from "@/components/ui/PortalPage";
import { getVendorOutstanding } from "@/services/vendor-ops";

export default function VendorOutstandingPage() {
  const [value, setValue] = useState("0.00");
  useEffect(() => {
    void getVendorOutstanding().then((payload) => setValue(String(payload.outstanding || "0.00")));
  }, []);
  return (
    <PortalPage title="Outstanding" subtitle="Vendor payable outstanding snapshot.">
      <div className="rounded border p-4 text-lg font-semibold">{value}</div>
    </PortalPage>
  );
}
