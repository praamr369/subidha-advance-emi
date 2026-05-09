"use client";

import { useEffect, useState } from "react";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { listVendorCategories } from "@/services/vendors";

export default function AdminVendorCategoriesPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    void listVendorCategories().then((data) => {
      const payload = data as { results?: Record<string, unknown>[] } | Record<string, unknown>[];
      setRows(Array.isArray(payload) ? payload : payload.results || []);
    });
  }, []);
  return (
    <PortalPage title="Vendor Categories" subtitle="Supplier category master." breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Vendor Categories" }]}>
      <div className="rounded border p-3 text-sm space-y-1">{rows.map((row, idx) => <div key={idx}>{String(row.code)} - {String(row.name)}</div>)}</div>
    </PortalPage>
  );
}
