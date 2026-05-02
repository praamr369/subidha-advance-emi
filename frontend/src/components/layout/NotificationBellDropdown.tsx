"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ROUTES } from "@/lib/routes";
import type { NavigationRole } from "@/config/navigation";
import {
  getAdminNotificationUnreadCount,
  getCashierNotificationUnreadCount,
  getNotificationSummary,
  listAdminNotifications,
  listCashierNotifications,
  listNotifications,
  markAdminNotificationRead,
  markCashierNotificationRead,
  markNotificationRead,
  type SystemNotification,
} from "@/services/notifications";

function centerHref(role: NavigationRole): string {
  switch (role) {
    case "ADMIN":
      return ROUTES.admin.notifications;
    case "PARTNER":
      return ROUTES.partner.notifications;
    case "CASHIER":
      return ROUTES.cashier.notifications;
    case "CUSTOMER":
    default:
      return ROUTES.customer.notifications;
  }
}

async function fetchUnreadCount(role: NavigationRole): Promise<number> {
  if (role === "ADMIN") {
    const r = await getAdminNotificationUnreadCount();
    return r.unread_count ?? 0;
  }
  if (role === "CASHIER") {
    const r = await getCashierNotificationUnreadCount();
    return r.unread_count ?? 0;
  }
  const s = await getNotificationSummary();
  return s.unread_count ?? 0;
}

export default function NotificationBellDropdown({ role }: { role: NavigationRole }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState<number | null>(null);
  const [items, setItems] = useState<SystemNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const listPromise =
        role === "ADMIN"
          ? listAdminNotifications({ limit: 6 })
          : role === "CASHIER"
            ? listCashierNotifications({ limit: 6 })
            : listNotifications({ limit: 6 });
      const [countRes, listRes] = await Promise.all([fetchUnreadCount(role), listPromise]);
      setUnread(countRes);
      setItems(listRes.results ?? []);
    } catch {
      setUnread(0);
      setItems([]);
    }
  }, [role]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function onDocMouseDown(ev: MouseEvent) {
      if (!open) return;
      const el = rootRef.current;
      if (el && !el.contains(ev.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  async function onToggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      try {
        await refresh();
      } finally {
        setLoading(false);
      }
    }
  }

  async function onMarkRead(id: number) {
    try {
      if (role === "ADMIN") {
        await markAdminNotificationRead(id);
      } else if (role === "CASHIER") {
        await markCashierNotificationRead(id);
      } else {
        await markNotificationRead(id);
      }
      await refresh();
    } catch {
      // ignore
    }
  }

  const href = centerHref(role);
  const badge = unread === null ? null : unread > 99 ? "99+" : String(unread);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => void onToggle()}
        className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--topbar-border)] bg-[var(--topbar-control)] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition hover:bg-[var(--surface-muted)]"
        aria-label="Notifications"
        title="Notifications"
        data-testid="header-notification-bell"
      >
        <Bell className="h-4 w-4" />
        {badge && unread !== null && unread > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,22rem)] rounded-2xl border border-border bg-[var(--surface-card-elevated)] p-3 shadow-lg">
          <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            <Link
              href={href}
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setOpen(false)}
            >
              Open center
            </Link>
          </div>
          <div className="max-h-80 overflow-y-auto py-2">
            {loading ? (
              <p className="px-1 py-3 text-xs text-muted-foreground">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-1 py-3 text-xs text-muted-foreground">You are caught up.</p>
            ) : (
              <ul className="space-y-2">
                {items.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  >
                    <div className="font-medium text-foreground">{n.title}</div>
                    {n.body ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                    ) : null}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {n.category}
                        {!n.is_read ? " · unread" : ""}
                      </span>
                      {!n.is_read ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-primary hover:underline"
                          onClick={() => void onMarkRead(n.id)}
                        >
                          Mark read
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
