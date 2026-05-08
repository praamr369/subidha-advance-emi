"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { NavigationRole } from "@/config/navigation";
import ErrorState from "@/components/feedback/ErrorState";
import { NotificationListSkeleton } from "@/components/feedback/Skeleton";
import { ROUTES } from "@/lib/routes";
import { notificationKeys } from "@/lib/query-keys";
import { useAuth } from "@/providers/AuthProvider";
import {
  getAdminNotificationUnreadCount,
  getCashierNotificationUnreadCount,
  getNotificationSummary,
  getCustomerNotificationSummary,
  getPartnerNotificationSummary,
  getVendorNotificationSummary,
  listAdminNotifications,
  listCashierNotifications,
  listNotifications,
  listCustomerNotifications,
  listPartnerNotifications,
  listVendorNotifications,
  markAdminNotificationRead,
  markAllNotificationsRead,
  markCashierNotificationRead,
  markNotificationRead,
  type SystemNotification,
} from "@/services/notifications";

export type NotificationBellSnapshot = {
  unread: number;
  items: SystemNotification[];
};

function centerHref(role: NavigationRole): string {
  switch (role) {
    case "ADMIN":
      return ROUTES.admin.notifications;
    case "PARTNER":
      return ROUTES.partner.notifications;
    case "CASHIER":
      return ROUTES.cashier.notifications;
    case "CUSTOMER":
      return ROUTES.customer.notifications;
    case "VENDOR":
      return ROUTES.vendor.notifications;
    default:
      return ROUTES.customer.notifications;
  }
}

async function fetchBellSnapshot(role: NavigationRole): Promise<NotificationBellSnapshot> {
  if (role === "ADMIN") {
    const [listRes, countRes] = await Promise.all([
      listAdminNotifications({ limit: 6 }),
      getAdminNotificationUnreadCount(),
    ]);
    return {
      items: listRes.results ?? [],
      unread: countRes.unread_count ?? listRes.unread_count ?? 0,
    };
  }
  if (role === "CASHIER") {
    const [listRes, countRes] = await Promise.all([
      listCashierNotifications({ limit: 6 }),
      getCashierNotificationUnreadCount(),
    ]);
    return {
      items: listRes.results ?? [],
      unread: countRes.unread_count ?? listRes.unread_count ?? 0,
    };
  }
  const [listRes, summary] = await Promise.all(
    role === "CUSTOMER"
      ? [listCustomerNotifications({ limit: 6 }), getCustomerNotificationSummary()]
      : role === "PARTNER"
        ? [listPartnerNotifications({ limit: 6 }), getPartnerNotificationSummary()]
        : role === "VENDOR"
          ? [listVendorNotifications({ limit: 6 }), getVendorNotificationSummary()]
          : [listNotifications({ limit: 6 }), getNotificationSummary()]
  );
  return {
    items: listRes.results ?? [],
    unread: summary.unread_count ?? listRes.unread_count ?? 0,
  };
}

export default function NotificationBellDropdown({ role }: { role: NavigationRole }) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = notificationKeys.bell(role);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const bellQuery = useQuery({
    queryKey,
    queryFn: () => fetchBellSnapshot(role),
    enabled: isAuthenticated,
    staleTime: 15_000,
  });

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
    if (next && isAuthenticated) {
      void bellQuery.refetch();
    }
  }

  const unreadCount = !isAuthenticated ? 0 : (bellQuery.data?.unread ?? null);
  const items = bellQuery.data?.items ?? [];
  const dropdownBusy = open && bellQuery.isFetching;

  async function onMarkRead(id: number) {
    const previous = queryClient.getQueryData<NotificationBellSnapshot>(queryKey);
    if (previous) {
      const target = previous.items.find((n) => n.id === id);
      const decrement = target && !target.is_read ? 1 : 0;
      queryClient.setQueryData<NotificationBellSnapshot>(queryKey, {
        unread: Math.max(0, previous.unread - decrement),
        items: previous.items.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      });
    }
    try {
      if (role === "ADMIN") {
        await markAdminNotificationRead(id);
      } else if (role === "CASHIER") {
        await markCashierNotificationRead(id);
      } else {
        await markNotificationRead(id);
      }
    } catch {
      if (previous) {
        queryClient.setQueryData(queryKey, previous);
      }
    }
  }

  async function onMarkAllRead() {
    if (role !== "CUSTOMER" && role !== "PARTNER") return;
    const previous = queryClient.getQueryData<NotificationBellSnapshot>(queryKey);
    queryClient.setQueryData<NotificationBellSnapshot>(queryKey, {
      unread: 0,
      items: (previous?.items ?? []).map((n) => ({ ...n, is_read: true })),
    });
    try {
      await markAllNotificationsRead();
      await queryClient.invalidateQueries({ queryKey });
    } catch {
      if (previous) {
        queryClient.setQueryData(queryKey, previous);
      }
    }
  }

  const href = centerHref(role);
  const badge =
    unreadCount === null ? null : unreadCount > 99 ? "99+" : String(Math.max(0, unreadCount));

  const showMarkAll = (role === "CUSTOMER" || role === "PARTNER" || role === "VENDOR") && items.some((n) => !n.is_read);

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
        <Bell className="h-4 w-4" aria-hidden="true" />
        {badge !== null && unreadCount !== null && unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,22rem)] rounded-2xl border border-border bg-[var(--surface-card-elevated)] p-3 shadow-lg motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200"
          role="dialog"
          aria-label="Notifications menu"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {showMarkAll ? (
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => void onMarkAllRead()}
                >
                  Mark all read
                </button>
              ) : null}
              <Link
                href={href}
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => setOpen(false)}
              >
                Open center
              </Link>
            </div>
          </div>
          <div
            className="max-h-80 overflow-y-auto py-2"
            aria-busy={dropdownBusy || bellQuery.isPending}
          >
            {bellQuery.isError ? (
              <ErrorState
                title="Notifications unavailable"
                message={bellQuery.error instanceof Error ? bellQuery.error.message : "Try again."}
                onRetry={() => void bellQuery.refetch()}
              />
            ) : dropdownBusy || (bellQuery.isPending && !bellQuery.data) ? (
              <NotificationListSkeleton rows={4} />
            ) : items.length === 0 ? (
              <p className="px-1 py-3 text-xs text-muted-foreground">You are caught up.</p>
            ) : (
              <ul className="space-y-2">
                {items.map((n) => (
                  <li
                    key={n.id}
                    className="motion-safe:transition-colors rounded-xl border border-border bg-background px-3 py-2 text-sm duration-150"
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
                          className="motion-safe:transition-opacity text-xs font-medium text-primary duration-150 hover:underline hover:opacity-90"
                          aria-label={`Mark notification ${n.title} as read`}
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
