/**
 * SUBIDHA CORE — Offline Synchronization Engine
 *
 * Handles automated background outbox replay, cross-tab mutual exclusion,
 * strict FIFO ordering, and multi-module master data pre-caching.
 */

import {
  clearSyncedOutboxItems,
  getPendingOutboxItems,
  mergeDeltaCache,
  recordSyncJournalEntry,
  setCachedData,
  updateOutboxItemStatus,
  type OutboxItem,
  type OutboxTransactionKind,
} from "./offline-db";
import { API_BASE_URL } from "@/lib/constants";
import { getAccessToken } from "@/lib/auth/tokens";

let isLocalSyncing = false;
let pingIntervalId: ReturnType<typeof setInterval> | null = null;

export interface SyncProgressState {
  isSyncing: boolean;
  totalPending: number;
  syncedCount: number;
  failedCount: number;
  lastSyncTime: string | null;
  lastError: string | null;
}

let syncState: SyncProgressState = {
  isSyncing: false,
  totalPending: 0,
  syncedCount: 0,
  failedCount: 0,
  lastSyncTime: null,
  lastError: null,
};

type SyncStateListener = (state: SyncProgressState) => void;
const stateListeners = new Set<SyncStateListener>();

export function subscribeSyncState(listener: SyncStateListener): () => void {
  stateListeners.add(listener);
  listener(syncState);
  return () => {
    stateListeners.delete(listener);
  };
}

function updateSyncState(patch: Partial<SyncProgressState>): void {
  syncState = { ...syncState, ...patch };
  stateListeners.forEach((listener) => {
    try {
      listener(syncState);
    } catch {
      // Ignore listener error
    }
  });
}

/**
 * Perform a real network check against SUBIDHA CORE backend.
 */
export async function checkServerReachability(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!navigator.onLine) return false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const checkUrl = `${API_BASE_URL.replace(/\/+$/, "")}/auth/me/`;
    const token = getAccessToken();
    const response = await fetch(checkUrl, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeout);
    return response.status < 500;
  } catch {
    return false;
  }
}

/**
 * Logical priority ordering for FIFO synchronization:
 * 1. Customer Creation (so downstream sales/contracts can reference the real ID)
 * 2. Purchases / Inbound Stock (so inventory ledger has physical pieces before sale)
 * 3. Stock Adjustments (audits, transfers)
 * 4. Direct Sales / POS (stock outward, invoicing)
 * 5. Payment Collections (receipts)
 * 6. Delivery Updates & Logistics
 * 7. Generic Mutations
 */
function getKindPriority(kind: OutboxTransactionKind): number {
  switch (kind) {
    case "CUSTOMER_CREATION":
      return 1;
    case "PURCHASE_ENTRY":
      return 2;
    case "STOCK_ADJUSTMENT":
      return 3;
    case "PRODUCTION_ACTION":
      return 4;
    case "DIRECT_SALE":
      return 5;
    case "PAYMENT_COLLECTION":
      return 6;
    case "DELIVERY_UPDATE":
      return 7;
    default:
      return 8;
  }
}

/**
 * Execute outbox synchronization with cross-tab safety (Web Locks API).
 */
export async function syncOfflineOutbox(): Promise<{
  success: boolean;
  synced: number;
  failed: number;
}> {
  if (isLocalSyncing) {
    return { success: false, synced: 0, failed: 0 };
  }

  // Use Web Locks API if available to guarantee only one tab syncs at a time
  if (typeof navigator !== "undefined" && "locks" in navigator) {
    return await navigator.locks.request("subidha_offline_outbox_lock", { ifAvailable: true }, async (lock) => {
      if (!lock) {
        // Another browser tab is currently syncing outbox
        return { success: true, synced: 0, failed: 0 };
      }
      return await executeSyncCycle();
    });
  }

  return await executeSyncCycle();
}

