"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import { ROUTES } from "@/lib/routes";
import {
  getAdminOperationsCommandCenter,
  getAdminOperationsQueueSummary,
} from "@/services/phase5-control";

import OperationalResizableWorkspace from "./OperationalResizableWorkspace";

export type QueueRow = {
  key: string;
  count: number;
  severity: string;
  oldest_pending_date?: string | null;
  detail_url?: string;
  empty_state?: string | null;
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

export function OperationsCommandCenterWorkspace() {
  const [queueRows, setQueueRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userSelectedInstance, setUserSelectedInstance] = useState<string | null>(
    null
  );

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [queuePayload] = await Promise.all([
          getAdminOperationsQueueSummary() as Promise<{ results?: QueueRow[] }>,
          getAdminOperationsCommandCenter(),
        ]);
        setQueueRows(queuePayload.results ?? []);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load operations command center."
        );
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

  const flatItems = useMemo(() => {
    const items: Array<{ sectionTitle: string; row: QueueRow; instanceKey: string }> =
      [];
    SECTION_KEY_GROUPS.forEach((section) => {
      section.keys.forEach((key) => {
        const row = rowMap.get(key);
        if (!row) return;
        items.push({
          sectionTitle: section.title,
          row,
          instanceKey: `${section.title}:${key}`,
        });
      });
    });
    return items;
  }, [rowMap]);

  const activeInstanceKey = useMemo(() => {
    if (flatItems.length === 0) return null;
    if (
      userSelectedInstance &&
      flatItems.some((item) => item.instanceKey === userSelectedInstance)
    ) {
      return userSelectedInstance;
    }
    return flatItems[0].instanceKey;
  }, [flatItems, userSelectedInstance]);

  const selectedEntry = useMemo(
    () =>
      flatItems.find((item) => item.instanceKey === activeInstanceKey) ?? null,
    [flatItems, activeInstanceKey]
  );

  if (loading) {
    return <LoadingBlock label="Loading operations command center..." />;
  }

  if (error) {
    return (
      <ErrorState title="Command center unavailable" description={error} />
    );
  }

  const leftPane =
    flatItems.length === 0 ? (
      <div className="rounded-xl border border-border bg-card p-4">
        <EmptyState
          title="No queue rows"
          description="There are no operational queue summaries to display right now."
          tone="info"
        />
      </div>
    ) : (
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Queues</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Select a lane to preview counts and routing actions.
        </p>
        <ul className="mt-4 flex max-h-[min(68vh,620px)] flex-col gap-2 overflow-y-auto pr-1">
          {flatItems.map(({ sectionTitle, row, instanceKey }) => {
            const active = instanceKey === activeInstanceKey;
            const label = KEY_LABELS[row.key] || row.key;
            return (
              <li key={instanceKey}>
                <button
                  type="button"
                  onClick={() => setUserSelectedInstance(instanceKey)}
                  aria-pressed={active}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    active
                      ? "border-foreground bg-muted/50 shadow-sm"
                      : "border-border bg-background hover:bg-muted/30"
                  }`}
                >
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {sectionTitle}
                  </div>
                  <div className="mt-1 font-semibold text-foreground">{label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Count {row.count} · {row.severity} · Oldest{" "}
                    {row.oldest_pending_date || "—"}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    );

  const rightPane = !selectedEntry ? (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-6">
      <EmptyState
        title="No row selected"
        description="Pick a queue lane from the list to open the operational preview."
        tone="info"
      />
    </div>
  ) : (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {selectedEntry.sectionTitle}
      </div>
      <h2 className="mt-1 text-lg font-semibold text-foreground">
        {KEY_LABELS[selectedEntry.row.key] || selectedEntry.row.key}
      </h2>
      <dl className="mt-4 grid gap-2 text-sm">
        <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
          <dt className="text-muted-foreground">Count</dt>
          <dd className="font-medium text-foreground">{selectedEntry.row.count}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
          <dt className="text-muted-foreground">Severity</dt>
          <dd className="font-medium text-foreground">{selectedEntry.row.severity}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
          <dt className="text-muted-foreground">Oldest pending</dt>
          <dd className="font-medium text-foreground">
            {selectedEntry.row.oldest_pending_date || "—"}
          </dd>
        </div>
        {selectedEntry.row.empty_state ? (
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {selectedEntry.row.empty_state}
          </div>
        ) : null}
      </dl>
      <div className="mt-5 flex flex-wrap gap-2">
        {actionSet(selectedEntry.row).map((action) => (
          <ActionButton
            key={`${selectedEntry.row.key}-${action.label}`}
            href={action.href}
            size="sm"
            variant={action.variant}
          >
            {action.label}
          </ActionButton>
        ))}
      </div>
    </section>
  );

  return (
    <div className="space-y-5">
      <OperationalResizableWorkspace
        storageKey="operations-command-center-v1"
        defaultLeftPercent={36}
        minLeftPercent={24}
        minRightPercent={34}
        left={leftPane}
        right={rightPane}
      />
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-xs text-muted-foreground">
          Partner request visibility:{" "}
          <Link
            href={ROUTES.admin.partnerPaymentRequests}
            className="font-semibold text-foreground underline"
          >
            Partner Payment Requests Queue
          </Link>
        </div>
      </div>
    </div>
  );
}
