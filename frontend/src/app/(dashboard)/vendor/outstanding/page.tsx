"use client";

import { useEffect, useState } from "react";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { accountingErrorMessage } from "@/components/accounting/shared";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import { getVendorOutstanding } from "@/services/vendor-ops";

export default function VendorOutstandingPage() {
  const [value, setValue] = useState("0.00");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getVendorOutstanding()
      .then((payload) => {
        if (!active) return;
        setValue(String(payload.outstanding || "0.00"));
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(accountingErrorMessage(err, "Unable to load outstanding balance."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <ERPPageShell
      title="Outstanding"
      subtitle="Vendor payable outstanding snapshot."
      breadcrumbs={[{ label: "Vendor", href: ROUTES.vendor.dashboard }, { label: "Outstanding" }]}
    >
      <ERPSectionShell
        title="Payable snapshot"
        description="This is the current outstanding payable computed from your vendor ledger records. Settlement posting remains controlled by accounting."
      >
        {loading ? <ERPLoadingState label="Loading outstanding..." /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load outstanding" description={error} /> : null}
        {!loading && !error ? (
          <div className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-6 shadow-[inset_0_1px_0_var(--hairline-shine)]">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Outstanding payable
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground tabular-nums">
              {formatRupee(value)}
            </div>
          </div>
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