async function executeSyncCycle(): Promise<{
  success: boolean;
  synced: number;
  failed: number;
}> {
  const isReachable = await checkServerReachability();
  if (!isReachable) {
    updateSyncState({
      isSyncing: false,
      lastError: "Server unreachable. Retrying when connection stabilizes.",
    });
    return { success: false, synced: 0, failed: 0 };
  }

  isLocalSyncing = true;
  updateSyncState({ isSyncing: true, lastError: null });

  let synced = 0;
  let failed = 0;

  try {
    const pendingItems = await getPendingOutboxItems();
    if (!pendingItems.length) {
      updateSyncState({ isSyncing: false, totalPending: 0 });
      return { success: true, synced: 0, failed: 0 };
    }

    // Sort by business priority, then creation time
    pendingItems.sort((a, b) => {
      const priorityDiff = getKindPriority(a.kind) - getKindPriority(b.kind);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    updateSyncState({ totalPending: pendingItems.length });

    // Track provisional client IDs to real server IDs across the batch
    // e.g. Customer provisional ID (-17313...) -> Real Server ID (108)
    const idRemap = new Map<string | number, string | number>();

    for (const item of pendingItems) {
      await updateOutboxItemStatus(item.id, "SYNCING");

      // Remap any dependent provisional IDs in the payload before replaying
      if (idRemap.size > 0 && typeof item.payload === "object" && item.payload !== null) {
        const payload = item.payload as any;
        if (payload.customer && idRemap.has(payload.customer)) {
          payload.customer = idRemap.get(payload.customer);
          item.payload = payload;
        }
        if (payload.party && idRemap.has(payload.party)) {
          payload.party = idRemap.get(payload.party);
          item.payload = payload;
        }
      }

      try {
        const result = await replayOutboxItem(item);
        if (result.success) {
          synced++;
          await updateOutboxItemStatus(item.id, "SYNCED", {
            server_response: result.response,
            last_error: null,
          });

          // If a customer was just created on the server, map its provisional ID
          if (item.kind === "CUSTOMER_CREATION" && result.serverId) {
            const provId = (item.payload as any)?.id;
            if (provId) {
              idRemap.set(provId, result.serverId);
            }
          }

          // Detect if transaction triggered an automated backorder or stock shortage
          const resp = result.response;
          const hasDeficit =
            resp?.stock_status === "DEFICIT" ||
            (resp?.stock_need !== null && resp?.stock_need !== undefined) ||
            (typeof resp?.sale?.requirement_count === "number" && resp.sale.requirement_count > 0) ||
            (Array.isArray(resp?.warnings) &&
              resp.warnings.some(
                (w: string) =>
                  w.toLowerCase().includes("stock") ||
                  w.toLowerCase().includes("need") ||
                  w.toLowerCase().includes("backorder")
              ));

          const stockNeedNo =
            resp?.stock_need?.need_no ||
            (resp?.sale?.requirement_count ? `${resp.sale.requirement_count} item(s) on backorder` : "Auto-Created");

          const entryStatus = hasDeficit ? "RESOLVED_WITH_WARNING" : "SUCCESS";
          const entryDetails = hasDeficit
            ? `Synced ${item.kind} [Memo: ${item.client_memo_no}]. ⚠️ STOCK DEFICIT: Auto-StockNeed (${stockNeedNo}) queued for procurement.`
            : `Synced ${item.kind} [Memo: ${item.client_memo_no}]. Server ID: ${result.serverId ?? "N/A"}.`;

          await recordSyncJournalEntry({
            outbox_id: item.id,
            kind: item.kind,
            path: item.path,
            client_memo_no: item.client_memo_no,
            server_id: result.serverId,
            status: entryStatus,
            details: entryDetails,
          });
        } else {
          failed++;
          await updateOutboxItemStatus(item.id, "FAILED", {
            last_error: result.error || "Unknown synchronization error",
            incrementRetry: true,
          });

          await recordSyncJournalEntry({
            outbox_id: item.id,
            kind: item.kind,
            path: item.path,
            client_memo_no: item.client_memo_no,
            status: "FAILED",
            details: `Failed sync for ${item.kind} [Memo: ${item.client_memo_no}]: ${result.error}`,
          });
        }
      } catch (err: unknown) {
        failed++;
        const errorMessage = err instanceof Error ? err.message : String(err);
        await updateOutboxItemStatus(item.id, "FAILED", {
          last_error: errorMessage,
          incrementRetry: true,
        });
      }

      updateSyncState({
        syncedCount: synced,
        failedCount: failed,
      });
    }

    // After outbox items are processed, pre-cache fresh inventory & catalog data
    await refreshCoreMasterData();

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("subidha-sync-complete", {
          detail: { synced, failed, timestamp: new Date().toISOString() },
        })
      );
    }

    updateSyncState({
      isSyncing: false,
      lastSyncTime: new Date().toISOString(),
      lastError: failed > 0 ? `${failed} transaction(s) require review` : null,
    });

    return { success: true, synced, failed };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    updateSyncState({ isSyncing: false, lastError: errorMsg });
    return { success: false, synced, failed };
  } finally {
    isLocalSyncing = false;
  }
}

