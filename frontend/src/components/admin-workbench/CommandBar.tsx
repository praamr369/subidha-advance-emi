"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useRef, useState } from "react";

import type { AdminWorkbenchDefinition } from "@/domains/admin-workbenches/workbench-config";
import { ROUTES } from "@/lib/routes";

export default function CommandBar({
  definition,
}: {
  definition: AdminWorkbenchDefinition;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const matches = definition.tabs.filter((tab) => {
    if (!deferredQuery) return true;
    return `${tab.label} ${tab.description}`.toLowerCase().includes(deferredQuery);
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 text-sm font-semibold text-foreground shadow-sm transition hover:border-[var(--surface-border-strong)]"
      >
        <Search className="h-4 w-4" />
        Workbench commands
        <kbd className="rounded-md border border-border bg-[var(--surface-muted)] px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
          Ctrl K
        </kbd>
      </button>

      {open ? (
        <div className="dashboard-app fixed inset-0 z-[170] flex items-start justify-center bg-black/35 px-4 pt-[12vh]">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-[var(--surface-card-elevated)] shadow-2xl">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${definition.title} workflows`}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-[var(--surface-muted)] hover:text-foreground"
                aria-label="Close command bar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[55vh] overflow-y-auto p-2">
              <Link
                href={ROUTES.admin.globalSearch}
                onClick={() => setOpen(false)}
                className="mb-2 flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm font-semibold text-sky-950"
              >
                <span>Open global search</span>
                <span className="text-xs font-medium text-sky-700">All admin records</span>
              </Link>
              {matches.map((tab) => (
                <Link
                  key={tab.id}
                  href={tab.href ?? `/admin/${definition.id}?tab=${tab.id}`}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-3 py-3 transition hover:bg-[var(--surface-muted)]"
                >
                  <div className="text-sm font-semibold text-foreground">{tab.label}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{tab.description}</div>
                </Link>
              ))}
              {matches.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No matching workflow.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
