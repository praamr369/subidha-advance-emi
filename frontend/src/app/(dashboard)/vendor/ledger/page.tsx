"use client";

import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { listVendorLedger } from "@/services/vendor-ops";

export default function VendorLedgerPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listVendorLedger()
      .then((payload) => {
        if (cancelled) return;
        setRows((payload.results as Record<string, unknown>[]) || []);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setRows([]);
        setError(err instanceof Error ? err.message : "Failed to load vendor ledger.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ERPPageShell title="Vendor Ledger" subtitle="Vendor-only ledger entries." statusBadge={{ label: "Read Only", tone: "info" }}>
      <ERPSectionShell
        title="Ledger Register"
        description="Read-only ledger entries scoped to the signed-in vendor account."
      >
        {loading ? <ERPLoadingState label="Loading vendor ledger..." /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load vendor ledger" description={error} /> : null}
        {!loading && !error && rows.length === 0 ? (
          <ERPEmptyState title="No ledger entries" description="No vendor ledger entries are available yet." />
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <div className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4 text-sm shadow-[inset_0_1px_0_var(--hairline-shine)]">
            <div className="grid gap-2">
              {rows.map((row, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/60 bg-[color-mix(in_oklab,var(--surface-muted)_40%,transparent)] px-3 py-2"
                >
                  <div className="text-sm font-semibold text-foreground">{String(row.entry_type)}</div>
                  <div className="text-xs text-muted-foreground">
                    Dr {String(row.debit)} · Cr {String(row.credit)} · Bal {String(row.balance_after)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
