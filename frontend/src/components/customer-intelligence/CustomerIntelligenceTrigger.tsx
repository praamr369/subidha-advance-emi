"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import DrawerShell from "@/components/ui/DrawerShell";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { getCustomerOperationalSummary, invalidateCustomerOperationalSummary, type CustomerOperationalSummaryResponse } from "@/services/customer-intelligence";

function money(value: string): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function CustomerStatusBadge({ status }: { status: string }) {
  const palette: Record<string, string> = {
    GOOD: "bg-emerald-100 text-emerald-800",
    DUE: "bg-amber-100 text-amber-800",
    OVERDUE: "bg-rose-100 text-rose-800",
    DELIVERY_PENDING: "bg-orange-100 text-orange-800",
    SERVICE_OPEN: "bg-blue-100 text-blue-800",
  };
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold ${palette[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

function CustomerSummarySkeleton() {
  return <div className="text-xs text-muted-foreground">Loading customer summary...</div>;
}

function CustomerIntelligencePopover({ data }: { data: CustomerOperationalSummaryResponse }) {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-foreground">{data.customer.name}</div>
        <CustomerStatusBadge status={data.summary.risk_status} />
      </div>
      <div className="text-muted-foreground">{data.customer.phone || "No phone"}</div>
      <div className="grid grid-cols-2 gap-2 text-muted-foreground">
        <div>Active: {data.summary.active_subscriptions}</div>
        <div>Overdue EMI: {data.summary.overdue_emi_count}</div>
        <div>Subs due: {money(data.summary.subscription_outstanding)}</div>
        <div>Direct due: {money(data.summary.direct_sale_outstanding)}</div>
      </div>
    </div>
  );
}

function CustomerIntelligenceDrawer({
  open,
  onClose,
  data,
  customerId,
}: {
  open: boolean;
  onClose: () => void;
  data: CustomerOperationalSummaryResponse | null;
  customerId: number;
}) {
  return (
    <DrawerShell open={open} onClose={onClose} title="Customer Intelligence Preview" description="Operational snapshot for collection and CRM actions." size="wide">
      {!data ? (
        <CustomerSummarySkeleton />
      ) : (
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">{data.customer.name}</div>
              <div className="text-xs text-muted-foreground">{data.customer.phone}</div>
            </div>
            <CustomerStatusBadge status={data.summary.risk_status} />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>Active subs: {data.summary.active_subscriptions}</div>
            <div>Overdue EMI: {data.summary.overdue_emi_count}</div>
            <div>Pending deliveries: {data.summary.pending_delivery_count}</div>
            <div>Open service: {data.summary.open_service_count}</div>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div>Subscription due: {money(data.summary.subscription_outstanding)}</div>
            <div>Direct-sale due: {money(data.summary.direct_sale_outstanding)}</div>
            <div>Last payment: {data.summary.last_payment_date || "—"}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/finance/collect?customer=${customerId}`} className="rounded border px-3 py-1.5 text-xs">Collect payment</Link>
            <Link href={`/admin/customers/${customerId}`} className="rounded border px-3 py-1.5 text-xs">View customer profile</Link>
            <Link href={`/admin/subscriptions/create?customer=${customerId}`} className="rounded border px-3 py-1.5 text-xs">Create subscription</Link>
            <Link href={`/admin/deliveries?customer=${customerId}`} className="rounded border px-3 py-1.5 text-xs">View deliveries</Link>
            <Link href={`/admin/service-desk?customer=${customerId}`} className="rounded border px-3 py-1.5 text-xs">View service tickets</Link>
            <button
              type="button"
              className="rounded border px-3 py-1.5 text-xs"
              onClick={() => invalidateCustomerOperationalSummary(customerId)}
            >
              Refresh
            </button>
          </div>
        </div>
      )}
    </DrawerShell>
  );
}

export function CustomerIntelligenceTrigger({
  customerId,
  customerName,
  scope,
}: {
  customerId?: number | null;
  customerName: string;
  scope: "admin" | "cashier";
}) {
  const [hoverOpen, setHoverOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [data, setData] = useState<CustomerOperationalSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const canPreview = typeof customerId === "number" && customerId > 0;
  const hoverDisabled = typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;

  const load = useCallback(async () => {
    if (!canPreview) return;
    setLoading(true);
    try {
      const payload = await getCustomerOperationalSummary(customerId, scope);
      setData(payload);
    } finally {
      setLoading(false);
    }
  }, [canPreview, customerId, scope]);

  useEffect(() => {
    if (!hoverOpen && !drawerOpen) return;
    void load();
  }, [drawerOpen, hoverOpen, load]);

  if (!canPreview) return <span>{customerName}</span>;

  return (
    <>
      <HoverCard open={hoverOpen && !hoverDisabled} onOpenChange={setHoverOpen} openDelay={300} closeDelay={100}>
        <HoverCardTrigger asChild>
          <button type="button" className="text-left font-medium text-foreground underline-offset-4 hover:underline" onClick={() => setDrawerOpen(true)}>
            {customerName}
          </button>
        </HoverCardTrigger>
        <HoverCardContent className="w-80">
          {loading || !data ? <CustomerSummarySkeleton /> : <CustomerIntelligencePopover data={data} />}
        </HoverCardContent>
      </HoverCard>
      <CustomerIntelligenceDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} data={data} customerId={customerId} />
    </>
  );
}
