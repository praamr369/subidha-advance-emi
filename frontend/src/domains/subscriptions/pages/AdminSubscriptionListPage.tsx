"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import PortalPage from "@/components/ui/PortalPage";
import DataTable from "@/components/ui/DataTable";
import { listBatches } from "@/services/batches";
import type { BatchRecord } from "@/services/batches";
import { listSubscriptions, type SubscriptionRecord } from "@/services/subscriptions";
import { downloadCsv } from "@/lib/export/csv";

function formatMoney(value: string | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

export default function AdminSubscriptionListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [batchId, setBatchId] = useState(searchParams.get("batch_id") || "");
  const [page, setPage] = useState(Number(searchParams.get("page") || 1));

  const [rows, setRows] = useState<SubscriptionRecord[]>([]);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [batches, setBatches] = useState<BatchRecord[]>([]);

  useEffect(() => {
    listBatches()
      .then((items) => setBatches(items))
      .catch(() => setBatches([]));
  }, []);

  const requestKey = `${query}|${status}|${batchId}|${page}`;

  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (status) params.set("status", status);
    if (batchId) params.set("batch_id", batchId);
    if (page > 1) params.set("page", String(page));

    router.replace(`/admin/subscriptions${params.toString() ? `?${params}` : ""}`);

    let cancelled = false;

    listSubscriptions({ q: query || undefined, status: status || undefined, batch_id: batchId || undefined, page })
      .then((payload) => {
        if (cancelled) return;
        setRows(payload.results || []);
        setCount(payload.count || 0);
        setError(null);
        setLoadedKey(requestKey);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRows([]);
        setCount(0);
        setError(err instanceof Error ? err.message : "Failed to load subscriptions");
        setLoadedKey(requestKey);
      });

    return () => {
      cancelled = true;
    };
  }, [batchId, page, query, requestKey, router, status]);

  const loading = loadedKey !== requestKey;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(count / 10)), [count]);

  return (
    <PortalPage title="Subscriptions" subtitle="Operational contract list with customer, batch and financial status context.">
      <section style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr 1fr auto", marginBottom: 16 }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by customer, phone, product or lucky ID" />

        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All status</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="WON">WON</option>
          <option value="COMPLETED">COMPLETED</option>
          <option value="DEFAULTED">DEFAULTED</option>
        </select>

        <select value={batchId} onChange={(event) => setBatchId(event.target.value)}>
          <option value="">All batches</option>
          {batches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.batch_code || `Batch #${batch.id}`}
            </option>
          ))}
        </select>

        <button type="button" onClick={() => setPage(1)}>
          Apply
        </button>
      </section>

      <section style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button
          type="button"
          disabled={rows.length === 0}
          onClick={() => downloadCsv("subscriptions.csv", [
            { key: "subscription_number", header: "subscription_number", format: (row) => row.subscription_number || `SUB-${row.id}` },
            { key: "customer_name", header: "customer", format: (row) => row.customer_name || `Customer #${row.customer}` },
            { key: "product_name", header: "product", format: (row) => row.product_name || `Product #${row.product}` },
            { key: "batch_code", header: "batch", format: (row) => row.batch_code || "" },
            { key: "lucky_number", header: "lucky_number", format: (row) => row.lucky_number || "" },
            { key: "monthly_amount", header: "monthly_amount" },
            { key: "total_amount", header: "total_amount" },
            { key: "status", header: "status" },
            { key: "delivery_status", header: "delivery_status", format: (row) => row.delivery_status || "PENDING" },
            { key: "start_date", header: "start_date" },
          ], rows)}
        >
          Export Current View
        </button>
      </section>

      <DataTable<SubscriptionRecord>
        rows={rows}
        loading={loading}
        error={error}
        emptyText="No subscriptions match this filter."
        onRowClick={(row) => router.push(`/admin/subscriptions/${row.id}`)}
        columns={[
          { key: "subscription_number", title: "Subscription #", render: (row) => row.subscription_number || `SUB-${row.id}` },
          { key: "customer_name", title: "Customer", render: (row) => row.customer_name || `Customer #${row.customer}` },
          { key: "product_name", title: "Product", render: (row) => row.product_name || `Product #${row.product}` },
          { key: "batch_code", title: "Batch", render: (row) => row.batch_code || "-" },
          { key: "lucky_number", title: "Lucky ID", render: (row) => (row.lucky_number ? `#${row.lucky_number}` : "-") },
          { key: "monthly_amount", title: "Monthly", align: "right", render: (row) => formatMoney(row.monthly_amount) },
          { key: "total_amount", title: "Total", align: "right", render: (row) => formatMoney(row.total_amount) },
          { key: "status", title: "Status" },
          { key: "delivery_status", title: "Delivery", render: (row) => row.delivery_status || "PENDING" },
          { key: "start_date", title: "Start Date" },
        ]}
      />

      <section style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
        <span>Total records: {count}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
            Previous
          </button>
          <span>
            Page {page} / {totalPages}
          </span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
            Next
          </button>
        </div>
      </section>
    </PortalPage>
  );
}
