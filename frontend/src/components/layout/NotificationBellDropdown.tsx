"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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

async function fetchBellUnreadCount(role: NavigationRole): Promise<number> {
  if (role === "ADMIN") {
    const response = await getAdminNotificationUnreadCount();
    return response.unread_count ?? 0;
  }
  if (role === "CASHIER") {
    const response = await getCashierNotificationUnreadCount();
    return response.unread_count ?? 0;
  }

  const summary =
    role === "CUSTOMER"
      ? await getCustomerNotificationSummary()
      : role === "PARTNER"
        ? await getPartnerNotificationSummary()
        : role === "VENDOR"
          ? await getVendorNotificationSummary()
          : await getNotificationSummary();

  return summary.unread_count ?? 0;
}

async function fetchBellItems(role: NavigationRole): Promise<NotificationBellSnapshot> {
  const listRes =
    role === "ADMIN"
      ? await listAdminNotifications({ limit: 6 })
      : role === "CASHIER"
        ? await listCashierNotifications({ limit: 6 })
        : role === "CUSTOMER"
          ? await listCustomerNotifications({ limit: 6 })
          : role === "PARTNER"
            ? await listPartnerNotifications({ limit: 6 })
            : role === "VENDOR"
              ? await listVendorNotifications({ limit: 6 })
              : await listNotifications({ limit: 6 });

  return {
    items: listRes.results ?? [],
    unread: listRes.unread_count ?? 0,
  };
}

