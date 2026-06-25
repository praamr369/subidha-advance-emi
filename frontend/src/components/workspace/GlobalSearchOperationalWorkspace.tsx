"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import EmptyState from "@/components/feedback/EmptyState";
import type { AdminGlobalSearchResult } from "@/services/admin-erp";

import OperationalResizableWorkspace from "./OperationalResizableWorkspace";

import { cn } from "@/lib/utils";

function selectionKey(result: AdminGlobalSearchResult) {
  return `${result.type}:${result.deep_link}:${result.title}`;
}

export function GlobalSearchOperationalWorkspace({
  results,
}: {
  results: AdminGlobalSearchResult[];
}) {
  const [userSelectedKey, setUserSelectedKey] = useState<string | null>(null);

  const activeKey = useMemo(() => {
    if (results.length === 0) return null;
    const keys = results.map(selectionKey);
    if (userSelectedKey && keys.includes(userSelectedKey)) {
      return userSelectedKey;
    }
    return keys[0] ?? null;
  }, [results, userSelectedKey]);

  const selected = useMemo(() => {
    if (!activeKey) return null;
    return results.find((r) => selectionKey(r) === activeKey) ?? null;
  }, [results, activeKey]);

  const leftPane = (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground">Results</h2>
      <p className="mt-1 text-xs text-muted-foreground">{results.length} record(s).</p>
      <ul className="mt-4 flex max-h-[min(68vh,620px)] flex-col gap-2 overflow-y-auto pr-1">
        {results.map((result) => {
          const key = selectionKey(result);
          const active = key === activeKey;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => setUserSelectedKey(key)}
                aria-pressed={active}
                className={cn(
                  "w-full rounded-xl border px-3 py-3 text-left transition",
                  active
                    ? "border-foreground bg-muted/40 shadow-sm"
                    : "border-border bg-background hover:bg-muted/25"
                )}
              >
                <div className="text-sm font-semibold text-foreground">{result.title}</div>
                <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{result.subtitle}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    {result.type}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{result.status}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );

  const rightPane = selected ? (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {selected.type}
      </div>
      <h2 className="mt-1 text-lg font-semibold text-foreground">{selected.title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{selected.subtitle}</p>
      <p className="mt-3 text-xs text-muted-foreground">Status: {selected.status}</p>
      <div className="mt-6">
        <Link
          href={selected.deep_link}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-95"
        >
          Open record
        </Link>
      </div>
    </section>
  ) : (
    <div className="rounded-xl border border-dashed border-border bg-card/60 p-6">
      <EmptyState
        title="Select a result"
        description="Choose a row in the results list to preview the record summary."
        tone="info"
      />
    </div>
  );

  return (
    <OperationalResizableWorkspace
      storageKey="admin-global-search-v1"
      defaultLeftPercent={40}
      minLeftPercent={28}
      minRightPercent={30}
      left={leftPane}
      right={rightPane}
    />
  );
}
