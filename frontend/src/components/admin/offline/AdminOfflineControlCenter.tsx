"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDownToLine,
  CheckCircle2,
  Database,
  Download,
  HardDriveDownload,
  Loader2,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

import {
  clearSyncedOutboxItems,
  deleteOutboxItem,
  getAllOutboxItems,
  getSyncJournalEntries,
  subscribeOfflineOutbox,
  type OutboxItem,
  type SyncJournalEntry,
} from "@/lib/offline/offline-db";
import {
  initOfflineSyncEngine,
  preCacheStoreMasterData,
  subscribeSyncState,
  syncOfflineOutbox,
  type SyncProgressState,
} from "@/lib/offline/offline-sync";
import { cn } from "@/lib/utils";

export default function AdminOfflineControlCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [outboxItems, setOutboxItems] = useState<OutboxItem[]>([]);
  const [journalEntries, setJournalEntries] = useState<SyncJournalEntry[]>([]);
  const [syncState, setSyncState] = useState<SyncProgressState>({
    isSyncing: false,
    totalPending: 0,
    syncedCount: 0,
    failedCount: 0,
    lastSyncTime: null,
    lastError: null,
  });
  const [isPreCaching, setIsPreCaching] = useState(false);
  const [preCacheMessage, setPreCacheMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"outbox" | "journal">("outbox");
  const [inspectedItem, setInspectedItem] = useState<OutboxItem | null>(null);

  // Initialize network & outbox subscribers
  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const refreshData = async () => {
      const items = await getAllOutboxItems();
      setOutboxItems(items);
      const journal = await getSyncJournalEntries(30);
      setJournalEntries(journal);
    };

    refreshData();

    const unsubOutbox = subscribeOfflineOutbox(() => {
      refreshData();
    });

    const unsubSync = subscribeSyncState((state) => {
      setSyncState(state);
      refreshData();
    });

    const cleanupSyncEngine = initOfflineSyncEngine();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsubOutbox();
      unsubSync();
      cleanupSyncEngine();
    };
  }, []);

  const pendingCount = outboxItems.filter(
    (item) => item.status === "PENDING" || item.status === "FAILED" || item.status === "SYNCING"
  ).length;

  const deficitAlerts = journalEntries.filter((e) => e.status === "RESOLVED_WITH_WARNING");

  const handleManualSync = async () => {
    await syncOfflineOutbox();
    const items = await getAllOutboxItems();
    setOutboxItems(items);
    const journal = await getSyncJournalEntries(30);
    setJournalEntries(journal);
  };

  const handlePreCache = async () => {
    setIsPreCaching(true);
    setPreCacheMessage(null);
    try {
      const res = await preCacheStoreMasterData();
      if (res.success) {
        setPreCacheMessage(`✓ Pre-cached ${res.cachedCount} master catalogues & offline routes (Billing, Production, Inventory, CRM) for offline use.`);
      } else {
        setPreCacheMessage(res.error || "Pre-caching failed. Verify network.");
      }
    } catch {
      setPreCacheMessage("Error during pre-cache. Verify network.");
    } finally {
      setIsPreCaching(false);
    }
  };

  const handleExportBackup = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(outboxItems, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `subidha_offline_outbox_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleClearSynced = async () => {
    await clearSyncedOutboxItems();
    const items = await getAllOutboxItems();
    setOutboxItems(items);
  };

  const handleDeleteItem = async (id: string) => {
    if (confirm("Are you sure you want to discard this offline record? This cannot be undone.")) {
      await deleteOutboxItem(id);
      const items = await getAllOutboxItems();
      setOutboxItems(items);
    }
  };

  return (
    <>
      {/* Topbar Ambient Status Pill */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition cursor-pointer shadow-xs",
          syncState.isSyncing
            ? "border-sky-500/50 bg-sky-500/10 text-sky-600 dark:text-sky-400"
            : !isOnline || pendingCount > 0
            ? "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        )}
        title="Offline Operations & Database Sync Control Center"
      >
        {syncState.isSyncing ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-500" />
            <span className="hidden sm:inline">Syncing ({syncState.totalPending})</span>
          </>
        ) : !isOnline ? (
          <>
            <WifiOff className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
            <span>Offline {pendingCount > 0 ? `(${pendingCount})` : ""}</span>
          </>
        ) : pendingCount > 0 ? (
          <>
            <ArrowDownToLine className="h-3.5 w-3.5 text-amber-500" />
            <span>{pendingCount} Pending Sync</span>
          </>
        ) : (
          <>
            <Wifi className="h-3.5 w-3.5 text-emerald-500" />
            <span className="hidden sm:inline">Online (Synced)</span>
          </>
        )}
      </button>

      {/* Slide-over Control Center Modal / Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/60 backdrop-blur-xs transition-opacity">
          <div className="flex h-full w-full max-w-2xl flex-col bg-background border-l border-border shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-2.5">
                <Database className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-base font-bold text-foreground">Offline Control & Database Sync</h2>
                  <p className="text-xs text-muted-foreground">
                    Asansol Counter Offline Resilience & Idempotent Database Reconciliation
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Quick Status Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-6 py-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">Connection:</span>
                {isOnline ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Online
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" /> Counter Offline
                  </span>
                )}
                <span className="text-muted-foreground">|</span>
                <span className="text-muted-foreground">Pending Queue:</span>
                <span className="font-bold text-foreground">{pendingCount}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={syncState.isSyncing || !isOnline}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={cn("h-3 w-3", syncState.isSyncing && "animate-spin")} />
                  {syncState.isSyncing ? "Syncing..." : "Sync Outbox Now"}
                </button>
                <button
                  type="button"
                  onClick={handlePreCache}
                  disabled={isPreCaching || !isOnline}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-muted cursor-pointer"
                  title="Cache products, stock, and customers locally for offline operation"
                >
                  <HardDriveDownload className={cn("h-3 w-3", isPreCaching && "animate-spin")} />
                  Pre-Cache Data
                </button>
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                  title="Export offline outbox as JSON file"
                >
                  <Download className="h-3 w-3" />
                </button>
              </div>
            </div>

            {preCacheMessage && (
              <div className="bg-primary/10 border-b border-primary/20 px-6 py-2 text-xs text-primary font-medium">
                {preCacheMessage}
              </div>
            )}

            {syncState.lastError && (
              <div className="bg-destructive/10 border-b border-destructive/20 px-6 py-2 text-xs text-destructive font-medium flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{syncState.lastError}</span>
              </div>
            )}

            {deficitAlerts.length > 0 && (
              <div className="bg-amber-500/10 border-b border-amber-500/25 px-6 py-2.5 text-xs text-amber-700 dark:text-amber-400 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                  <span>
                    <strong>Stock Shortage Alert:</strong> {deficitAlerts.length} offline transaction(s) encountered physical stock deficits. Automatic Stock Needs (backorders) were raised for procurement/workshop.
                  </span>
                </div>
                <Link
                  href="/admin/inventory/purchase-needs"
                  onClick={() => setIsOpen(false)}
                  className="font-bold underline text-[11px] shrink-0 hover:text-amber-600 ml-2"
                >
                  View Stock Needs &rarr;
                </Link>
              </div>
            )}

            {/* Navigation Tabs */}
            <div className="flex border-b border-border px-6">
              <button
                type="button"
                onClick={() => setActiveTab("outbox")}
                className={cn(
                  "py-2.5 px-4 text-xs font-semibold border-b-2 transition -mb-px cursor-pointer",
                  activeTab === "outbox"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                Outbox Queue ({outboxItems.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("journal")}
                className={cn(
                  "py-2.5 px-4 text-xs font-semibold border-b-2 transition -mb-px cursor-pointer",
                  activeTab === "journal"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                Sync Audit Journal ({journalEntries.length})
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {activeTab === "outbox" ? (
                <>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Transactions queued locally on this device:</span>
                    {outboxItems.some((i) => i.status === "SYNCED") && (
                      <button
                        type="button"
                        onClick={handleClearSynced}
                        className="text-xs text-primary hover:underline font-medium cursor-pointer"
                      >
                        Clear Synced
                      </button>
                    )}
                  </div>

                  {outboxItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                      <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-2 opacity-80" />
                      <p className="text-sm font-semibold text-foreground">Outbox is completely clear</p>
                      <p className="text-xs max-w-sm mt-1">
                        All sales, stock adjustments, and purchase entries are synchronized with SUBIDHA CORE database.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {outboxItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3.5 text-xs shadow-xs transition hover:border-primary/40"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider",
                                  item.kind === "DIRECT_SALE"
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                    : item.kind === "STOCK_ADJUSTMENT"
                                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                                    : item.kind === "PURCHASE_ENTRY"
                                    ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                )}
                              >
                                {item.kind.replace("_", " ")}
                              </span>
                              <span className="font-mono font-semibold text-foreground">{item.client_memo_no}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                  item.status === "SYNCED"
                                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                    : item.status === "SYNCING"
                                    ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                                    : item.status === "FAILED"
                                    ? "bg-destructive/15 text-destructive"
                                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                )}
                              >
                                {item.status}
                              </span>

                              <button
                                type="button"
                                onClick={() => setInspectedItem(item)}
                                className="text-muted-foreground hover:text-foreground text-[11px] underline cursor-pointer"
                              >
                                Payload
                              </button>

                              {item.status !== "SYNCED" && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(item.id)}
                                  className="text-muted-foreground hover:text-destructive cursor-pointer"
                                  title="Discard record"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="text-muted-foreground">{item.summary}</div>

                          {item.last_error && (
                            <div className="rounded bg-destructive/10 p-2 text-[11px] text-destructive font-mono">
                              Error: {item.last_error}
                            </div>
                          )}

                          <div className="flex items-center justify-between text-[11px] text-muted-foreground/70 pt-1 border-t border-border/50">
                            <span>Recorded: {new Date(item.created_at).toLocaleString()}</span>
                            <span className="font-mono text-[10px]">Key: {item.idempotency_key.slice(0, 18)}...</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="text-xs text-muted-foreground">Recent server sync events & ledger postings:</div>
                  {journalEntries.length === 0 ? (
                    <div className="py-12 text-center text-xs text-muted-foreground">
                      No sync events logged yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {journalEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className={cn(
                            "flex flex-col gap-1 rounded-lg border p-3 text-xs transition",
                            entry.status === "RESOLVED_WITH_WARNING"
                              ? "border-amber-500/40 bg-amber-500/5 shadow-xs"
                              : "border-border bg-card"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground">
                              {entry.client_memo_no} ({entry.kind})
                            </span>
                            <span
                              className={cn(
                                "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                entry.status === "SUCCESS"
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : entry.status === "RESOLVED_WITH_WARNING"
                                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                                  : "bg-destructive/10 text-destructive"
                              )}
                            >
                              {entry.status === "RESOLVED_WITH_WARNING"
                                ? "STOCK SHORTAGE (BACKORDER)"
                                : entry.status}
                            </span>
                          </div>
                          <div className="text-muted-foreground text-[11px]">{entry.details}</div>
                          <div className="text-[10px] text-muted-foreground/60">
                            {new Date(entry.synced_at).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Payload Inspector Modal */}
            {inspectedItem && (
              <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4">
                <div className="max-h-[85vh] w-full max-w-lg rounded-xl border border-border bg-background p-5 shadow-2xl flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-foreground">
                      Outbox Payload: {inspectedItem.client_memo_no}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setInspectedItem(null)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <pre className="flex-1 overflow-y-auto rounded-lg bg-muted p-3 font-mono text-xs text-foreground">
                    {JSON.stringify(inspectedItem.payload, null, 2)}
                  </pre>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setInspectedItem(null)}
                      className="rounded-md bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
