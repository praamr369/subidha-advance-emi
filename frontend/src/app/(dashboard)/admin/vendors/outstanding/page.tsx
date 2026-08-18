"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import ERPDetailGrid from "@/components/erp/ERPDetailGrid";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import { listVendors, type Vendor } from "@/services/vendors";
import { getAdminVendorOutstanding, type VendorOutstanding } from "@/services/vendor-ops";

export default function AdminVendorsOutstandingPage() {
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [outstanding, setOutstanding] = useState<VendorOutstanding | null>(null);

  async function loadVendors() {
    setLoading(true);
    try {
      const payload = await listVendors({ page_size: 200 });
      const list = Array.isArray(payload) ? payload : (payload.results ?? []);
      setVendors(list);
      setSelectedVendorId((current) => current ?? (list.length ? list[0].id : null));
      setError(null);
    } catch (err) {
      setVendors([]);
      setError(err instanceof Error ? err.message : "Failed to load vendors.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadVendors();
  }, []);

  useEffect(() => {
    if (!selectedVendorId) {
      setSelectedVendor(null);
      setOutstanding(null);
      return;
    }

    let mounted = true;
    setLoadingDetail(true);

    // Use the already-loaded vendor from the list rather than a second fetch
    const found = vendors.find((v) => v.id === selectedVendorId) ?? null;
    setSelectedVendor(found);

    getAdminVendorOutstanding(selectedVendorId)
      .then((payload) => {
        if (!mounted) return;
        setOutstanding(payload);
        setError(null);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load vendor outstanding detail.");
        setOutstanding(null);
      })
      .finally(() => {
        if (mounted) setLoadingDetail(false);
      });

    return () => {
      mounted = false;
    };
  }, [selectedVendorId, vendors]);

  const outstandingValue = outstanding?.outstanding ?? "0.00";

  return (
    <ERPPageShell
      eyebrow="Purchases & Vendors"
      title="Vendor Outstanding"
      subtitle="Vendor payable summary with direct drill-down to the selected vendor ledger and detail page."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Vendors", href: ROUTES.admin.vendors },
        { label: "Outstanding" },
      ]}
      actions={
        selectedVendorId
          ? [{ href: `/admin/vendors/${selectedVendorId}`, label: "Open vendor detail", variant: "secondary" }]
          : undefined
      }
      stats={[
        { label: "Vendors", value: vendors.length, tone: "info" },
        {
          label: "Selected outstanding",
          value: formatRupee(outstandingValue),
          tone: (Number(outstandingValue) > 0 ? "warning" : "success") as "warning" | "success",
        },
        {
          label: "Ready",
          value: selectedVendor ? "Yes" : "No",
          tone: (selectedVendor ? "success" : "default") as "success" | "default",
        },
      ]}
      statusBadge={{ label: "Read only", tone: "info" }}
    >
      {loading ? <ERPLoadingState label="Loading vendors..." /> : null}
      {!loading && error ? (
        <ERPErrorState
          title="Unable to load vendor outstanding"
          description={error}
          onRetry={() => void loadVendors()}
        />
      ) : null}

      {!loading && !error ? (
        <div className="space-y-6">
          {/* Vendor selector table */}
          <ERPSectionShell
            title="Vendor selector"
            description="Choose a vendor to inspect payable posture and navigate into the full ledger."
          >
            <div className="overflow-x-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium text-muted-foreground">Vendor</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">Code</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">Status</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((vendor) => {
                    const active = vendor.id === selectedVendorId;
                    return (
                      <tr
                        key={vendor.id}
                        onClick={() => setSelectedVendorId(vendor.id)}
                        className={`cursor-pointer border-t transition-colors ${active ? "bg-muted/60" : "hover:bg-muted/40"}`}
                      >
                        <td className="px-3 py-2 font-medium">
                          {vendor.display_name || vendor.name}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{vendor.vendor_code}</td>
                        <td className="px-3 py-2">
                          <ERPStatusBadge status={vendor.status} label={vendor.status} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Link
                            href={`/admin/vendors/${vendor.id}`}
                            className="font-semibold text-primary underline underline-offset-4"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Open detail
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {vendors.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                        No vendors found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </ERPSectionShell>

          {/* Outstanding detail */}
          <ERPSectionShell
            title="Outstanding summary"
            description="Current payable posture for the selected vendor. Use this with the ledger page for drill-down."
            actions={
              selectedVendorId ? (
                <Link
                  href={`/admin/vendors/${selectedVendorId}`}
                  className="workspace-pill px-3 py-2 text-xs font-semibold"
                >
                  Open vendor detail
                </Link>
              ) : null
            }
          >
            {!selectedVendorId && (
              <p className="text-sm text-muted-foreground">Select a vendor above to see outstanding detail.</p>
            )}

            {loadingDetail ? <ERPLoadingState label="Loading vendor outstanding detail..." /> : null}

            {!loadingDetail && selectedVendor && outstanding ? (
              <>
                <ERPDetailGrid
                  columns={4}
                  items={[
                    { label: "Vendor", value: selectedVendor.display_name || selectedVendor.name },
                    { label: "Vendor Code", value: selectedVendor.vendor_code },
                    { label: "Contact", value: selectedVendor.contact_person ?? "—" },
                    { label: "Status", value: selectedVendor.status },
                    { label: "Opening balance", value: formatRupee(outstanding.opening_balance) },
                    { label: "Purchase bills", value: formatRupee(outstanding.purchase_bills) },
                    { label: "Vendor payments", value: formatRupee(outstanding.vendor_payments) },
                    { label: "Outstanding", value: formatRupee(outstanding.outstanding) },
                    { label: "Purchase returns", value: formatRupee(outstanding.purchase_returns) },
                    { label: "Debit notes", value: formatRupee(outstanding.debit_notes) },
                    { label: "Adjustments", value: formatRupee(outstanding.adjustments) },
                    { label: "Semantic note", value: outstanding.semantic_note },
                  ]}
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/admin/vendors/${selectedVendorId}`}
                    className="workspace-pill px-3 py-2 text-xs font-semibold"
                  >
                    Open vendor detail
                  </Link>
                  <Link
                    href={ROUTES.admin.vendorsLedger}
                    className="workspace-pill px-3 py-2 text-xs font-semibold"
                  >
                    Inspect ledger control room
                  </Link>
                </div>
              </>
            ) : null}
          </ERPSectionShell>
        </div>
      ) : null}
    </ERPPageShell>
  );
}
