"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import {
  getAdminOperationsCommandCenter,
  getAdminOperationsQueueSummary,
} from "@/services/phase5-control";

type QueueRow = {
  key: string;
  count: number;
  severity: string;
  oldest_pending_date?: string | null;
  detail_url?: string;
  empty_state?: string | null;
};

type OperationsPayload = {
  today_work?: unknown[];
  pending_approvals?: unknown[];
  financial_actions?: unknown[];
  partner_actions?: unknown[];
  customer_actions?: unknown[];
  inventory_alerts?: unknown[];
  delivery_returns?: unknown[];
};

const SECTION_KEY_GROUPS: Array<{ title: string; keys: string[] }> = [
  {
    title: "Today's Work",
    keys: ["subscription_requests_pending", "overdue_payments", "delivery_blocked"],
  },
  {
    title: "Pending Approvals",
    keys: ["contract_approvals_pending", "contract_activation_pending", "customer_kyc_pending"],
  },
  {
    title: "Financial Actions",
    keys: ["reconciliation_pending", "deposit_refunds_pending"],
  },
  {
    title: "Partner Actions",
    keys: ["partner_payment_requests_pending", "partner_collection_requests_pending"],
  },
  {
    title: "Customer Actions",
    keys: ["customer_kyc_pending", "support_requests_pending"],
  },
  {
    title: "Inventory Alerts",
    keys: ["overdue_payments"],
  },
  {
    title: "Delivery & Returns",
    keys: ["delivery_blocked", "return_inspections_pending"],
  },
];

const KEY_LABELS: Record<string, string> = {
  partner_payment_requests_pending: "Partner Payment Requests",
  partner_collection_requests_pending: "Partner Collection Requests",
  subscription_requests_pending: "Subscription Requests",
  customer_kyc_pending: "KYC Pending",
  contract_approvals_pending: "Contract Approvals Pending",
  contract_activation_pending: "Contract Activation Pending",
  return_inspections_pending: "Return Inspection Pending",
  deposit_refunds_pending: "Deposit Refund Pending",
  reconciliation_pending: "Reconciliation Pending",
  delivery_blocked: "Delivery Blocked",
  support_requests_pending: "Support Requests Pending",
  overdue_payments: "Overdue Payments",
};

function actionSet(row: QueueRow) {
  const href = row.detail_url || ROUTES.admin.operations;
  const approvalKeys = new Set([
    "contract_approvals_pending",
    "contract_activation_pending",
    "subscription_requests_pending",
  ]);
  if (approvalKeys.has(row.key)) {
    return [
      { label: "Approve", href, variant: "secondary" as const },
      { label: "Reject", href, variant: "outline" as const },
      { label: "View", href, variant: "ghost" as const },
    ];
  }
  return [
    { label: "View", href, variant: "outline" as const },
    { label: "Process", href, variant: "secondary" as const },
    { label: "Mark Done", href, variant: "ghost" as const },
  ];
}

export default function AdminOperationsCommandCenterPage() {
  const [queueRows, setQueueRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [queuePayload] = await Promise.all([
          getAdminOperationsQueueSummary() as Promise<{ results?: QueueRow[] }>,
          getAdminOperationsCommandCenter() as Promise<OperationsPayload>,
        ]);
        setQueueRows(queuePayload.results ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load operations command center.");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const rowMap = useMemo(
    () => new Map(queueRows.map((row) => [row.key, row])),
    [queueRows]
  );

  return (
    <PortalPage
      title="Operations Command Center"
      subtitle="Main operations work center for approvals, financial actions, partner actions, customer actions, inventory alerts, and delivery returns."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Operations", href: ROUTES.admin.operations },
        { label: "Command Center" },
      ]}
    >
      {loading ? <LoadingBlock label="Loading operations command center..." /> : null}
      {error ? <ErrorState title="Command center unavailable" description={error} /> : null}
      {!loading && !error ? (
        <div className="space-y-5">
          {SECTION_KEY_GROUPS.map((section) => {
            const rows = section.keys
              .map((key) => rowMap.get(key))
              .filter((row): row is QueueRow => Boolean(row));
            return (
              <section key={section.title} className="rounded-2xl border border-border bg-card p-4">
                <div className="mb-3 text-sm font-semibold text-foreground">{section.title}</div>
                {rows.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No active rows.</div>
                ) : (
                  <div className="space-y-3">
                    {rows.map((row) => (
                      <div key={`${section.title}-${row.key}`} className="rounded-xl border border-border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold text-foreground">{KEY_LABELS[row.key] || row.key}</div>
                            <div className="text-xs text-muted-foreground">
                              Count: {row.count} • Severity: {row.severity} • Oldest: {row.oldest_pending_date || "—"}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {actionSet(row).map((action) => (
                              <ActionButton key={`${row.key}-${action.label}`} href={action.href} size="sm" variant={action.variant}>
                                {action.label}
                              </ActionButton>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">
              Partner request visibility:{" "}
              <Link href={ROUTES.admin.partnerPaymentRequests} className="font-semibold text-foreground underline">
                Partner Payment Requests Queue
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </PortalPage>
  );
}

