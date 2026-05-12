"use client";

import Link from "next/link";
import { useCallback } from "react";
import { CheckCircle2, PackageSearch, RotateCcw, Send, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ControlLaneGrid } from "@/components/admin/control-center/ControlLanes";
import { WorkspaceCardsPage } from "@/components/admin/erp/WorkspaceCardsPage";
import { OperationsWorkspaceShell } from "@/components/layout/page-shells";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { ROUTES } from "@/lib/routes";
import { getAdminDeliveryWorkspace } from "@/services/admin-erp";
import { listAdminDeliveries } from "@/services/deliveries";

const deliveryLaneLinkClass =
  "rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export default function AdminDeliveryWorkspacePage() {
  const loader = useCallback(() => getAdminDeliveryWorkspace(), []);
  const [queueCounts, setQueueCounts] = useState<{
    pendingAllocation: number;
    readyDispatch: number;
    outForDelivery: number;
    delivered: number;
    returnExchange: number;
  } | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);

  const laneLinks = useMemo(
    () => ({
      pendingAllocation: `${ROUTES.admin.deliveries}?bucket=PENDING`,
      readyDispatch: `${ROUTES.admin.deliveries}?bucket=READY_DISPATCH`,
      outForDelivery: `${ROUTES.admin.deliveries}?status=OUT_FOR_DELIVERY`,
      delivered: `${ROUTES.admin.deliveries}?bucket=DELIVERED`,
      returnExchange: `${ROUTES.admin.deliveries}?status=RETURN_REQUESTED`,
    }),
    []
  );

  useEffect(() => {
    let active = true;

    async function loadQueues() {
      try {
        setQueueLoading(true);
        setQueueError(null);

        const [pending, ready, outForDelivery, delivered, returnRequested, returned] = await Promise.all([
          listAdminDeliveries({ bucket: "PENDING" }),
          listAdminDeliveries({ bucket: "READY_DISPATCH" }),
          listAdminDeliveries({ status: "OUT_FOR_DELIVERY" }),
          listAdminDeliveries({ bucket: "DELIVERED" }),
          listAdminDeliveries({ status: "RETURN_REQUESTED" }),
          listAdminDeliveries({ status: "RETURNED" }),
        ]);

        if (!active) return;
        setQueueCounts({
          pendingAllocation: pending.count,
          readyDispatch: ready.count,
          outForDelivery: outForDelivery.count,
          delivered: delivered.count,
          returnExchange: returnRequested.count + returned.count,
        });
      } catch (err) {
        if (!active) return;
        setQueueCounts(null);
        setQueueError(err instanceof Error && err.message.trim() ? err.message : "Unable to load delivery queues.");
      } finally {
        if (active) setQueueLoading(false);
      }
    }

    void loadQueues();
    return () => {
      active = false;
    };
  }, []);

  return (
    <OperationsWorkspaceShell
      operationalActions={
        <nav aria-label="Delivery work lanes" className="flex flex-wrap gap-2">
          <Link href={ROUTES.admin.deliveries} className={deliveryLaneLinkClass}>
            Delivery register
          </Link>
          <Link href={ROUTES.admin.deliveryCreate} className={deliveryLaneLinkClass}>
            Create delivery
          </Link>
          <Link href={ROUTES.admin.deliveryWorkspace} className={deliveryLaneLinkClass}>
            Delivery workspace
          </Link>
          <Link href={ROUTES.admin.deliveryReturns} className={deliveryLaneLinkClass}>
            Returns
          </Link>
          <Link href={ROUTES.admin.subscriptions} className={deliveryLaneLinkClass}>
            Subscriptions
          </Link>
        </nav>
      }
      lanes={
        <div className="space-y-6">
          <ControlLaneGrid
            title="Delivery lanes"
            description="Queues are sourced from the deliveries register. Counts reflect real API totals; drill into each lane to act safely."
            lanes={[
              {
                title: "Pending allocation",
                description: "New delivery requests awaiting stock allocation or scheduling.",
                href: laneLinks.pendingAllocation,
                icon: <PackageSearch className="h-4 w-4" />,
                badge: "Pending",
                detail: `Queue: ${queueCounts?.pendingAllocation ?? (queueLoading ? "…" : 0)}`,
              },
              {
                title: "Ready to dispatch",
                description: "Delivery records that are ready for dispatch confirmation.",
                href: laneLinks.readyDispatch,
                icon: <Send className="h-4 w-4" />,
                badge: "Dispatch",
                detail: `Queue: ${queueCounts?.readyDispatch ?? (queueLoading ? "…" : 0)}`,
              },
              {
                title: "Out for delivery",
                description: "In-transit deliveries that require delivery completion or exception handling.",
                href: laneLinks.outForDelivery,
                icon: <Truck className="h-4 w-4" />,
                badge: "Transit",
                detail: `Queue: ${queueCounts?.outForDelivery ?? (queueLoading ? "…" : 0)}`,
              },
              {
                title: "Delivered",
                description: "Completed deliveries for reference and post-delivery service handoff.",
                href: laneLinks.delivered,
                icon: <CheckCircle2 className="h-4 w-4" />,
                badge: "Delivered",
                detail: `Queue: ${queueCounts?.delivered ?? (queueLoading ? "…" : 0)}`,
              },
              {
                title: "Return / exchange",
                description: "Return pickup requested or return completed deliveries that may require Service Desk follow-up.",
                href: laneLinks.returnExchange,
                icon: <RotateCcw className="h-4 w-4" />,
                badge: "Returns",
                detail: `Queue: ${queueCounts?.returnExchange ?? (queueLoading ? "…" : 0)}`,
              },
            ]}
            actions={
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-[var(--surface-strong)] px-4 text-sm font-semibold text-foreground transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
              >
                Refresh queues
              </button>
            }
          />

          {queueLoading ? <LoadingBlock label="Loading delivery queue counts…" /> : null}
          {!queueLoading && queueError ? (
            <ErrorState title="Delivery queues unavailable" description={queueError} />
          ) : null}

          <WorkspaceCardsPage
            title="Delivery Workspace"
            subtitle="Delivery pending/blocked, handover, returns, inspection, and damage flow."
            boardTitle="Delivery Operations"
            loader={loader}
          />
        </div>
      }
    />
  );
}