async function replayOutboxItem(
  item: OutboxItem
): Promise<{ success: boolean; response?: any; serverId?: string | number; error?: string }> {
  const token = getAccessToken();
  const normalizedPath = item.path.startsWith("/") ? item.path : `/${item.path}`;
  const base = API_BASE_URL.replace(/\/+$/, "");
  const fullUrl = base.endsWith("/api/v1") && normalizedPath.startsWith("/api/v1")
    ? `${base}${normalizedPath.slice("/api/v1".length) || ""}`
    : `${base}${normalizedPath}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "Idempotency-Key": item.idempotency_key,
    "X-Idempotency-Key": item.idempotency_key,
    ...(item.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(fullUrl, {
    method: item.method,
    headers,
    body: typeof item.payload === "string" ? item.payload : JSON.stringify(item.payload),
    cache: "no-store",
  });

  const text = await response.text();
  let parsedBody: any = null;
  try {
    parsedBody = text ? JSON.parse(text) : null;
  } catch {
    parsedBody = text;
  }

  if (response.ok) {
    const serverId =
      parsedBody?.sale?.id ??
      parsedBody?.id ??
      parsedBody?.sale_no ??
      parsedBody?.invoice_no ??
      parsedBody?.order_no;

    return { success: true, response: parsedBody, serverId };
  }

  // Idempotent recovery check: If HTTP 409 conflict returns already-created entity
  if (response.status === 409 && parsedBody?.id) {
    return { success: true, response: parsedBody, serverId: parsedBody.id };
  }

  const detail =
    parsedBody?.detail ||
    parsedBody?.message ||
    parsedBody?.error ||
    `Server returned status ${response.status}`;

  return { success: false, error: detail, response: parsedBody };
}

/**
 * Delta refresh of core master data after sync
 */
async function refreshCoreMasterData(): Promise<void> {
  const token = getAccessToken();
  if (!token) return;

  const endpointsToRefresh = [
    "/admin/inventory/stock-on-hand/",
    "/admin/sales/direct-sales/?page_size=20",
    "/billing/invoices/?page_size=20",
    "/crm/customers/?page_size=50",
  ];

  for (const path of endpointsToRefresh) {
    try {
      const url = `${API_BASE_URL.replace(/\/+$/, "")}${path}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        await mergeDeltaCache(path, data);
      }
    } catch {
      // Ignore background refresh errors
    }
  }
}

export const CORE_OFFLINE_ROUTES = [
  "/admin",
  "/admin/billing/direct-sale",
  "/admin/billing/direct-sales",
  "/admin/billing/invoices",
  "/admin/billing/receipts",
  "/admin/manufacturing",
  "/admin/manufacturing/jobs",
  "/admin/manufacturing/boms",
  "/admin/inventory/stock-on-hand",
  "/admin/customers",
  "/admin/deliveries",
  "/admin/sales",
  "/admin/collections",
  "/admin/offline",
];

/**
 * Pre-cache all essential store data across all 17 admin modules
 * and Next.js page shells/scripts into IndexedDB & CacheStorage so staff
 * and admin users can operate offline immediately.
 */
