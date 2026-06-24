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
import { getAdminVendor, getAdminVendorOutstanding, listAdminVendorLedger, listAdminVendors } from "@/services/vendor-ops";

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

export default function AdminVendorsLedgerPage() {
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vendors, setVendors] = useState<Row[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<Row | null>(null);
  const [ledgerRows, setLedgerRows] = useState<Row[]>([]);
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
      setError(err instanceof Error ? err.message : "Failed to load vendor ledger.");
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

    let mounted = true;
    setLoadingDetail(true);
    Promise.all([
      getAdminVendor(selectedVendorId),
      listAdminVendorLedger(selectedVendorId),
      getAdminVendorOutstanding(selectedVendorId),
    ])
      .then(([vendorPayload, ledgerPayload, outstandingPayload]) => {
        if (!mounted) return;
        setSelectedVendor(vendorPayload as Row);
        setLedgerRows((ledgerPayload as { results?: Row[] }).results ?? []);
        setOutstanding(outstandingPayload as Record<string, unknown>);
        setError(null);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load vendor ledger detail.");
        setSelectedVendor(null);
        setLedgerRows([]);
        setOutstanding(null);
      })
      .finally(() => {
        if (mounted) setLoadingDetail(false);
      });

    return () => {
      mounted = false;
    };
  }, [selectedVendorId]);

  const vendorCount = vendors.length;
  const outstandingValue = String(outstanding?.outstanding ?? "0.00");
  const ledgerDebit = useMemo(
    () => ledgerRows.reduce((sum, row) => sum + Number(row.debit ?? 0), 0),
    [ledgerRows]
  );
  const ledgerCredit = useMemo(
    () => ledgerRows.reduce((sum, row) => sum + Number(row.credit ?? 0), 0),
    [ledgerRows]
  );

  return (
    <ERPPageShell
      title="Vendor Ledger"
      subtitle="Vendor-by-vendor payable ledger drill-down with live outstanding snapshot."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Vendors", href: ROUTES.admin.vendors },
        { label: "Ledger" },
      ]}
      actions={selectedVendorId ? [{ href: `/admin/vendors/${selectedVendorId}`, label: "Open vendor detail", variant: "secondary" }] : undefined}
      stats={[
        { label: "Vendors", value: vendorCount, tone: "info" },
        { label: "Ledger rows", value: ledgerRows.length, tone: "success" },
        { label: "Outstanding", value: formatRupee(outstandingValue), tone: "warning" },
      ]}
      statusBadge={{ label: "Read only", tone: "info" }}
    >
      {loading ? <ERPLoadingState label="Loading vendors..." /> : null}
      {!loading && error ? <ERPErrorState title="Unable to load vendor ledger" description={error} onRetry={() => void loadVendors()} /> : null}

      {!loading && !error ? (
        <div className="space-y-6">
          <ERPSectionShell title="Vendor selector" description="Choose a vendor to inspect its ledger and payable posture.">
            <div className="overflow-x-auto rounded-2xl border">
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
                            Open
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
            title="Ledger snapshot"
            description="Balanced vendor payable evidence with the selected vendor's current outstanding amount."
            actions={
              selectedVendorId ? (
                <Link href={`/admin/vendors/${selectedVendorId}`} className="workspace-pill px-3 py-2 text-xs font-semibold">
                  Open vendor profile
                </Link>
              ) : null
            }
          >
            {loadingDetail ? <ERPLoadingState label="Loading vendor ledger detail..." /> : null}
            {!loadingDetail && selectedVendor ? (
              <>
                <ERPDetailGrid
                  columns={4}
                  items={[
                    { label: "Vendor", value: text(selectedVendor.display_name || selectedVendor.name) },
                    { label: "Vendor Code", value: text(selectedVendor.vendor_code) },
                    { label: "Contact", value: text(selectedVendor.contact_person) },
                    { label: "Outstanding", value: formatRupee(outstandingValue) },
                    { label: "Debit total", value: formatRupee(ledgerDebit) },
                    { label: "Credit total", value: formatRupee(ledgerCredit) },
                    { label: "Ledger rows", value: ledgerRows.length },
                    { label: "Semantic note", value: text(outstanding?.semantic_note) },
                  ]}
                />

                <div className="mt-4 overflow-x-auto rounded-2xl border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/40 text-left">
                      <tr>
                        <th className="px-3 py-2">Posted</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Reference</th>
                        <th className="px-3 py-2 text-right">Debit</th>
                        <th className="px-3 py-2 text-right">Credit</th>
                        <th className="px-3 py-2 text-right">Balance after</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerRows.map((row) => (
                        <tr key={String(row.id)} className="border-t">
                          <td className="px-3 py-2">{text(row.posted_at || row.movement_date)}</td>
                          <td className="px-3 py-2">{text(row.entry_type || row.movement_type)}</td>
                          <td className="px-3 py-2">{text(row.reference_no || row.reference_id)}</td>
                          <td className="px-3 py-2 text-right">{formatRupee(row.debit)}</td>
                          <td className="px-3 py-2 text-right">{formatRupee(row.credit)}</td>
                          <td className="px-3 py-2 text-right">{formatRupee(row.balance_after)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {ledgerRows.length === 0 ? (
                  <div className="mt-4 text-sm text-muted-foreground">No ledger entries are available for the selected vendor.</div>
                ) : null}
              </>
            ) : null}
          </ERPSectionShell>
        </div>
      ) : null}
    </ERPPageShell>
  );
}
