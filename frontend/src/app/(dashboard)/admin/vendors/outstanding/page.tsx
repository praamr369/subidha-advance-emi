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
import { getAdminVendor, getAdminVendorOutstanding, listAdminVendors } from "@/services/vendor-ops";

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

export default function AdminVendorsOutstandingPage() {
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vendors, setVendors] = useState<Row[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<Row | null>(null);
  const [outstanding, setOutstanding] = useState<Record<string, unknown> | null>(null);

  async function loadVendors() {
    setLoading(true);
    try {
      const payload = (await listAdminVendors()) as { results?: Row[] };
      const nextVendors = payload.results ?? [];
      setVendors(nextVendors);
      setSelectedVendorId((current) => current ?? (nextVendors.length ? Number(nextVendors[0].id) : null));
      setError(null);
    } catch (err) {
      setVendors([]);
      setError(err instanceof Error ? err.message : "Failed to load vendor outstanding records.");
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
    Promise.all([getAdminVendor(selectedVendorId), getAdminVendorOutstanding(selectedVendorId)])
      .then(([vendorPayload, outstandingPayload]) => {
        if (!mounted) return;
        setSelectedVendor(vendorPayload as Row);
        setOutstanding(outstandingPayload as Record<string, unknown>);
        setError(null);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load vendor outstanding detail.");
        setSelectedVendor(null);
        setOutstanding(null);
      })
      .finally(() => {
        if (mounted) setLoadingDetail(false);
      });

    return () => {
      mounted = false;
    };
  }, [selectedVendorId]);

  const outstandingValue = String(outstanding?.outstanding ?? "0.00");

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
      actions={selectedVendorId ? [{ href: `/admin/vendors/${selectedVendorId}`, label: "Open vendor detail", variant: "secondary" }] : undefined}
      stats={[
        { label: "Vendors", value: vendors.length, tone: "info" },
        { label: "Selected outstanding", value: formatRupee(outstandingValue), tone: "warning" },
        { label: "Ready", value: selectedVendor ? "Yes" : "No", tone: selectedVendor ? "success" : "default" },
      ]}
      statusBadge={{ label: "Read only", tone: "info" }}
    >
      {loading ? <ERPLoadingState label="Loading vendors..." /> : null}
      {!loading && error ? <ERPErrorState title="Unable to load vendor outstanding" description={error} onRetry={() => void loadVendors()} /> : null}

      {!loading && !error ? (
        <div className="space-y-6">
          <ERPSectionShell title="Vendor selector" description="Choose a vendor to inspect payable posture and navigate into the full ledger.">
            <div className="overflow-x-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-3 py-2">Vendor</th>
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((vendor) => {
                    const id = Number(vendor.id);
                    const active = id === selectedVendorId;
                    return (
                      <tr
                        key={String(vendor.id)}
                        onClick={() => setSelectedVendorId(id)}
                        className={`cursor-pointer border-t ${active ? "bg-muted/60" : "hover:bg-muted/40"}`}
                      >
                        <td className="px-3 py-2 font-medium">{text(vendor.display_name || vendor.name)}</td>
                        <td className="px-3 py-2">{text(vendor.vendor_code)}</td>
                        <td className="px-3 py-2">
                          <ERPStatusBadge status={text(vendor.status)} label={text(vendor.status)} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Link href={`/admin/vendors/${id}`} className="font-semibold underline underline-offset-4">
                            Open detail
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ERPSectionShell>

          <ERPSectionShell
            title="Outstanding summary"
            description="Current payable posture for the selected vendor. Use this with the ledger page for drill-down."
            actions={
              selectedVendorId ? (
                <Link href={`/admin/vendors/${selectedVendorId}`} className="workspace-pill px-3 py-2 text-xs font-semibold">
                  Open vendor detail
                </Link>
              ) : null
            }
          >
            {loadingDetail ? <ERPLoadingState label="Loading vendor outstanding detail..." /> : null}
            {!loadingDetail && selectedVendor ? (
              <>
                <ERPDetailGrid
                  columns={4}
                  items={[
                    { label: "Vendor", value: text(selectedVendor.display_name || selectedVendor.name) },
                    { label: "Vendor Code", value: text(selectedVendor.vendor_code) },
                    { label: "Contact", value: text(selectedVendor.contact_person) },
                    { label: "Status", value: text(selectedVendor.status) },
                    { label: "Opening balance", value: formatRupee(outstanding?.opening_balance) },
                    { label: "Purchase bills", value: formatRupee(outstanding?.purchase_bills) },
                    { label: "Vendor payments", value: formatRupee(outstanding?.vendor_payments) },
                    { label: "Outstanding", value: formatRupee(outstandingValue) },
                    { label: "Purchase returns", value: formatRupee(outstanding?.purchase_returns) },
                    { label: "Debit notes", value: formatRupee(outstanding?.debit_notes) },
                    { label: "Adjustments", value: formatRupee(outstanding?.adjustments) },
                    { label: "Semantic note", value: text(outstanding?.semantic_note) },
                  ]}
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/admin/vendors/${selectedVendorId}`} className="workspace-pill px-3 py-2 text-xs font-semibold">
                    Open vendor detail
                  </Link>
                  <Link href={ROUTES.admin.vendorsLedger} className="workspace-pill px-3 py-2 text-xs font-semibold">
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