export default function NotificationBellDropdown({ role }: { role: NavigationRole }) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => notificationKeys.bell(role), [role]);
  const unreadQueryKey = useMemo(
    () => [...queryKey, "unread"] as const,
    [queryKey]
  );
  const listQueryKey = useMemo(
    () => [...queryKey, "list"] as const,
    [queryKey]
  );
  const [open, setOpen] = useState(false);
  const [mobileSheet, setMobileSheet] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const unreadQuery = useQuery({
    queryKey: unreadQueryKey,
    queryFn: () => fetchBellUnreadCount(role),
    enabled: isAuthenticated,
    staleTime: 15_000,
  });

  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () => fetchBellItems(role),
    enabled: isAuthenticated && open,
    // Opening the menu has always refreshed its contents. Keeping the list
    // stale preserves that behavior while the query key single-flights any
    // overlapping open/retry request and prevents stale response races.
    staleTime: 0,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 640px)");
    const apply = () => setMobileSheet(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    function onDocMouseDown(ev: MouseEvent) {
      if (!open) return;
      if (mobileSheet) return;
      const el = rootRef.current;
      if (el && !el.contains(ev.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [mobileSheet, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function onToggle() {
    setOpen((current) => !current);
  }

  const unreadCount = !isAuthenticated ? 0 : (unreadQuery.data ?? null);
  const items = listQuery.data?.items ?? [];
  const dropdownBusy = open && listQuery.isFetching;

  async function onMarkRead(id: number) {
    const previousList = queryClient.getQueryData<NotificationBellSnapshot>(listQueryKey);
    const previousUnread = queryClient.getQueryData<number>(unreadQueryKey);
    if (previousList) {
      const target = previousList.items.find((n) => n.id === id);
      const decrement = target && !target.is_read ? 1 : 0;
      const nextUnread = Math.max(
        0,
        (previousUnread ?? previousList.unread) - decrement
      );
      queryClient.setQueryData<number>(unreadQueryKey, nextUnread);
      queryClient.setQueryData<NotificationBellSnapshot>(listQueryKey, {
        unread: nextUnread,
        items: previousList.items.map((n) =>
          n.id === id ? { ...n, is_read: true } : n
        ),
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
      if (previousList) {
        queryClient.setQueryData(listQueryKey, previousList);
      }
      if (previousUnread !== undefined) {
        queryClient.setQueryData(unreadQueryKey, previousUnread);
      } else {
        void queryClient.invalidateQueries({ queryKey: unreadQueryKey });
      }
    }
  }

  async function onMarkAllRead() {
    if (role !== "CUSTOMER" && role !== "PARTNER" && role !== "VENDOR") return;
    const previousList = queryClient.getQueryData<NotificationBellSnapshot>(listQueryKey);
    const previousUnread = queryClient.getQueryData<number>(unreadQueryKey);
    queryClient.setQueryData<number>(unreadQueryKey, 0);
    queryClient.setQueryData<NotificationBellSnapshot>(listQueryKey, {
      unread: 0,
      items: (previousList?.items ?? []).map((n) => ({ ...n, is_read: true })),
    });
    try {
      await markAllNotificationsRead();
      await queryClient.invalidateQueries({ queryKey });
    } catch {
      if (previousList) {
        queryClient.setQueryData(listQueryKey, previousList);
      }
      if (previousUnread !== undefined) {
        queryClient.setQueryData(unreadQueryKey, previousUnread);
      } else {
        void queryClient.invalidateQueries({ queryKey: unreadQueryKey });
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
        className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--topbar-border)] bg-[var(--topbar-control)] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40 focus-visible:ring-offset-2"
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
        mobileSheet ? (
          <div className="fixed inset-0 z-[220] sm:hidden">
            <button
              type="button"
              aria-label="Close notifications"
              className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
              onClick={() => setOpen(false)}
            />
            <div
              className="absolute inset-x-0 bottom-0 max-h-[78dvh] rounded-t-2xl border border-border bg-[var(--surface-card-elevated)] p-3 shadow-[var(--popup-shadow-xl)]"
              role="dialog"
              aria-label="Notifications menu"
            >
              <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
                <span className="text-sm font-semibold text-foreground">Notifications</span>
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-xs font-medium text-foreground"
                  onClick={() => setOpen(false)}
                >
                  Close
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border py-2">
                {showMarkAll ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => void onMarkAllRead()}
                  >
                    Mark all read
                  </button>
                ) : null}
                <Link href={href} className="text-xs font-medium text-primary hover:underline" onClick={() => setOpen(false)}>
                  Open center
                </Link>
              </div>
              <div className="max-h-[58dvh] overflow-y-auto py-2" aria-busy={dropdownBusy || listQuery.isPending}>
                {listQuery.isError ? (
                  <ErrorState
                    title="Notifications unavailable"
                    message={listQuery.error instanceof Error ? listQuery.error.message : "Try again."}
                    onRetry={() => void listQuery.refetch()}
                  />
                ) : dropdownBusy || (listQuery.isPending && !listQuery.data) ? (
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
                        {n.body ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{n.body}</p> : null}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {n.category}
                            {!n.is_read ? " · unread" : ""}
                          </span>
                          <div className="flex items-center gap-2">
                            {typeof n.payload?.action_url === "string" && n.payload.action_url.trim() ? (
                              <Link
                                href={n.payload.action_url}
                                onClick={() => setOpen(false)}
                                className="text-xs font-medium text-primary hover:underline"
                              >
                                Open
                              </Link>
                            ) : null}
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
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ) : (
        <div
          className="absolute right-0 z-50 mt-2 flex max-h-[min(24rem,calc(100dvh-5.5rem))] w-[min(100vw-2rem,22rem)] flex-col overflow-hidden rounded-xl border border-border bg-[var(--surface-card-elevated)] p-3 shadow-lg motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200"
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
            className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain py-2"
            aria-busy={dropdownBusy || listQuery.isPending}
          >
            {listQuery.isError ? (
              <ErrorState
                title="Notifications unavailable"
                message={listQuery.error instanceof Error ? listQuery.error.message : "Try again."}
                onRetry={() => void listQuery.refetch()}
              />
            ) : dropdownBusy || (listQuery.isPending && !listQuery.data) ? (
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
                      <div className="flex items-center gap-2">
                        {typeof n.payload?.action_url === "string" && n.payload.action_url.trim() ? (
                          <Link
                            href={n.payload.action_url}
                            onClick={() => setOpen(false)}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            Open
                          </Link>
                        ) : null}
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
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        )
      ) : null}
    </div>
  );
}
