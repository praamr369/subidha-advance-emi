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

function CustomerSummaryError({ message }: { message: string }) {
  return <div className="text-xs text-destructive">{message}</div>;
}

function CustomerSummaryEmpty() {
  return <div className="text-xs text-muted-foreground">No customer summary is available.</div>;
}

function supportTicketTitle(ticket: Record<string, unknown>): string {
  const title = String(ticket.title || ticket.subject || "").trim();
  if (title) return title;
  const message = String(ticket.message || "").trim();
  if (message) return message.slice(0, 80);
  const category = String(ticket.category || "").trim().replaceAll("_", " ");
  if (category) return category;
  return "Service request";
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
  scope,
  loading,
  error,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  data: CustomerOperationalSummaryResponse | null;
  customerId: number;
  scope: "admin" | "cashier";
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const profileHref = scope === "cashier" ? `/admin/customers/${customerId}` : `/admin/customers/${customerId}`;
  const collectHref =
    scope === "cashier"
      ? `/cashier/collect`
      : `/admin/finance/collect?customer=${customerId}`;
  return (
    <DrawerShell open={open} onClose={onClose} title="Customer Intelligence Preview" description="Operational snapshot for collection and CRM actions." size="wide">
      {loading ? (
        <CustomerSummarySkeleton />
      ) : error ? (
        <CustomerSummaryError message={error} />
      ) : !data ? (
        <CustomerSummaryEmpty />
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
            <div>Historical subs: {data.summary.historical_subscriptions ?? 0}</div>
            <div>Overdue EMI: {data.summary.overdue_emi_count}</div>
            <div>Pending deliveries: {data.summary.pending_delivery_count}</div>
            <div>Open service: {data.summary.open_service_count}</div>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div>Subscription due: {money(data.summary.subscription_outstanding)}</div>
            <div>Direct-sale due: {money(data.summary.direct_sale_outstanding)}</div>
            <div>Last payment: {data.summary.last_payment_date || "—"}</div>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div>Active contract: {money(data.summary.active_contract_value || "0.00")}</div>
            <div>Historical contract: {money(data.summary.historical_contract_value || "0.00")}</div>
            <div>Active payments: {data.summary.active_payment_count ?? 0}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Number(data.summary.subscription_outstanding || 0) > 0 ||
              Number(data.summary.direct_sale_outstanding || 0) > 0) ? (
              <Link href={collectHref} className="rounded border px-3 py-1.5 text-xs">Collect payment</Link>
            ) : (
              <span className="rounded border bg-muted px-3 py-1.5 text-xs text-muted-foreground">
                No active receivable to collect
              </span>
            )}
            <Link href={profileHref} className="rounded border px-3 py-1.5 text-xs">View customer profile</Link>
            <Link href={`/admin/subscriptions/create?customer=${customerId}`} className="rounded border px-3 py-1.5 text-xs">Create subscription</Link>
            <Link href={`/admin/deliveries?customer=${customerId}`} className="rounded border px-3 py-1.5 text-xs">View deliveries</Link>
            <Link href={`/admin/service-desk?customer=${customerId}`} className="rounded border px-3 py-1.5 text-xs">View service tickets</Link>
            <button
              type="button"
              className="rounded border px-3 py-1.5 text-xs"
              onClick={onRefresh}
            >
              Refresh
            </button>
          </div>
          {(data.service_tickets || []).length > 0 ? (
            <div className="space-y-2 rounded border bg-muted/40 p-3">
              <div className="text-xs font-semibold text-muted-foreground">Recent service tickets</div>
              {(data.service_tickets || []).slice(0, 3).map((ticket, index) => {
                const row = (ticket || {}) as Record<string, unknown>;
                return (
                  <div key={String(row.id || index)} className="text-xs">
                    <div className="font-medium text-foreground">{supportTicketTitle(row)}</div>
                    <div className="text-muted-foreground">
                      {String(row.status || "OPEN")} · {String(row.category || "GENERAL")}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
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
  const [error, setError] = useState<string | null>(null);
  const [isHoverCapable, setIsHoverCapable] = useState(false);
  const canPreview = typeof customerId === "number" && customerId > 0;

  const load = useCallback(async () => {
    if (!canPreview) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await getCustomerOperationalSummary(customerId, scope);
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load customer summary.");
    } finally {
      setLoading(false);
    }
  }, [canPreview, customerId, scope]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    const apply = () => setIsHoverCapable(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!hoverOpen && !drawerOpen) return;
    void load();
  }, [drawerOpen, hoverOpen, load]);

  const handleRefresh = useCallback(() => {
    if (!canPreview) return;
    invalidateCustomerOperationalSummary(customerId);
    void load();
  }, [canPreview, customerId, load]);

  if (!canPreview) return <span>{customerName}</span>;

  return (
    <>
      <HoverCard open={hoverOpen && isHoverCapable} onOpenChange={setHoverOpen} openDelay={300} closeDelay={160}>
        <HoverCardTrigger asChild>
          <button
            type="button"
            className="text-left font-medium text-foreground underline-offset-4 hover:underline"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDrawerOpen(true);
            }}
            aria-label={`Open customer intelligence for ${customerName}`}
          >
            {customerName}
          </button>
        </HoverCardTrigger>
        <HoverCardContent className="z-[280] w-80" side="bottom" align="start" collisionPadding={12} avoidCollisions sticky="partial">
          {loading ? (
            <CustomerSummarySkeleton />
          ) : error ? (
            <CustomerSummaryError message={error} />
          ) : data ? (
            <CustomerIntelligencePopover data={data} />
          ) : (
            <CustomerSummaryEmpty />
          )}
        </HoverCardContent>
      </HoverCard>
      <CustomerIntelligenceDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        data={data}
        customerId={customerId}
        scope={scope}
        loading={loading}
        error={error}
        onRefresh={handleRefresh}
      />
    </>
  );
}
