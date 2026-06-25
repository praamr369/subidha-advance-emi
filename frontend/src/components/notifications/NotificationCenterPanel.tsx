"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import type { NotificationListResponse, SystemNotification } from "@/services/notifications";

type Role = "admin" | "cashier" | "partner" | "customer" | "vendor";

type Props = {
  role: Role;
  title: string;
  subtitle: string;
  breadcrumbs: { label: string; href?: string }[];
  list: (params?: { module?: string; limit?: number }) => Promise<NotificationListResponse>;
  markRead: (id: number) => Promise<SystemNotification>;
  /**
   * When false, renders only the notification toolbar + list (no title/breadcrumb header),
   * allowing role pages to provide ERPPageHeader without duplicating titles.
   */
  showHeader?: boolean;
};

const MODULE_PRESETS = ["", "billing", "accounting", "inventory", "rent", "reports", "system"];

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Failed to load notifications.";
}

export default function NotificationCenterPanel({
  role,
  title,
  subtitle,
  breadcrumbs,
  list,
  markRead,
  showHeader = true,
}: Props) {
  const [module, setModule] = useState("");
  const [data, setData] = useState<NotificationListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await list({ module: module || undefined, limit: 100 });
      setData(payload);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [list, module]);

  useEffect(() => {
    void load();
  }, [load]);

  const modulesInResults = useMemo(() => {
    const fromData = new Set((data?.results ?? []).map((n) => n.module).filter(Boolean));
    return Array.from(fromData).sort();
  }, [data]);

  const moduleOptions = useMemo(() => {
    const merged = new Set([...MODULE_PRESETS.filter(Boolean), ...modulesInResults]);
    return ["", ...Array.from(merged).sort()];
  }, [modulesInResults]);

  async function onMarkRead(id: number) {
    setBusyId(id);
    try {
      await markRead(id);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {showHeader ? (
        <header className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {breadcrumbs.map((b, i) => (
              <span key={`${b.label}-${i}`}>
                {i > 0 ? " · " : ""}
                {b.href ? (
                  <a href={b.href} className="text-primary hover:underline">
                    {b.label}
                  </a>
                ) : (
                  <span>{b.label}</span>
                )}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Module
                <select
                  className="h-10 min-w-[160px] rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                  value={module}
                  onChange={(e) => setModule(e.target.value)}
                >
                  {moduleOptions.map((m) => (
                    <option key={m || "all"} value={m}>
                      {m === "" ? "All modules" : m}
                    </option>
                  ))}
                </select>
              </label>
              <ActionButton type="button" variant="secondary" onClick={() => void load()}>
                Refresh
              </ActionButton>
            </div>
          </div>
          {data !== null && (
            <p className="text-sm text-muted-foreground">
              {data.unread_count} unread · {data.count} shown
              {role === "cashier" ? " (assigned to you only)" : ""}
            </p>
          )}
        </header>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Module
                <select
                  className="h-10 min-w-[160px] rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                  value={module}
                  onChange={(e) => setModule(e.target.value)}
                >
                  {moduleOptions.map((m) => (
                    <option key={m || "all"} value={m}>
                      {m === "" ? "All modules" : m}
                    </option>
                  ))}
                </select>
              </label>
              <ActionButton type="button" variant="secondary" onClick={() => void load()}>
                Refresh
              </ActionButton>
            </div>
            {data !== null ? (
              <div className="text-xs font-medium text-muted-foreground">
                {data.unread_count} unread · {data.count} shown
                {role === "cashier" ? " (assigned to you only)" : ""}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {loading && <LoadingBlock label="Loading notifications…" />}
      {error && <ErrorState title="Could not load" message={error} onRetry={() => void load()} />}
      {!loading && !error && data && data.results.length === 0 && (
        <EmptyState title="No notifications" description="You are caught up. New system alerts will appear here." />
      )}
      {!loading && !error && data && data.results.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {data.results.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {row.module}
                  </span>
                  {!row.read_at && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      Unread
                    </span>
                  )}
                </div>
                <div className="text-sm font-semibold text-card-foreground">{row.title}</div>
                {row.body ? <p className="whitespace-pre-wrap text-sm text-muted-foreground">{row.body}</p> : null}
                <p className="text-xs text-muted-foreground">
                  {new Date(row.created_at).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              {!row.read_at ? (
                <ActionButton
                  type="button"
                  variant="secondary"
                  disabled={busyId === row.id}
                  onClick={() => void onMarkRead(row.id)}
                >
                  Mark read
                </ActionButton>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
