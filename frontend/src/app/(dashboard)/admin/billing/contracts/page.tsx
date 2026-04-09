"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  listBillingProfiles,
  listBillingSyncEvents,
  syncBillingProfile,
  type BillingProfile,
  type BillingSyncEvent,
} from "@/services/billing";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load billing contracts.";
}

export default function BillingContractsPage() {
  const searchParams = useSearchParams();
  const subscriptionFilter = searchParams.get("subscription") ?? "";
  const customerFilter = searchParams.get("customer") ?? "";

  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<BillingProfile[]>([]);
  const [events, setEvents] = useState<BillingSyncEvent[]>([]);

  async function loadPage() {
    setLoading(true);
    try {
      const [profilePayload, eventPayload] = await Promise.all([
        listBillingProfiles({
          subscription: subscriptionFilter || undefined,
          customer: customerFilter || undefined,
        }),
        listBillingSyncEvents({
          subscription: subscriptionFilter || undefined,
        }),
      ]);
      setProfiles(profilePayload.results);
      setEvents(eventPayload.results.slice(0, 10));
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      setProfiles([]);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, [subscriptionFilter, customerFilter]);

  const eligibleCount = useMemo(
    () => profiles.filter((profile) => profile.invoice_eligible).length,
    [profiles]
  );

  async function handleSync(profileId: number) {
    setSyncingId(profileId);
    try {
      await syncBillingProfile(profileId);
      setNotice(`Billing contract ${profileId} synced from live subscription and EMI state.`);
      setError(null);
      await loadPage();
    } catch (err) {
      setNotice(null);
      setError(toErrorMessage(err));
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <PortalPage
      title="Billing Contracts"
      subtitle="Mirror contracts sourced from live subscriptions, EMI rows, delivery state, payments, and waivers. Billing remains derivative, not the operational source of truth."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Billing", href: ROUTES.admin.billing },
        { label: "Contracts" },
      ]}
      actions={[
        { href: ROUTES.admin.billing, label: "Billing Overview", variant: "secondary" },
        { href: ROUTES.admin.billingInvoices, label: "Invoices", variant: "secondary" },
        { href: ROUTES.admin.billingReceipts, label: "Receipts", variant: "secondary" },
      ]}
      stats={[
        { label: "Contracts", value: String(profiles.length), tone: "info" },
        { label: "Invoice Eligible", value: String(eligibleCount), tone: eligibleCount > 0 ? "success" : "default" },
        { label: "Pending Delivery", value: String(profiles.filter((profile) => profile.activation_state === "PENDING_DELIVERY").length), tone: "warning" },
        { label: "Recent Sync Events", value: String(events.length), tone: "info" },
      ]}
      statusBadge={{ label: "Admin Controlled Mirror", tone: "info" }}
    >
      <div className="space-y-6">
        {notice ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {notice}
          </div>
        ) : null}

        {loading ? <LoadingBlock label="Loading billing contracts..." /> : null}
        {!loading && error ? (
          <ErrorState title="Unable to load billing contracts" description={error} onRetry={() => void loadPage()} />
        ) : null}

        {!loading && !error ? (
          <>
            <WorkspaceSection
              title="Contract mirrors"
              description="Activation and next-due values are mirrored from canonical subscription and EMI truth. Manual sync is best-effort and additive."
            >
              <div className="grid gap-3">
                {profiles.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                    No billing contract mirrors matched the current filter.
                  </div>
                ) : (
                  profiles.map((profile) => (
                    <div key={profile.id} className="rounded-[1.35rem] border border-border bg-background px-4 py-4 shadow-sm">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div className="space-y-2">
                          <div className="text-base font-semibold text-foreground">
                            {profile.product_name_snapshot || profile.product_name || `Product #${profile.product}`}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Subscription #{profile.subscription} • Customer {profile.customer_name || `#${profile.customer}`}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            State: {profile.activation_state.replaceAll("_", " ")} • Delivery gate: {profile.delivery_gate_status || "—"}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Contract {money(profile.contract_total)} • Paid {money(profile.paid_amount_snapshot)} • Remaining {money(profile.remaining_amount_snapshot)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Next due {formatDate(profile.next_due_date)} • {money(profile.next_due_amount)}
                          </div>
                          {profile.latest_sync_event ? (
                            <div className="text-xs text-muted-foreground">
                              Latest sync: {profile.latest_sync_event.event_type} • {formatDate(profile.latest_sync_event.synced_at)}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-2 xl:max-w-sm xl:justify-end">
                          <ActionButton
                            variant="primary"
                            loading={syncingId === profile.id}
                            onClick={() => void handleSync(profile.id)}
                          >
                            Sync mirror
                          </ActionButton>
                          <Link
                            href={`/admin/subscriptions/${profile.subscription}`}
                            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                          >
                            Open subscription
                          </Link>
                          <Link
                            href={`${ROUTES.admin.billingRegister}?subscription=${profile.subscription}`}
                            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                          >
                            Billing docs
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </WorkspaceSection>

            <WorkspaceSection
              title="Recent sync events"
              description="Trace records show which business event refreshed a billing contract mirror."
            >
              <div className="grid gap-3">
                {events.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                    No billing sync events recorded yet.
                  </div>
                ) : (
                  events.map((event) => (
                    <div key={event.id} className="rounded-[1.25rem] border border-border bg-background px-4 py-3 text-sm shadow-sm">
                      <div className="font-medium text-foreground">
                        {event.event_type} • {event.source_model} #{event.source_id}
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        Profile #{event.billing_profile} • {event.status} • {formatDate(event.synced_at)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
