"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import DataTable from "@/components/ui/DataTable";
import PortalPage from "@/components/ui/PortalPage";
import { downloadCsv } from "@/lib/export/csv";
import { listBatches } from "@/services/batches";
import type { BatchRecord } from "@/services/batches";
import { listLuckyDraws, type LuckyDrawRecord } from "@/services/draws";

export default function AdminLuckyDrawListPage({ historyOnly = false }: { historyOnly?: boolean }) {
  const router = useRouter();

  const [batch, setBatch] = useState("");
  const [revealed, setRevealed] = useState(historyOnly ? "true" : "");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<LuckyDrawRecord[]>([]);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [batches, setBatches] = useState<BatchRecord[]>([]);

  const requestKey = `${batch}|${revealed}|${page}`;

  useEffect(() => {
    listBatches().then(setBatches).catch(() => setBatches([]));
  }, []);

  useEffect(() => {
    let cancelled = false;

    listLuckyDraws({
      batch: batch || undefined,
      revealed: revealed === "" ? undefined : revealed === "true",
      page,
    })
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
        setError(err instanceof Error ? err.message : "Failed to load lucky draws");
        setLoadedKey(requestKey);
      });

    return () => {
      cancelled = true;
    };
  }, [batch, page, requestKey, revealed]);

  const loading = loadedKey !== requestKey;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(count / 10)), [count]);

  return (
    <PortalPage
      title={historyOnly ? "Lucky Draw History" : "Lucky Draw Operations"}
      subtitle="Track commitments, reveals, and winner outcomes with explicit draw actions."
      actions={[{ href: "/admin/lucky-draws/create", label: "Execute Draw" }]}
    >
      <section style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr auto", marginBottom: 12 }}>
        <select value={batch} onChange={(event) => setBatch(event.target.value)}>
          <option value="">All batches</option>
          {batches.map((item) => (
            <option value={item.id} key={item.id}>{item.batch_code || `Batch #${item.id}`}</option>
          ))}
        </select>

        <select value={revealed} onChange={(event) => setRevealed(event.target.value)}>
          <option value="">All states</option>
          <option value="false">Commit created, awaiting reveal</option>
          <option value="true">Revealed</option>
        </select>

        <button type="button" onClick={() => setPage(1)}>Apply</button>
      </section>

      <section style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button
          type="button"
          disabled={rows.length === 0}
          onClick={() =>
            downloadCsv(
              historyOnly ? "lucky-draw-history.csv" : "lucky-draws.csv",
              [
                { key: "id", header: "draw_id" },
                { key: "batch_code", header: "batch", format: (row) => row.batch_code || (row.batch ? `Batch #${row.batch}` : "") },
                { key: "draw_month", header: "draw_month" },
                { key: "is_revealed", header: "state", format: (row) => (row.is_revealed ? "REVEALED" : "PENDING_REVEAL") },
                { key: "winner_lucky_number", header: "winner_lucky_number", format: (row) => row.winner_lucky_number || "" },
                { key: "draw_date", header: "draw_date" },
              ],
              rows,
            )
          }
        >
          Export Current View
        </button>
      </section>

      <DataTable<LuckyDrawRecord>
        rows={rows}
        loading={loading}
        error={error}
        emptyText="No draw records found for selected filter."
        onRowClick={(row) => router.push(`/admin/lucky-draws/${row.id}`)}
        columns={[
          { key: "id", title: "Draw ID" },
          { key: "batch_code", title: "Batch", render: (row) => row.batch_code || (row.batch ? `Batch #${row.batch}` : "-") },
          { key: "draw_month", title: "Draw Month" },
          { key: "is_revealed", title: "State", render: (row) => (row.is_revealed ? "REVEALED" : "PENDING REVEAL") },
          { key: "winner_lucky_number", title: "Winner Lucky ID", render: (row) => (row.winner_lucky_number ? `#${row.winner_lucky_number}` : "-") },
          { key: "draw_date", title: "Draw Date", render: (row) => row.draw_date ? new Date(row.draw_date).toLocaleString() : "-" },
        ]}
      />

      <section style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
        <span>Total records: {count}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
          <span>Page {page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</button>
        </div>
      </section>
    </PortalPage>
  );
}
