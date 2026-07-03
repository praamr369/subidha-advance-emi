"use client";

import { apiFetch } from "@/lib/api";
import { API_BASE_URL } from "@/lib/constants";

export type RealtimeNotificationsPayload = { unread_count: number };
export type RealtimeBadgesPayload = Record<string, number>;

export type RealtimeHandlers = {
  onNotifications?: (payload: RealtimeNotificationsPayload) => void;
  onBadges?: (payload: RealtimeBadgesPayload) => void;
};

type TicketResponse = {
  ticket: string;
  expires_in: number;
  stream_path: string;
  stream_lifetime_seconds: number;
};

/**
 * Single shared SSE connection, multiplexed to every subscriber on the page.
 *
 * The stream authenticates with a short-lived single-use ticket (the JWT
 * never appears in a URL). The server closes each stream after ~50s by
 * design; the client re-tickets and reconnects, with exponential backoff on
 * real errors. The connection opens with the first subscriber and closes
 * with the last, so the bell and the navigation badges share one socket.
 */
const subscribers = new Set<RealtimeHandlers>();
let source: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelayMs = 2_000;
let connecting = false;

function dispatchNotifications(payload: RealtimeNotificationsPayload) {
  for (const handler of subscribers) handler.onNotifications?.(payload);
}

function dispatchBadges(payload: RealtimeBadgesPayload) {
  for (const handler of subscribers) handler.onBadges?.(payload);
}

function scheduleReconnect(delayMs: number) {
  if (subscribers.size === 0) return;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    void connect();
  }, delayMs);
}

function teardown() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  source?.close();
  source = null;
}

async function connect(): Promise<void> {
  if (connecting || subscribers.size === 0 || typeof window === "undefined") return;
  if (typeof window.EventSource === "undefined") return; // very old browsers: REST polling still works
  connecting = true;
  try {
    const ticketRes = await apiFetch<TicketResponse>("/realtime/ticket/", {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (subscribers.size === 0) return;

    const base = API_BASE_URL.replace(/\/+$/, "");
    source?.close();
    source = new EventSource(`${base}/realtime/stream/?ticket=${encodeURIComponent(ticketRes.ticket)}`);

    source.addEventListener("notifications", (event) => {
      retryDelayMs = 2_000;
      try {
        dispatchNotifications(JSON.parse((event as MessageEvent).data));
      } catch {
        /* malformed frame: ignore */
      }
    });
    source.addEventListener("badges", (event) => {
      try {
        dispatchBadges(JSON.parse((event as MessageEvent).data));
      } catch {
        /* malformed frame: ignore */
      }
    });
    source.addEventListener("end", () => {
      // Planned server-side close: reconnect promptly with a fresh ticket.
      source?.close();
      source = null;
      scheduleReconnect(1_000);
    });
    source.onerror = () => {
      source?.close();
      source = null;
      scheduleReconnect(retryDelayMs);
      retryDelayMs = Math.min(retryDelayMs * 2, 30_000);
    };
  } catch {
    scheduleReconnect(retryDelayMs);
    retryDelayMs = Math.min(retryDelayMs * 2, 30_000);
  } finally {
    connecting = false;
  }
}

export function subscribeRealtime(handlers: RealtimeHandlers): () => void {
  subscribers.add(handlers);
  if (subscribers.size === 1) {
    void connect();
  }
  return () => {
    subscribers.delete(handlers);
    if (subscribers.size === 0) teardown();
  };
}
