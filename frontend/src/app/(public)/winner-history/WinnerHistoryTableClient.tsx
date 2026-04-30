"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import type { PublicWinner } from "@/lib/public-api";
import { cn } from "@/lib/utils";

function formatDrawDate(value: string | null | undefined): string {
  if (!value) return "—";

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;

  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function WinnerHistoryTableClient({
  winners,
}: {
  winners: PublicWinner[];
}) {
  const [query, setQuery] = useState("");
  const [batch, setBatch] = useState("");

  const batches = useMemo(() => {
    const values = new Set<string>();
    winners.forEach((winner) => values.add(winner.batch_code));
    return Array.from(values).sort();
  }, [winners]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return winners.filter((winner) => {
      const matchesBatch = !batch || winner.batch_code === batch;
      if (!matchesBatch) return false;
      if (!normalized) return true;

      const haystack = [
        winner.batch_code,
        String(winner.draw_month),
        winner.lucky_id || "",
        winner.public_commit_hash || winner.committed_hash || "",
        winner.verification_status || "",
        winner.product_name || "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [winners, query, batch]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-[1.9rem] border border-white/75 bg-white/82 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] lg:grid-cols-[1.2fr_0.8fr]">
        <label className="grid gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Search
          </span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Batch, month, Lucky ID, winner name, product"
              className="h-12 w-full rounded-2xl border border-slate-200/80 bg-white/90 pl-10 pr-4 text-sm text-foreground outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />
          </div>
        </label>

        <label className="grid gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Batch
          </span>
          <select
            value={batch}
            onChange={(event) => setBatch(event.target.value)}
            className="h-12 w-full rounded-2xl border border-slate-200/80 bg-white/90 px-3 text-sm text-foreground outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          >
            <option value="">All batches</option>
            {batches.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-[1.6rem] border border-white/75 bg-white/82 px-5 py-4 text-sm text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
        Showing {filtered.length} of {winners.length} published records.
      </div>

      <div className="hidden overflow-x-auto rounded-[2rem] border border-white/75 bg-white/82 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.62)] lg:block">
        <table
          className="min-w-full border-separate border-spacing-0"
          aria-label="Winner history records"
        >
          <thead>
            <tr className="text-left">
              {[
                "Batch",
                "Draw month",
                "Lucky ID",
                "Verification",
                "Public commit hash",
                "Product",
                "Waived EMI",
                "Waived amount",
                "Draw date",
              ].map((label) => (
                <th
                  key={label}
                  className="border-b border-slate-200/80 bg-white/85 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((winner) => (
              <tr key={winner.id} className="align-top">
                <td className="border-b border-slate-200/70 px-4 py-3 text-sm text-foreground">
                  {winner.batch_code}
                </td>
                <td className="border-b border-slate-200/70 px-4 py-3 text-sm text-foreground">
                  Month {winner.draw_month}
                </td>
                <td className="border-b border-slate-200/70 px-4 py-3 text-sm text-foreground">
                  {winner.lucky_id || "—"}
                </td>
                <td className="border-b border-slate-200/70 px-4 py-3 text-sm text-foreground">
                  {winner.verification_status || "unavailable"}
                </td>
                <td className="border-b border-slate-200/70 px-4 py-3 text-xs text-muted-foreground">
                  <span className="font-mono">
                    {winner.public_commit_hash || winner.committed_hash || "—"}
                  </span>
                </td>
                <td className="border-b border-slate-200/70 px-4 py-3 text-sm text-foreground">
                  {winner.product_name || "—"}
                </td>
                <td className="border-b border-slate-200/70 px-4 py-3 text-sm text-muted-foreground">
                  {winner.waived_emi_count ?? 0}
                </td>
                <td className="border-b border-slate-200/70 px-4 py-3 text-sm text-muted-foreground">
                  {winner.waived_amount ? `₹${winner.waived_amount}` : "—"}
                </td>
                <td className="border-b border-slate-200/70 px-4 py-3 text-sm text-muted-foreground">
                  {formatDrawDate(winner.draw_date)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:hidden">
        {filtered.map((winner) => (
          <div
            key={winner.id}
            className={cn(
              "rounded-[2rem] border border-white/75 bg-white/82 p-6 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.62)]"
            )}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Batch {winner.batch_code} · Month {winner.draw_month}
            </div>
            <div className="mt-3 text-xl font-semibold text-foreground">
              Lucky ID {winner.lucky_id || "—"}
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {formatDrawDate(winner.draw_date)} · Verification{" "}
              {winner.verification_status || "unavailable"}
            </p>
            <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
              <div className="rounded-xl border border-white/75 bg-white/70 px-4 py-3">
                Product: {winner.product_name || "—"}
              </div>
              <div className="rounded-xl border border-white/75 bg-white/70 px-4 py-3 text-xs break-all">
                Public commit hash: {winner.public_commit_hash || winner.committed_hash || "—"}
              </div>
              <div className="rounded-xl border border-white/75 bg-white/70 px-4 py-3">
                Waived EMI: {winner.waived_emi_count ?? 0} · Waived amount:{" "}
                {winner.waived_amount ? `₹${winner.waived_amount}` : "—"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
