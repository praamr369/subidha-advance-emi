/**
 * SUBIDHA CORE — Native Browser Offline Database (IndexedDB)
 *
 * Dedicated local storage for Asansol showroom and counter resilience.
 * Stores master data cache, pending offline transactions (outbox), and sync audit logs.
 * Zero external dependencies; 100% browser native and SSR safe.
 */

export type OutboxTransactionKind =
  | "DIRECT_SALE"
  | "STOCK_ADJUSTMENT"
  | "PURCHASE_ENTRY"
  | "PAYMENT_COLLECTION"
  | "CUSTOMER_CREATION"
  | "DELIVERY_UPDATE"
  | "GENERIC_MUTATION";

export type OutboxStatus = "PENDING" | "SYNCING" | "SYNCED" | "FAILED";

export interface OutboxItem {
  id: string;
  kind: OutboxTransactionKind;
  path: string;
  method: "POST" | "PUT" | "PATCH";
  payload: Record<string, unknown> | unknown[] | string;
  headers?: Record<string, string>;
  idempotency_key: string;
  client_memo_no: string;
  summary: string;
  total_amount?: string | number;
  created_at: string;
  status: OutboxStatus;
  retry_count: number;
  last_error?: string | null;
  server_response?: unknown;
}

export interface SyncJournalEntry {
  id: string;
  outbox_id: string;
  kind: OutboxTransactionKind;
  path: string;
  client_memo_no: string;
  server_id?: string | number;
  synced_at: string;
  status: "SUCCESS" | "RESOLVED_WITH_WARNING" | "FAILED";
  details?: string;
}

export interface MasterCacheEntry<T = unknown> {
  key: string;
  data: T;
  updated_at: string;
  expires_at?: number;
}

const DB_NAME = "subidha_admin_offline_v2";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

/**
 * Normalizes URL / path so that cache keys match regardless of
 * full domain or whether `/api/v1` prefix is included.
 */
export function normalizeCacheKey(key: string): string {
  let normalized = key.trim();
  try {
    if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
      const url = new URL(normalized);
      normalized = url.pathname + url.search;
    }
  } catch {
    // Ignore URL parse error
  }

  if (normalized.startsWith("/api/v1/")) {
    normalized = normalized.slice("/api/v1".length);
  } else if (normalized.startsWith("api/v1/")) {
    normalized = normalized.slice("api/v1".length);
  }

  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  return normalized;
}

