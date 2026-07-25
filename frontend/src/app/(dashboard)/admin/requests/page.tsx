"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { getAdminWorkbenchItems, WorkbenchItem } from "@/services/admin-erp";
import { ROUTES } from "@/lib/routes";

type Scope = "action" | "history";

const SCOPE_TABS: { key: Scope; label: string }[] = [
  { key: "action", label: "Action Required" },
  { key: "history", label: "History" },
];

// KYC is an action queue, not a request log — it has no history rows.
const ALL_MODULES = ["ALL", "REQUEST", "SUBSCRIPTION", "LEAD", "SUPPORT", "KYC"] as const;
const MODULE_LABEL: Record<string, string> = {
  ALL: "All",
  REQUEST: "Product & Online Requests",
  SUBSCRIPTION: "Subscription Requests",
  LEAD: "Leads",
  SUPPORT: "Support",
  KYC: "KYC",
};

function formatSubmitted(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function UniversalRequestWorkbenchPage() {
  const [items, setItems] = useState<WorkbenchItem[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("action");
  const [filterModule, setFilterModule] = useState<string>("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page_size: "100" };
      if (filterModule !== "ALL") params.module = filterModule;
      if (scope === "history") params.scope = "history";
      const data = await getAdminWorkbenchItems(params);
      setItems(data.results);
      setCount(data.count ?? data.results.length);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to load workbench items");
      setItems([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [scope, filterModule]);

  useEffect(() => {
    load();
  }, [load]);

  const modules = useMemo(
    () => (scope === "history" ? ALL_MODULES.filter((m) => m !== "KYC") : ALL_MODULES),
    [scope]
  );

  // Keep the module filter valid when switching to History (KYC disappears).
  useEffect(() => {
    if (scope === "history" && filterModule === "KYC") setFilterModule("ALL");
  }, [scope, filterModule]);

  return (
    <ERPPageShell
      eyebrow="CRM & Requests"
      title="Universal Request Workbench"
      subtitle="Unified real-time queue of all inbound requests: public enquiries, support intake, product & online requests, and pending KYC."
      helperNote="No financial posting from this page. Each row links to the source module that owns its review and resolution workflow."
      helperTone="info"
      headerMode="erp"
    >
      <div className="space-y-5">
        {/* Scope tabs */}
        <div className="flex items-center justify-between gap-3 border-b border-border">
          <div className="flex gap-1">
            {SCOPE_TABS.map((tab) => {
              const active = scope === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setScope(tab.key)}
                  className={`relative px-4 py-2 text-sm font-medium transition ${
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  {active && (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => load()}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
          >
            Refresh
          </button>
        </div>

        {/* Quick filters */}
        <div className="flex flex-wrap items-center gap-2">
          {modules.map((mod) => (
            <button
              key={mod}
              onClick={() => setFilterModule(mod)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                filterModule === mod
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {MODULE_LABEL[mod] ?? mod}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">
            {loading ? "Loading…" : `${count} ${count === 1 ? "item" : "items"}`}
          </span>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
            <button
              type="button"
              onClick={() => load()}
              className="ml-3 rounded-lg border border-red-300 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100"
            >
              Retry
            </button>
          </div>
        )}

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Type</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Request Details</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Customer / Party</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Submitted</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      Loading requests…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      {scope === "action"
                        ? "Nothing needs action right now. New requests appear here in real time."
                        : "No request history for the selected filters."}
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr
                      key={`${item.module}-${item.id}`}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 align-top">
                        <span className="inline-flex rounded-md bg-secondary/50 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-secondary-foreground">
                          {item.module}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top max-w-sm">
                        <div className="font-medium text-foreground">{item.title}</div>
                        {item.product_name ? (
                          <div className="text-xs text-muted-foreground">{item.product_name}</div>
                        ) : (
                          <div className="text-muted-foreground truncate">{item.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {item.customer_id ? (
                          <Link
                            href={`/admin/customers/${item.customer_id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {item.customer_name || `Customer #${item.customer_id}`}
                          </Link>
                        ) : (
                          <span className="font-medium">{item.customer_name || "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-muted-foreground whitespace-nowrap">
                        {formatSubmitted(item.created_at)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        <Link
                          href={item.action_href || item.deep_link || "#"}
                          className="inline-flex items-center justify-center rounded-xl border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
                        >
                          {item.action_label || "View Details"}
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Not shown here:</strong> Partner collection requests run in their
          own controlled approval queue —{" "}
          <Link href={ROUTES.admin.partnersCollectionRequests} className="underline">
            Partner Collection Requests
          </Link>
          . Financial, stock, and accounting workflows remain in their own modules.
        </div>
      </div>
    </ERPPageShell>
  );
}
