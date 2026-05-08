"use client";

import { useEffect, useState } from "react";
import PortalPage from "@/components/ui/PortalPage";
import { getVendorProfile } from "@/services/vendor-ops";

export default function VendorProfilePage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    void getVendorProfile().then((payload) => setData(payload));
  }, []);
  return (
    <PortalPage title="Vendor Profile" subtitle="Your vendor profile and service areas.">
      <div className="rounded border p-3 text-sm">
        <div>Name: {String(data?.display_name || data?.name || "—")}</div>
        <div>Vendor Code: {String(data?.vendor_code || "—")}</div>
        <div>Status: {String(data?.status || "—")}</div>
        <div>Contact: {String(data?.contact_person || "—")}</div>
      </div>
    </PortalPage>
  );
}
