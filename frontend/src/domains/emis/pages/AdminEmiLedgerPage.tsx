"use client";

import { useEffect, useState } from "react";

import PortalPage from "@/components/ui/PortalPage";
import DataTable from "@/components/ui/DataTable";
import { listEmis, type EmiRecord } from "@/services/emis";
import { downloadCsv } from "@/lib/export/csv";

function money(value: string | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

export default function AdminEmiLedgerPage() {
  const [status, setStatus] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [rows, setRows] = useState<EmiRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState("");

  const requestKey = `${status}|${overdueOnly}`;

  useEffect(() => {
    let cancelled = false;

    listEmis({ status: status || undefined, overdue_only: overdueOnly })
      .then((payload) => {
        if (cancelled) return;
        setRows(payload.results || []);
        setError(null);
        setLoadedKey(requestKey);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRows([]);
        setError(err instanceof Error ? err.message : "Failed to load advance EMI ledger");
        setLoadedKey(requestKey);
      });

    return () => {
      cancelled = true;
    };
  }, [overdueOnly, requestKey, status]);

  const loading = loadedKey !== requestKey;

  return (
    <PortalPage title="Advance EMI Ledger" subtitle="Operational due/paid/waived view for quick collection and reconciliation actions.">
      <section style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All status</option>
          <option value="PENDING">PENDING</option>
          <option value="PAID">PAID</option>
          <option value="WAIVED">WAIVED</option>
        </select>
        <label>
          <input type="checkbox" checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} /> Overdue only
        </label>
      </section>

      <section style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button
          type="button"
          disabled={rows.length === 0}
          onClick={() => downloadCsv("emi-ledger.csv", [
            { key: "month_no", header: "month_no" },
            { key: "subscription", header: "subscription" },
            { key: "due_date", header: "due_date" },
            { key: "amount", header: "amount" },
            { key: "total_paid", header: "paid", format: (row) => row.total_paid || row.paid_amount || "" },
            { key: "waived_amount", header: "waived_amount" },
            { key: "balance_amount", header: "outstanding", format: (row) => row.balance_amount || row.outstanding_amount || "" },
            { key: "status", header: "status" },
            { key: "lucky_number", header: "lucky_number" },
          ], rows)}
        >
          Export Current View
        </button>
      </section>

      <DataTable<EmiRecord>
        rows={rows}
        loading={loading}
        error={error}
        emptyText="No advance EMI records found for this filter."
        columns={[
          { key: "month_no", title: "Advance EMI #" },
          { key: "subscription", title: "Subscription" },
          { key: "due_date", title: "Due Date" },
          { key: "amount", title: "Amount", align: "right", render: (row) => money(row.amount) },
          { key: "total_paid", title: "Paid", align: "right", render: (row) => money(row.total_paid || row.paid_amount) },
          { key: "waived_amount", title: "Waived", align: "right", render: (row) => money(row.waived_amount) },
          { key: "balance_amount", title: "Outstanding", align: "right", render: (row) => money(row.balance_amount || row.outstanding_amount) },
          { key: "status", title: "Status" },
          { key: "lucky_number", title: "Lucky ID", render: (row) => (row.lucky_number ? `#${row.lucky_number}` : "-") },
        ]}
      />
    </PortalPage>
  );
}