export function openOfflineDb(): Promise<IDBDatabase> {
  if (!isBrowser()) {
    return Promise.reject(new Error("IndexedDB is not available in non-browser environments."));
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("master_cache")) {
        db.createObjectStore("master_cache", { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains("offline_outbox")) {
        const outboxStore = db.createObjectStore("offline_outbox", { keyPath: "id" });
        outboxStore.createIndex("status", "status", { unique: false });
        outboxStore.createIndex("created_at", "created_at", { unique: false });
        outboxStore.createIndex("kind", "kind", { unique: false });
      }

      if (!db.objectStoreNames.contains("sync_journal")) {
        const journalStore = db.createObjectStore("sync_journal", { keyPath: "id" });
        journalStore.createIndex("synced_at", "synced_at", { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error("Failed to open offline database"));
    };
  });

  return dbPromise;
}

// -------------------------------------------------------------
// MASTER CACHE OPERATIONS WITH QUOTA PROTECTION
// -------------------------------------------------------------

async function evictOldestCache(db: IDBDatabase): Promise<void> {
  try {
    const tx = db.transaction("master_cache", "readwrite");
    const store = tx.objectStore("master_cache");
    const req = store.getAll();
    req.onsuccess = () => {
      const items = (req.result as MasterCacheEntry[]) || [];
      // Remove expired or oldest 25% of cache entries
      const now = Date.now();
      const expired = items.filter((i) => i.expires_at && i.expires_at < now);
      for (const item of expired) {
        store.delete(item.key);
      }
      if (expired.length === 0 && items.length > 20) {
        items.sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
        const toDelete = items.slice(0, Math.ceil(items.length * 0.25));
        for (const item of toDelete) {
          store.delete(item.key);
        }
      }
    };
  } catch {
    // Ignore eviction errors
  }
}

export async function setCachedData<T>(rawKey: string, data: T, ttlMs?: number): Promise<void> {
  if (!isBrowser()) return;
  try {
    const db = await openOfflineDb();
    const key = normalizeCacheKey(rawKey);
    const entry: MasterCacheEntry<T> = {
      key,
      data,
      updated_at: new Date().toISOString(),
      expires_at: ttlMs ? Date.now() + ttlMs : undefined,
    };
    await new Promise<void>((resolve) => {
      const tx = db.transaction("master_cache", "readwrite");
      const store = tx.objectStore("master_cache");
      const req = store.put(entry);
      req.onsuccess = () => resolve();
      req.onerror = async () => {
        if (req.error?.name === "QuotaExceededError") {
          await evictOldestCache(db);
        }
        resolve();
      };
    });
  } catch {
    // Fail silently so caching issues never disrupt user flow
  }
}

/**
 * Differential Delta Cache Merger:
 * Merges updated rows into existing cached lists by entity ID without wiping untouched rows.
 */
export async function mergeDeltaCache<T>(rawKey: string, incomingData: T): Promise<void> {
  if (!isBrowser()) return;
  const key = normalizeCacheKey(rawKey);
  const existing = await getCachedData<any>(key);

  if (!existing) {
    await setCachedData(key, incomingData);
    return;
  }

  // Case 1: Both are raw arrays
  if (Array.isArray(existing) && Array.isArray(incomingData)) {
    const map = new Map<any, any>();
    for (const item of existing) {
      const id = item?.id ?? item?.product_id ?? item?.sku;
      if (id !== undefined) map.set(id, item);
    }
    for (const delta of incomingData) {
      const id = delta?.id ?? delta?.product_id ?? delta?.sku;
      if (id !== undefined) {
        map.set(id, { ...(map.get(id) || {}), ...delta });
      } else {
        map.set(Math.random(), delta);
      }
    }
    await setCachedData(key, Array.from(map.values()));
    return;
  }

  // Case 2: Paginated DRF envelope with .results array
  if (
    typeof existing === "object" &&
    existing !== null &&
    Array.isArray(existing.results) &&
    typeof incomingData === "object" &&
    incomingData !== null &&
    Array.isArray((incomingData as any).results)
  ) {
    const map = new Map<any, any>();
    for (const item of existing.results) {
      const id = item?.id ?? item?.product_id ?? item?.sku;
      if (id !== undefined) map.set(id, item);
    }
    for (const delta of (incomingData as any).results) {
      const id = delta?.id ?? delta?.product_id ?? delta?.sku;
      if (id !== undefined) {
        map.set(id, { ...(map.get(id) || {}), ...delta });
      } else {
        map.set(Math.random(), delta);
      }
    }
    const mergedResults = Array.from(map.values());
    const mergedObj = {
      ...existing,
      ...incomingData,
      count: Math.max(existing.count || 0, mergedResults.length),
      results: mergedResults,
    };
    await setCachedData(key, mergedObj);
    return;
  }

  await setCachedData(key, incomingData);
}

export async function getCachedData<T>(rawKey: string): Promise<T | null> {
  if (!isBrowser()) return null;
  try {
    const db = await openOfflineDb();
    const key = normalizeCacheKey(rawKey);

    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction("master_cache", "readonly");
      const store = tx.objectStore("master_cache");
      const req = store.get(key);

      req.onsuccess = async () => {
        const res = req.result as MasterCacheEntry<T> | undefined;
        if (res) {
          if (res.expires_at && res.expires_at < Date.now()) {
            resolve(null);
            return;
          }
          resolve(res.data);
          return;
        }

        // Check if this is a request for an offline provisional memo (e.g. for offline receipt printing)
        const memoMatch = key.match(/(OFF-[A-Z0-9-]+)/);
        if (memoMatch) {
          const memoNo = memoMatch[1];
          const outboxTx = db.transaction("offline_outbox", "readonly");
          const outboxStore = outboxTx.objectStore("offline_outbox");
          const allOutboxReq = outboxStore.getAll();
          allOutboxReq.onsuccess = () => {
            const items = allOutboxReq.result as OutboxItem[] | undefined;
            const match = items?.find((i) => i.client_memo_no === memoNo);
            if (match && match.server_response) {
              resolve(match.server_response as T);
              return;
            }
            if (match && match.kind === "DIRECT_SALE") {
              const payload = match.payload as any;
              const offlineDoc: any = {
                id: -1,
                sale_no: memoNo,
                billing_invoice_no: `PROVISIONAL (${memoNo})`,
                sale_date: match.created_at.split("T")[0],
                financial_year: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
                customer_name: payload?.customer_name || "Direct Customer",
                customer_snapshot_name: payload?.customer_name || "Direct Customer",
                customer_snapshot_phone: payload?.customer_phone || "",
                customer_snapshot_city: "Asansol",
                customer_snapshot_state: "West Bengal",
                status: "CONFIRMED",
                tax_mode: "GST",
                delivery_required: false,
                is_offline_provisional: true,
                lines: (payload?.lines || []).map((l: any, i: number) => ({
                  id: i + 1,
                  description: l.description || `Item ${i + 1}`,
                  quantity: String(l.quantity || "1"),
                  unit_price: String(l.unit_price || "0"),
                  discount_amount: String(l.discount_amount || "0"),
                  taxable_value: String(l.taxable_value || l.unit_price || "0"),
                  line_total: String(l.line_total || Number(l.quantity || 1) * Number(l.unit_price || 0)),
                  cgst_amount: String(l.cgst_amount || "0"),
                  sgst_amount: String(l.sgst_amount || "0"),
                  igst_amount: "0.00",
                  sku_snapshot: l.product_code || l.sku || "",
                })),
                taxable_amount: String(payload?.taxable_amount || match.total_amount || "0"),
                total_amount: String(match.total_amount || "0"),
                balance_amount: "0.00",
              };
              resolve(offlineDoc as T);
              return;
            }
            resolve(null);
          };
          allOutboxReq.onerror = () => resolve(null);
          return;
        }

        // Fuzzy path fallback: if key has query params (e.g. ?page=2), check base path
        const basePath = key.split("?")[0];
        if (basePath && basePath !== key) {
          const fallbackReq = store.get(basePath);
          fallbackReq.onsuccess = () => {
            const fallbackRes = fallbackReq.result as MasterCacheEntry<T> | undefined;
            if (fallbackRes && (!fallbackRes.expires_at || fallbackRes.expires_at >= Date.now())) {
              resolve(fallbackRes.data);
              return;
            }
            resolve(null);
          };
          fallbackReq.onerror = () => resolve(null);
          return;
        }

        resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

// -------------------------------------------------------------
// OUTBOX OPERATIONS (Pending Offline Transactions)
// -------------------------------------------------------------

export async function enqueueOutboxItem(
  item: Omit<OutboxItem, "id" | "created_at" | "status" | "retry_count">
): Promise<OutboxItem> {
  if (!isBrowser()) {
    throw new Error("Cannot enqueue offline item on server");
  }

  const db = await openOfflineDb();
  const id = `outbox_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const outboxItem: OutboxItem = {
    ...item,
    id,
    created_at: new Date().toISOString(),
    status: "PENDING",
    retry_count: 0,
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("offline_outbox", "readwrite");
    const store = tx.objectStore("offline_outbox");
    const req = store.add(outboxItem);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  notifySyncSubscribers();
  return outboxItem;
}

export async function getAllOutboxItems(): Promise<OutboxItem[]> {
  if (!isBrowser()) return [];
  try {
    const db = await openOfflineDb();
    return await new Promise<OutboxItem[]>((resolve) => {
      const tx = db.transaction("offline_outbox", "readonly");
      const store = tx.objectStore("offline_outbox");
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result as OutboxItem[]) || [];
        items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        resolve(items);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function getPendingOutboxItems(): Promise<OutboxItem[]> {
  if (!isBrowser()) return [];
  try {
    const db = await openOfflineDb();
    return await new Promise<OutboxItem[]>((resolve) => {
      const tx = db.transaction("offline_outbox", "readonly");
      const store = tx.objectStore("offline_outbox");
      const req = store.getAll();
      req.onsuccess = () => {
        const items = ((req.result as OutboxItem[]) || []).filter(
          (i) => i.status === "PENDING" || i.status === "FAILED"
        );
        items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        resolve(items);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function updateOutboxItemStatus(
  id: string,
  status: OutboxStatus,
  options: {
    last_error?: string | null;
    server_response?: unknown;
    incrementRetry?: boolean;
  } = {}
): Promise<void> {
  if (!isBrowser()) return;
  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("offline_outbox", "readwrite");
      const store = tx.objectStore("offline_outbox");
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const item = getReq.result as OutboxItem | undefined;
        if (!item) {
          resolve();
          return;
        }

        item.status = status;
        if (options.last_error !== undefined) {
          item.last_error = options.last_error;
        }
        if (options.server_response !== undefined) {
          item.server_response = options.server_response;
        }
        if (options.incrementRetry) {
          item.retry_count = (item.retry_count || 0) + 1;
        }

        const putReq = store.put(item);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };

      getReq.onerror = () => reject(getReq.error);
    });

    notifySyncSubscribers();
  } catch {
    // Fail safe
  }
}

export async function deleteOutboxItem(id: string): Promise<void> {
  if (!isBrowser()) return;
  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("offline_outbox", "readwrite");
      const store = tx.objectStore("offline_outbox");
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    notifySyncSubscribers();
  } catch {
    // Fail safe
  }
}

export async function clearSyncedOutboxItems(): Promise<number> {
  if (!isBrowser()) return 0;
  try {
    const db = await openOfflineDb();
    const items = await getAllOutboxItems();
    const syncedItems = items.filter((i) => i.status === "SYNCED");
    if (!syncedItems.length) return 0;

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("offline_outbox", "readwrite");
      const store = tx.objectStore("offline_outbox");
      for (const item of syncedItems) {
        store.delete(item.id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    notifySyncSubscribers();
    return syncedItems.length;
  } catch {
    return 0;
  }
}

// -------------------------------------------------------------
// SYNC JOURNAL OPERATIONS
// -------------------------------------------------------------

export async function recordSyncJournalEntry(
  entry: Omit<SyncJournalEntry, "id" | "synced_at">
): Promise<void> {
  if (!isBrowser()) return;
  try {
    const db = await openOfflineDb();
    const journalEntry: SyncJournalEntry = {
      ...entry,
      id: `journal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      synced_at: new Date().toISOString(),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("sync_journal", "readwrite");
      const store = tx.objectStore("sync_journal");
      const req = store.add(journalEntry);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Fail safe
  }
}

export async function getSyncJournalEntries(limit = 50): Promise<SyncJournalEntry[]> {
  if (!isBrowser()) return [];
  try {
    const db = await openOfflineDb();
    return await new Promise<SyncJournalEntry[]>((resolve) => {
      const tx = db.transaction("sync_journal", "readonly");
      const store = tx.objectStore("sync_journal");
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result as SyncJournalEntry[]) || [];
        items.sort((a, b) => new Date(b.synced_at).getTime() - new Date(a.synced_at).getTime());
        resolve(items.slice(0, limit));
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

// -------------------------------------------------------------
// OPTIMISTIC LOCAL STOCK UPDATES
// -------------------------------------------------------------

export async function adjustLocalStockCache(productId: number, quantityDelta: number): Promise<void> {
  if (!isBrowser() || !productId) return;
  try {
    const cacheKeys = [
      "/admin/inventory/stock-on-hand/",
      "/inventory/stock-on-hand/",
      `/inventory/items/${productId}/`,
    ];

    for (const rawKey of cacheKeys) {
      const key = normalizeCacheKey(rawKey);
      const cached = await getCachedData<Record<string, unknown> | unknown[]>(key);
      if (!cached) continue;

      if (Array.isArray(cached)) {
        let modified = false;
        const updated = cached.map((row: any) => {
          if (row && (row.product === productId || row.id === productId || row.product_id === productId)) {
            modified = true;
            const current = Number(row.available_qty ?? row.stock_quantity ?? row.quantity ?? 0);
            return {
              ...row,
              available_qty: Math.max(0, current + quantityDelta),
              current_stock_quantity: Math.max(0, current + quantityDelta),
              is_offline_adjusted: true,
            };
          }
          return row;
        });
        if (modified) {
          await setCachedData(key, updated);
        }
      } else if (typeof cached === "object" && cached !== null && "results" in cached && Array.isArray((cached as any).results)) {
        let modified = false;
        const results = (cached as any).results.map((row: any) => {
          if (row && (row.product === productId || row.id === productId || row.product_id === productId)) {
            modified = true;
            const current = Number(row.available_qty ?? row.stock_quantity ?? row.quantity ?? 0);
            return {
              ...row,
              available_qty: Math.max(0, current + quantityDelta),
              current_stock_quantity: Math.max(0, current + quantityDelta),
              is_offline_adjusted: true,
            };
          }
          return row;
        });
        if (modified) {
          await setCachedData(key, { ...cached, results });
        }
      }
    }
  } catch {
    // Ignore cache adjustment errors
  }
}

// -------------------------------------------------------------
// EVENT NOTIFICATIONS FOR UI
// -------------------------------------------------------------

type SyncSubscriber = () => void;
const subscribers = new Set<SyncSubscriber>();

export function subscribeOfflineOutbox(callback: SyncSubscriber): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

function notifySyncSubscribers(): void {
  if (typeof window === "undefined") return;
  subscribers.forEach((cb) => {
    try {
      cb();
    } catch {
      // Ignore subscriber errors
    }
  });

  window.dispatchEvent(new CustomEvent("subidha-offline-outbox-changed"));
}
