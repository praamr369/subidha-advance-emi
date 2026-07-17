"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, RefreshCw, Check } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import {
  listPartnerNotifications,
  markNotificationRead,
  type NotificationListResponse,
} from "@/services/notifications";

const MODULE_PRESETS = ["", "billing", "accounting", "inventory", "rent", "reports", "system"];

export default function PartnerNotificationsPage() {
  const [module, setModule] = useState("");
  const [data, setData] = useState<NotificationListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const payload = await listPartnerNotifications({ module: module || undefined, limit: 100 });
      setData(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications.");
      setData(null);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, [module]);

  useEffect(() => {
    void load("initial");
  }, [load]);

  const modulesInResults = useMemo(() => {
    const fromData = new Set((data?.results ?? []).map((n) => n.module).filter(Boolean));
    return Array.from(fromData).sort();
  }, [data]);

  const moduleOptions = useMemo(() => {
    const merged = new Set([...MODULE_PRESETS.filter(Boolean), ...modulesInResults]);
    return ["", ...Array.from(merged).sort()];
  }, [modulesInResults]);

  const notifications = Array.isArray(data?.results) ? data.results : [];

  async function onMarkRead(id: number) {
    setBusyId(id);
    try {
      await markNotificationRead(id);
      await load("refresh");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col p-4 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Operational alerts
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load("refresh")}
          disabled={refreshing}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Stats Summary */}
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bell className="size-5" />
        </div>
        <div>
          <div className="text-xl font-bold text-foreground">{data?.unread_count || 0}</div>
          <div className="text-xs font-medium text-muted-foreground">Unread Messages</div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <select
            value={module}
            onChange={(e) => setModule(e.target.value)}
            className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            {moduleOptions.map((m) => (
              <option key={m || "all"} value={m}>
                {m === "" ? "All modules" : m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          <LoadingBlock label="Loading notifications..." />
        ) : error ? (
          <ErrorState title="Error" description={error} onRetry={() => void load("initial")} />
        ) : notifications.length === 0 ? (
          <EmptyState
            title="No notifications"
            description="You are caught up. New system alerts will appear here."
          />
        ) : (
          notifications.map((row) => (
            <div
              key={row.id}
              className={`flex items-start gap-3 rounded-2xl border border-border p-4 shadow-sm transition ${!row.read_at ? "bg-card border-primary/20" : "bg-card opacity-70"}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {row.module}
                  </span>
                  {!row.read_at && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                      Unread
                    </span>
                  )}
                </div>
                <div className="font-bold text-foreground">{row.title}</div>
                {row.body && <div className="mt-1 text-sm text-muted-foreground">{row.body}</div>}
                <div className="mt-2 text-xs font-medium text-muted-foreground">
                  {new Date(row.created_at).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </div>
              </div>
              {!row.read_at && (
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void onMarkRead(row.id)}
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition active:scale-95 disabled:opacity-50"
                >
                  <Check className="size-5" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
