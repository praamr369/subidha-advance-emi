"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Check, AlertCircle } from "lucide-react";

type SyncStatus = "syncing" | "synced" | "error";

type LiveSyncBadgeProps = {
  status?: SyncStatus;
  lastSyncedSeconds?: number;
  onRefresh?: () => void;
  className?: string;
};

export default function LiveSyncBadge({
  status = "synced",
  lastSyncedSeconds = 0,
  onRefresh,
  className
}: LiveSyncBadgeProps) {
  const [timeAgo, setTimeAgo] = useState<string>("");
  const [elapsed, setElapsed] = useState(lastSyncedSeconds);

  useEffect(() => {
    setElapsed(lastSyncedSeconds);

    const interval = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [lastSyncedSeconds]);

  useEffect(() => {
    if (elapsed < 60) {
      setTimeAgo(`${elapsed}s ago`);
    } else if (elapsed < 3600) {
      const minutes = Math.floor(elapsed / 60);
      setTimeAgo(`${minutes}m ago`);
    } else {
      const hours = Math.floor(elapsed / 3600);
      setTimeAgo(`${hours}h ago`);
    }
  }, [elapsed]);

  const statusConfig = {
    syncing: {
      bg: "bg-blue-50 dark:bg-blue-900/20",
      border: "border-blue-200 dark:border-blue-800",
      text: "text-blue-700 dark:text-blue-300",
      icon: RefreshCw,
      label: "Syncing...",
    },
    synced: {
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
      border: "border-emerald-200 dark:border-emerald-800",
      text: "text-emerald-700 dark:text-emerald-300",
      icon: Check,
      label: timeAgo,
    },
    error: {
      bg: "bg-red-50 dark:bg-red-900/20",
      border: "border-red-200 dark:border-red-800",
      text: "text-red-700 dark:text-red-300",
      icon: AlertCircle,
      label: "Sync failed",
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${config.bg} ${config.border} ${config.text}`}
      >
        <Icon
          className={`h-3 w-3 ${status === "syncing" ? "animate-spin" : ""}`}
        />
        <span>{config.label}</span>
      </div>
      {onRefresh && status !== "syncing" && (
        <button
          onClick={onRefresh}
          className="rounded-full p-1 hover:bg-muted transition"
          title="Refresh now"
        >
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
        </button>
      )}
    </div>
  );
}
