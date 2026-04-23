"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import DataTable, { type Column } from "@/components/ui/DataTable";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import { WorkspaceNotice } from "@/components/ui/role-workspace";
import { WorkspaceSection } from "@/components/ui/workspace";
import {
  listPartnerCommissions,
  type PartnerCommission,
} from "@/services/partner";

function money(value?: string | number | null): string {
  return `₹${Number(value ?? 0).toFixed(2)}`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load commission visibility.";
}

function commissionAmount(row: PartnerCommission): number {
  const parsed = Number(row.commission_amount ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isSettled(status?: string | null): boolean {
  const token = String(status || "").toUpperCase();
  return token === "PAID" || token === "SETTLED";
}

export default function PartnerPayoutsPage({
  mode = "payouts",
}: {
  mode?: "payouts" | "commissions";
}) {
  const [rows, setRows] = useState<PartnerCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const payload = await listPartnerCommissions();
      setRows(payload);
      setError(null);
    } catch (err) {
      setRows([]);
      setError(normalizeError(err));
    } finally {
      if (mode === "initial") {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const pendingAmount = useMemo(
    () =>
      rows
        .filter((row) => !isSettled(row.status))
        .reduce((sum, row) => sum + commissionAmount(row), 0),
    [rows]
  );

  const settledAmount = useMemo(
    () =>
      rows
        .filter((row) => isSettled(row.status))
        .reduce((sum, row) => sum + commissionAmount(row), 0),
    [rows]
  );

  const latestCreatedAt = rows[0]?.created_at ?? null;

  const columns = useMemo<Column<PartnerCommission>[]>(
    () => [
      {
        key: "id",
        title: "Entry",
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">#{row.id}</div>
            <div className="text-xs text-muted-foreground">
              Subscription {row.subscription ? `SUB-${row.subscription}` : "—"}
            </div>
          </div>
        ),
      },
      {
        key: "subscription",
        title: "Subscription",
        render: (row) => (row.subscription ? `SUB-${row.subscription}` : "—"),
      },
      {
        key: "emi",
        title: "EMI",
        render: (row) => (row.emi ? `#${row.emi}` : "—"),
      },
      {
        key: "commission_amount",
        title: "Amount",
        align: "right",
        render: (row) => money(row.commission_amount),
      },
      {
        key: "status",
        title: "Status",
        render: (row) => <StatusBadge status={row.status || "PENDING"} />,
      },
      {
        key: "created_at",
        title: "Created",
        render: (row) => formatDateTime(row.created_at),
      },
      {
        key: "paid_at",
        title: "Settled",
        render: (row) => formatDateTime(row.paid_at || row.approved_at),
      },
    ],
    []
  );

  const title = mode === "commissions" ? "Commission Ledger" : "Payout Visibility";
  const subtitle =
    mode === "commissions"
      ? "Partner-scoped commission entries with earned, pending, and settled visibility."
      : "Partner-scoped payout visibility derived from live commission entries without exposing admin payout controls.";

  return (
    <PortalPage
      eyebrow="Partner Earnings"
      title={title}
      subtitle={subtitle}
      helperNote="This page is visibility-only for partners. Payout finalization, finance-account posting, and reconciliation remain controlled admin workflows."
      helperTone="info"
      breadcrumbs={[
        { label: "Partner", href: "/partner" },
        { label: mode === "commissions" ? "Commissions" : "Payouts" },
      ]}
      actions={[
        {
          href: "/partner/payments",
          label: "Payments",
          variant: "secondary",
        },
        {
          href: "/partner/collections",
          label: "Collections",
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Entries", value: rows.length },
        {
          label: "Pending amount",
          value: money(pendingAmount),
          tone: pendingAmount > 0 ? "warning" : "default",
        },
        {
          label: "Settled amount",
          value: money(settledAmount),
          tone: settledAmount > 0 ? "success" : "default",
        },
        {
          label: "Latest entry",
          value: formatDateTime(latestCreatedAt),
        },
      ]}
      statusBadge={{ label: "Partner visibility", tone: "info" }}
    >
      <div className="space-y-6">
        <WorkspaceSection
          title="Payout boundary"
          description="Partner earnings visibility stays separate from payout authorization and finance posting."
          action={
            <ActionButton
              variant="outline"
              onClick={() => void loadPage("refresh")}
              disabled={loading || refreshing}
              leftIcon={<RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </ActionButton>
          }
        >
          <WorkspaceNotice tone="info" title="What this page shows">
            Commission entries indicate partner earnings posture. They do not grant payout control, reverse settled commissions, or expose admin-only payout-batch workflows.
          </WorkspaceNotice>
        </WorkspaceSection>

        {loading ? <LoadingBlock label="Loading payout visibility..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load payout visibility"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <WorkspaceSection
            title="Commission and payout entries"
            description="Live partner-visible earning rows sourced from the commission API."
          >
            {rows.length === 0 ? (
              <EmptyState
                title="No commission entries found"
                description="No commission or payout visibility rows are currently available in this partner scope."
              />
            ) : (
              <DataTable<PartnerCommission>
                rows={rows}
                columns={columns}
                rowActions={(row) =>
                  row.subscription ? (
                    <ActionButton
                      href={`/partner/subscriptions/${row.subscription}`}
                      variant="outline"
                    >
                      Subscription
                    </ActionButton>
                  ) : null
                }
              />
            )}
          </WorkspaceSection>
        ) : null}
      </div>
    </PortalPage>
  );
}
