"use client";

import { useEffect, useState } from "react";
import ERPDetailGrid from "@/components/erp/ERPDetailGrid";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import KycDocumentPanel from "@/components/kyc/KycDocumentPanel";
import { accountingErrorMessage } from "@/components/accounting/shared";
import { ROUTES } from "@/lib/routes";
import { getVendorProfile } from "@/services/vendor-ops";

export default function VendorProfilePage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getVendorProfile()
      .then((payload) => {
        if (!active) return;
        setData(payload);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setData(null);
        setError(accountingErrorMessage(err, "Unable to load vendor profile."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const status = String(data?.status || "—");
  return (
    <ERPPageShell
      title="Vendor profile"
      subtitle="Your vendor profile and service areas."
      breadcrumbs={[{ label: "Vendor", href: ROUTES.vendor.dashboard }, { label: "Profile" }]}
    >
      <ERPSectionShell
        title="Profile details"
        description="This profile reflects the linked vendor master record. Changes require admin/vendor management workflows."
        actions={!loading && !error ? <ERPStatusBadge status={status} size="md" /> : null}
      >
        {loading ? <ERPLoadingState label="Loading vendor profile..." /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load vendor profile" description={error} /> : null}
        {!loading && !error ? (
          <ERPDetailGrid
            columns={2}
            items={[
              { label: "Name", value: String(data?.display_name || data?.name || "—") },
              { label: "Vendor code", value: String(data?.vendor_code || "—") },
              { label: "Status", value: status },
              { label: "Contact", value: String(data?.contact_person || "—") },
            ]}
          />
        ) : null}
      </ERPSectionShell>

      <div className="mt-4">
        <KycDocumentPanel mode="self" portal="vendor" />
      </div>
    </ERPPageShell>
  );
}
