"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { PartnerVendorWorkspaceShell } from "@/components/layout/page-shells";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  getVendorNotificationSummary,
  type NotificationSummaryResponse,
} from "@/services/notifications";
import { listVendorDashboard } from "@/services/vendor-ops";

type VendorDashboardPayload = {
  pending_quote_requests?: number;
  accepted_quotes?: number;
  outstanding_payable?: string | number;
  purchase_orders?: number;
  purchase_returns?: number;
  products_count?: number;
  pending_purchase_bills?: string | number;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unable to load vendor dashboard.";
}

function formatMoney(value: unknown): string {
  const amount = Number(value ?? 0);
  return `₹${Number.isFinite(amount) ? amount.toFixed(2) : "0.00"}`;
}

export default function VendorDashboardPage() {
  const [data, setData] = useState<VendorDashboardPayload | null>(null);
  const [notificationSummary, setNotificationSummary] =
    useState<NotificationSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboardPayload, notificationPayload] = await Promise.allSettled([
        listVendorDashboard(),
        getVendorNotificationSummary(),
      ]);
      if (dashboardPayload.status !== "fulfilled") {
        throw dashboardPayload.reason;
      }
      setData(dashboardPayload.value ?? null);
      setNotificationSummary(
        notificationPayload.status === "fulfilled" ? notificationPayload.value : null
      );
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      setData(null);
      setNotificationSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const quickActions = useMemo(
    () => [
      {
        title: "Submit Quote",
        description: "Respond to open quote requests with your rates and timeline.",
        href: ROUTES.vendor.quotes,
      },
      {
        title: "View Purchase Orders",
        description: "Track approved orders and fulfillment action.",
        href: ROUTES.vendor.orders,
      },
      {
        title: "View Ledger",
        description: "Review posted vendor ledger entries.",
        href: ROUTES.vendor.ledger,
      },
      {
        title: "View Outstanding",
        description: "Check payable balance and settlement posture.",
        href: ROUTES.vendor.outstanding,
      },
      {
        title: "Update Products",
        description: "Maintain vendor product availability and details.",
        href: ROUTES.vendor.products,
      },
      {
        title: "Notification Center",
        description: "Open role-safe vendor alerts and action items.",
        href: ROUTES.vendor.notifications,
      },
    ],
    []
  );

  return (
    <PortalPage
      title="Vendor Dashboard"
      subtitle="Vendor-scoped workspace for quote requests, purchase orders, ledger, and payable visibility."
      helperNote="This dashboard only shows records linked to your vendor account."
      helperTone="info"
      breadcrumbs={[{ label: "Vendor" }, { label: "Dashboard" }]}
      actions={[
        { label: "Quote Requests", href: ROUTES.vendor.quotes, variant: "primary" },
        { label: "Purchase Orders", href: ROUTES.vendor.orders, variant: "secondary" },
        { label: "Notifications", href: ROUTES.vendor.notifications, variant: "secondary" },
      ]}
      stats={
        data
          ? [
              { label: "Open quotes", value: String(data.pending_quote_requests ?? 0), tone: "warning" },
              { label: "Purchase orders", value: String(data.purchase_orders ?? 0) },
              { label: "Outstanding payable", value: formatMoney(data.outstanding_payable) },
              { label: "Unread alerts", value: String(notificationSummary?.unread_count ?? 0) },
            ]
          : []
      }
    >
      {loading ? <LoadingBlock label="Loading vendor dashboard..." /> : null}
      {!loading && error ? (
        <ErrorState
          title="Unable to load vendor dashboard"
          description={error}
          onRetry={() => void loadPage()}
        />
      ) : null}
      {!loading && !error && !data ? (
        <EmptyState
          title="No vendor dashboard data available"
          description="Your vendor workspace will show quote requests, orders, and ledger information after account linking."
        />
      ) : null}
      {!loading && !error && data ? (
        <PartnerVendorWorkspaceShell>
          <p className="text-sm text-muted-foreground">
            Accepted quotes: {String(data.accepted_quotes ?? 0)} · Returns:{" "}
            {String(data.purchase_returns ?? 0)} · Pending bills:{" "}
            {formatMoney(data.pending_purchase_bills)} · Catalog products:{" "}
            {String(data.products_count ?? 0)}
          </p>

          <WorkspaceSection
            title="Quick Actions"
            description="Use these actions to process vendor workflows without navigating through multiple pages."
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {quickActions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="rounded-xl border border-border bg-[var(--surface-card-elevated)] p-4 transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <div className="text-sm font-semibold text-foreground">{action.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{action.description}</div>
                </Link>
              ))}
            </div>
          </WorkspaceSection>
        </PartnerVendorWorkspaceShell>
      ) : null}
    </PortalPage>
  );
}
