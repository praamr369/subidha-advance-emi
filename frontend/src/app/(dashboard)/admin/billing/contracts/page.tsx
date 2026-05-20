"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { BILLING_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ActionButton from "@/components/ui/ActionButton";
import ERPPageShell from "@/components/erp/ERPPageShell";
import PrintActionBanner from "@/components/print/PrintActionBanner";
import SubscriptionContractDocument from "@/components/print/SubscriptionContractDocument";
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

function activationStatusTone(status: string | undefined): string {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "ACTIVE" || normalized === "COMPLETED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (normalized === "PENDING_DELIVERY" || normalized === "RETURN_HOLD") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (normalized === "CANCELLED") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-slate-300 bg-slate-100 text-slate-800";
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

  const loadPage = useCallback(async () => {
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
  }, [customerFilter, subscriptionFilter]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const eligibleCount = useMemo(
    () => profiles.filter((profile) => profile.invoice_eligible).length,
    [profiles]
  );
  const highlightedProfile = profiles[0] ?? null;

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
    <ERPPageShell
      className="receipt-print-page"
      eyebrow="Billing Contract Mirrors"
      title="Billing Contracts"
      subtitle="Mirror contracts sourced from live subscriptions, EMI rows, delivery state, payments, and waivers. Billing remains derivative, not the operational source of truth."
      helperNote="Billing contracts are mirrored control documents derived from subscription truth. They remain distinct from source subscription, payment, and accounting posting flows."
      helperTone="info"
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
        <WorkspaceDirectory
          className="receipt-print-hide"
          title="Billing route map"
          description="Move between mirrored contracts, document registers, notes, receipts, and direct-sale routes from one billing control surface."
          groups={BILLING_CONTROL_DIRECTORY_GROUPS}
        />

        {notice ? (
          <div className="receipt-print-hide rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {notice}
          </div>
        ) : null}

        {loading ? <ERPLoadingState label="Loading billing contracts..." /> : null}
        {!loading && error ? (
          <ERPErrorState
            title="Unable to load billing contracts"
            description={error}
            onRetry={() => void loadPage()}
          />
        ) : null}

        {!loading && !error ? (
          <>
            <WorkspaceSection
              className="receipt-print-hide"
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
              className="receipt-print-hide"
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

            <WorkspaceSection
              title="Contract Printable Summary"
              description="Business-safe contract snapshot generated from the latest mirrored contract in the current filtered scope."
            >
              <PrintActionBanner
                className="mb-4"
                title="Contract Print / PDF"
                description="Use this action to print the mirrored contract summary or save a compact PDF for records."
              />
              {highlightedProfile ? (
                <SubscriptionContractDocument
                  audienceLabel="Mirror contract snapshot for customer and operator reference. Canonical payment and waiver truth remains in subscription ledgers."
                  contractReference={
                    highlightedProfile.contract_reference_snapshot ||
                    `BILL-PROFILE-${highlightedProfile.id}`
                  }
                  subscriptionId={highlightedProfile.subscription}
                  statusLabel={
                    highlightedProfile.activation_state_label ||
                    highlightedProfile.activation_state
                  }
                  statusToneClassName={activationStatusTone(
                    highlightedProfile.activation_state
                  )}
                  issuedOn={formatDate(highlightedProfile.last_synced_at)}
                  customerFields={[
                    {
                      label: "Customer",
                      value:
                        highlightedProfile.customer_name ||
                        `Customer #${highlightedProfile.customer}`,
                      emphasize: true,
                    },
                    {
                      label: "Product",
                      value:
                        highlightedProfile.product_name_snapshot ||
                        highlightedProfile.product_name ||
                        `Product #${highlightedProfile.product}`,
                      emphasize: true,
                    },
                    {
                      label: "Product Code",
                      value:
                        highlightedProfile.product_code_snapshot ||
                        highlightedProfile.product_code ||
                        "—",
                    },
                  ]}
                  contractFields={[
                    {
                      label: "Activation State",
                      value:
                        highlightedProfile.activation_state_label ||
                        highlightedProfile.activation_state,
                    },
                    {
                      label: "Delivery Gate",
                      value: highlightedProfile.delivery_gate_status || "—",
                    },
                    {
                      label: "Contract Start",
                      value: formatDate(highlightedProfile.contract_start_date),
                    },
                    {
                      label: "Tenure",
                      value: `${highlightedProfile.tenure_months} month(s)`,
                    },
                    {
                      label: "Invoice Eligible",
                      value: highlightedProfile.invoice_eligible ? "Yes" : "No",
                    },
                    {
                      label: "Activation Time",
                      value: formatDate(highlightedProfile.activated_at),
                    },
                  ]}
                  financialFields={[
                    {
                      label: "Contract Value",
                      value: money(highlightedProfile.contract_total),
                      emphasize: true,
                    },
                    {
                      label: "Monthly EMI",
                      value: money(highlightedProfile.monthly_amount),
                      emphasize: true,
                    },
                    {
                      label: "Paid",
                      value: money(highlightedProfile.paid_amount_snapshot),
                    },
                    {
                      label: "Waived",
                      value: money(highlightedProfile.waived_amount_snapshot),
                    },
                    {
                      label: "Remaining",
                      value: money(highlightedProfile.remaining_amount_snapshot),
                      emphasize: true,
                    },
                    {
                      label: "Next Due",
                      value: `${money(highlightedProfile.next_due_amount)} on ${formatDate(highlightedProfile.next_due_date)}`,
                    },
                  ]}
                  terms={[
                    "Billing contract mirrors remain derivative and do not replace canonical subscription/payment truth.",
                    "Winner and waiver effects are preserved from source subscription records only.",
                    "Sync events provide additive traceability without mutating financial history.",
                  ]}
                />
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                  No contract mirror is available in this filter scope for print preview.
                </div>
              )}
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