export async function preCacheStoreMasterData(): Promise<{
  success: boolean;
  cachedCount: number;
  error?: string;
}> {
  const token = getAccessToken();
  if (!token) {
    return { success: false, cachedCount: 0, error: "Must be signed in to pre-cache store data." };
  }

  // 1. Pre-cache Next.js page shells, RSC payloads, and JS/CSS static bundles
  if (typeof window !== "undefined" && "caches" in window) {
    try {
      const pagesCache = await caches.open("subidha-core-pages-v4");
      const staticCache = await caches.open("subidha-core-static-v4");

      for (const route of CORE_OFFLINE_ROUTES) {
        try {
          const res = await fetch(route, { cache: "reload" });
          if (res.ok) {
            await pagesCache.put(route, res.clone());
            const text = await res.text();

            // Extract and cache all scripts
            const scriptMatches = text.matchAll(/src="(\/_next\/static\/[^"]+)"/g);
            for (const m of scriptMatches) {
              try {
                const sRes = await fetch(m[1]);
                if (sRes.ok) await staticCache.put(m[1], sRes);
              } catch {}
            }

            // Extract and cache stylesheets
            const styleMatches = text.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g);
            for (const m of styleMatches) {
              try {
                const cRes = await fetch(m[1]);
                if (cRes.ok) await staticCache.put(m[1], cRes);
              } catch {}
            }
          }

          // Cache RSC route payload
          try {
            const rscRes = await fetch(route, {
              headers: { RSC: "1" },
              cache: "reload",
            });
            if (rscRes.ok) {
              await pagesCache.put(`${route}?_rsc=1`, rscRes.clone());
              await pagesCache.put(route, rscRes);
            }
          } catch {}
        } catch {
          // ignore individual route cache failure
        }
      }

      // Tell the active service worker to also pre-cache routes
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "PRE_CACHE_ROUTES",
          routes: CORE_OFFLINE_ROUTES,
        });
      }
    } catch {
      // ignore
    }
  }

  const allModuleEndpoints = [
    // 1. Command Center & Operations
    "/admin/operations/today-work/",
    "/admin/operations/summary/",

    // 2. Profiles, CRM & Customers
    "/customers/?page_size=150",
    "/customers/?page_size=50",
    "/customers/",
    "/crm/parties/?page_size=150",

    // 3. Sales & Direct Sales (Billing)
    "/admin/sales/direct-sales/?page_size=50",
    "/billing/direct-sales/?page_size=50",
    "/billing/products/?page_size=200",
    "/catalog/products/?page_size=200",

    // 4. SFEMI Control
    "/subscriptions/?page_size=50",
    "/subscriptions/plans/",

    // 5. Collections & Invoices
    "/billing/invoices/?page_size=50",
    "/finance/cash-accounts/",

    // 6. Finance & Accounting
    "/accounting/finance-accounts/",
    "/accounting/chart-of-accounts/",

    // 7. Inventory & Stock
    "/admin/inventory/stock-on-hand/",
    "/inventory/items/?page_size=250",
    "/inventory/locations/",
    "/inventory/categories/",

    // 8. Manufacturing & Production Jobs
    "/manufacturing/overview/",
    "/manufacturing/boms/?page_size=50",
    "/manufacturing/jobs/?page_size=50",
    "/manufacturing/jobs/",

    // 9. Purchases & Vendors
    "/inventory/vendors/?page_size=100",
    "/inventory/purchase-orders/?page_size=50",
    "/admin/vendors/?page_size=100",

    // 10. Delivery & Logistics
    "/deliveries/?page_size=50",

    // 11. HR & Staff
    "/hr/employees/?page_size=100",

    // 12. Governance & Configuration
    "/core/document-numbering/",
    "/compliance/tax-profiles/",
  ];

  let count = 0;
  for (const endpoint of allModuleEndpoints) {
    try {
      const url = `${API_BASE_URL.replace(/\/+$/, "")}${endpoint}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        await setCachedData(endpoint, data, 24 * 60 * 60 * 1000); // 24 hour TTL
        count++;
      }
    } catch {
      // Continue next endpoint
    }
  }

  return { success: count > 0, cachedCount: count };
}

/**
 * Initialize offline sync listeners and background health check with flap debouncing.
 */
export function initOfflineSyncEngine(): () => void {
  if (typeof window === "undefined") return () => {};

  let flapDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  const handleOnline = () => {
    // 2.5s debounce ensures network is truly stable before replaying outbox
    if (flapDebounceTimer) {
      clearTimeout(flapDebounceTimer);
    }
    flapDebounceTimer = setTimeout(() => {
      syncOfflineOutbox();
    }, 2500);
  };

  window.addEventListener("online", handleOnline);

  if (pingIntervalId) {
    clearInterval(pingIntervalId);
  }
  pingIntervalId = setInterval(async () => {
    if (navigator.onLine && !isLocalSyncing) {
      const pending = await getPendingOutboxItems();
      if (pending.length > 0) {
        syncOfflineOutbox();
      }
    }
  }, 45000);

  // Automatic background warmup when online (runs after 3s to not compete with initial page render)
  if (navigator.onLine && getAccessToken()) {
    setTimeout(() => {
      preCacheStoreMasterData().catch(() => {});
    }, 3000);
  }

  return () => {
    window.removeEventListener("online", handleOnline);
    if (pingIntervalId) {
      clearInterval(pingIntervalId);
      pingIntervalId = null;
    }
  };
}
