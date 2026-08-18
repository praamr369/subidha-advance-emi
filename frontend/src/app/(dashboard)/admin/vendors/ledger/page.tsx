"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import ERPDetailGrid from "@/components/erp/ERPDetailGrid";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import {
  getAdminVendorOutstanding,
  listAdminVendorLedger,
  type VendorLedgerEntry,
  type VendorOutstanding,
} from "@/services/vendor-ops";
import { listVendors, type Vendor } from "@/services/vendors";

export default function AdminVendorsLedgerPage() {
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [ledgerRows, setLedgerRows] = useState<VendorLedgerEntry[]>([]);
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
      setLedgerRows([]);
      setOutstanding(null);
      return;
    }

    const found = vendors.find((v) => v.id === selectedVendorId) ?? null;
    setSelectedVendor(found);

    let mounted = true;
    setLoadingDetail(true);
    Promise.all([
      listAdminVendorLedger(selectedVendorId),
      getAdminVendorOutstanding(selectedVendorId),
    ])
      .then(([ledgerPayload, outstandingPayload]) => {
        if (!mounted) return;
        setLedgerRows(ledgerPayload.results ?? []);
        setOutstanding(outstandingPayload);
        setError(null);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load vendor ledger detail.");
        setLedgerRows([]);
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
  const ledgerDebit = useMemo(
    () => ledgerRows.reduce((sum, row) => sum + Number(row.debit), 0),
    [ledgerRows]
  );
  const ledgerCredit = useMemo(
    () => ledgerRows.reduce((sum, row) => sum + Number(row.credit), 0),
    [ledgerRows]
  );

  return (
    <ERPPageShell
      eyebrow="Purchases & Vendors"
      title="Vendor Ledger"
      subtitle="Vendor-by-vendor payable ledger drill-down with live outstanding snapshot."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Vendors", href: ROUTES.admin.vendors },
        { label: "Ledger" },
      ]}
      actions={
        selectedVendorId
          ? [{ href: `/admin/vendors/${selectedVendorId}`, label: "Open vendor detail", variant: "secondary" }]
          : undefined
      }
      stats={[
        { label: "Vendors", value: vendors.length, tone: "info" },
        { label: "Ledger rows", value: ledgerRows.length, tone: "success" },
        { label: "Outstanding", value: formatRupee(outstandingValue), tone: "warning" },
      ]}
      statusBadge={{ label: "Read only", tone: "info" }}
    >
      {loading ? <ERPLoadingState label="Loading vendors..." /> : null}
      {!loading && error ? (
        <ERPErrorState
          title="Unable to load vendor ledger"
          description={error}
          onRetry={() => void loadVendors()}
        />
      ) : null}

      {!loading && !error ? (
        <div className="space-y-6">
          <ERPSectionShell
            title="Vendor selector"
            description="Choose a vendor to inspect its ledger and payable posture."
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
                        <td className="px-3 py-2 font-medium">{vendor.display_name || vendor.name}</td>
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
                            Open
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

          <ERPSectionShell
            title="Ledger snapshot"
            description="Balanced vendor payable evidence with the selected vendor's current outstanding amount."
            actions={
              selectedVendorId ? (
                <Link
                  href={`/admin/vendors/${selectedVendorId}`}
                  className="workspace-pill px-3 py-2 text-xs font-semibold"
                >
                  Open vendor profile
                </Link>
              ) : null
            }
          >
            {!selectedVendorId && (
              <p className="text-sm text-muted-foreground">Select a vendor above to view the ledger.</p>
            )}

            {loadingDetail ? <ERPLoadingState label="Loading vendor ledger detail..." /> : null}

            {!loadingDetail && selectedVendor ? (
              <>
                <ERPDetailGrid
                  columns={4}
                  items={[
                    { label: "Vendor", value: selectedVendor.display_name || selectedVendor.name },
                    { label: "Vendor Code", value: selectedVendor.vendor_code },
                    { label: "Contact", value: selectedVendor.contact_person ?? "—" },
                    { label: "Outstanding", value: formatRupee(outstandingValue) },
                    { label: "Debit total", value: formatRupee(ledgerDebit) },
                    { label: "Credit total", value: formatRupee(ledgerCredit) },
                    { label: "Ledger rows", value: ledgerRows.length },
                    { label: "Semantic note", value: outstanding?.semantic_note ?? "—" },
                  ]}
                />

                <div className="mt-4 overflow-x-auto rounded-xl border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/40 text-left">
                      <tr>
                        <th className="px-3 py-2 font-medium text-muted-foreground">Posted</th>
                        <th className="px-3 py-2 font-medium text-muted-foreground">Type</th>
                        <th className="px-3 py-2 font-medium text-muted-foreground">Reference</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Debit</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Credit</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground">Balance after</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerRows.map((row) => (
                        <tr key={row.id} className="border-t">
                          <td className="px-3 py-2">{row.posted_at.slice(0, 10)}</td>
                          <td className="px-3 py-2">{row.entry_type.replace(/_/g, " ")}</td>
                          <td className="px-3 py-2">{row.source_reference || "—"}</td>
                          <td className="px-3 py-2 text-right">{formatRupee(row.debit)}</td>
                          <td className="px-3 py-2 text-right">{formatRupee(row.credit)}</td>
                          <td className="px-3 py-2 text-right">{formatRupee(row.balance_after)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {ledgerRows.length === 0 ? (
                  <div className="mt-4 text-sm text-muted-foreground">
                    No ledger entries available for the selected vendor.
                  </div>
                ) : null}
              </>
            ) : null}
          </ERPSectionShell>
        </div>
      ) : null}
    </ERPPageShell>
  );
}
