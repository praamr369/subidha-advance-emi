"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import {
  getAdminCommissionReconciliation,
  type AdminCommissionReconciliationQuery,
} from "@/services/commissions";
import type { AdminCommissionReconciliationResponse } from "@/types/commission";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load commission reconciliation.";
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function WarningSection({
  title,
  total,
  rows,
  valueKey,
}: {
  title: string;
  total: string;
  rows: AdminCommissionReconciliationResponse["warnings"][keyof AdminCommissionReconciliationResponse["warnings"]]["results"];
  valueKey: "payment_amount" | "commission_amount";
}) {
  return (
    <SectionCard
      title={title}
      description={`Count ${rows.length > 0 ? "sampled below" : "is currently zero"} with live backend truth only.`}
    >
      <div className="mb-4 text-sm font-medium text-foreground">Total: {money(total)}</div>
      {rows.length === 0 ? (
        <EmptyState
          title="No rows"
          description="This warning group is currently clear for the active filter scope."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left">
                <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Reference
                </th>
                <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Partner
                </th>
                <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Customer
                </th>
                <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Subscription
                </th>
                <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                  Amount
                </th>
                <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${title}-${row.payment_id ?? row.commission_id ?? index}`}>
                  <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                    <div className="font-medium">
                      {row.payment_reference_no ||
                        (row.payment_id ? `PAY-${row.payment_id}` : `COM-${row.commission_id}`)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Payment #{row.payment_id ?? "—"} | Commission #{row.commission_id ?? "—"}
                    </div>
                  </td>
                  <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                    {row.partner_username || "—"}
                  </td>
                  <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                    <div>{row.customer_name || "—"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {row.customer_phone || "—"}
                    </div>
                  </td>
                  <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                    {row.subscription_number || "—"}
                  </td>
                  <td className="border-b border-border px-4 py-3 text-right text-sm font-semibold text-foreground">
                    {money(row[valueKey] ?? 0)}
                  </td>
                  <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                    {row.status || "MISSING"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

export default function AdminCommissionReconciliationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const partner = (searchParams.get("partner") || "").trim();

  const [partnerInput, setPartnerInput] = useState(partner);
  const [data, setData] = useState<AdminCommissionReconciliationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPartnerInput(partner);
  }, [partner]);

  const loadPage = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const query: AdminCommissionReconciliationQuery = {};
      if (partner) {
        query.partner = partner;
      }
      const payload = await getAdminCommissionReconciliation(query);
      setData(payload);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") {
        setData(null);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, [partner]);

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (partnerInput.trim()) next.set("partner", partnerInput.trim());
    router.replace(
      next.toString()
        ? `/admin/finance/reconciliation?${next.toString()}`
        : "/admin/finance/reconciliation"
    );
  }

  function handleResetFilters() {
    setPartnerInput("");
    router.replace("/admin/finance/reconciliation");
  }

  const warningCards = useMemo(() => {
    if (!data) return [];
    return [
      {
        label: "Missing Commissions",
        value: String(data.warnings.payments_missing_commission.count),
      },
      {
        label: "Invalid Payment Links",
        value: String(data.warnings.commissions_without_valid_payment.count),
      },
      {
        label: "Reversed Payment Links",
        value: String(data.warnings.commissions_on_reversed_payments.count),
      },
      {
        label: "Zero-rate / Role Drift",
        value: String(data.warnings.commissions_zero_rate_or_non_partner.count),
      },
    ];
  }, [data]);

  return (
    <PortalPage
      title="Commission Reconciliation"
      subtitle="Detect missing commission rows, invalid finance links, and partner commission drift before payout and reporting workflows break."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Finance", href: "/admin/finance" },
        { label: "Commission Reconciliation" },
      ]}
      actions={[
        {
          href: "/admin/finance/commissions",
          label: "Open Commission Register",
          variant: "primary",
        },
        {
          href: "/admin/finance/commissions/settled",
          label: "Open Payout Queue",
          variant: "secondary",
        },
      ]}
      stats={[
        {
          label: "Actual Commission",
          value: money(
            data?.overview.actual_commission_total ?? data?.overview.total_commission
          ),
          tone: "success",
        },
        {
          label: "Expected From Payments",
          value: money(data?.overview.expected_commission_total ?? 0),
        },
        {
          label: "Pending",
          value: String(data?.overview.pending_count ?? 0),
          tone: (data?.overview.pending_count ?? 0) > 0 ? "warning" : undefined,
        },
        {
          label: "Partner Mismatches",
          value: String(data?.overview.partner_mismatch_count ?? 0),
          tone:
            (data?.overview.partner_mismatch_count ?? 0) > 0
              ? "danger"
              : "success",
        },
        {
          label: "Warnings",
          value: String(
            warningCards.reduce((sum, card) => sum + Number(card.value), 0)
          ),
          tone:
            warningCards.reduce((sum, card) => sum + Number(card.value), 0) > 0
              ? "danger"
              : "success",
        },
      ]}
      statusBadge={{
        label: "Ledger Vs Commission Truth",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        <SectionCard
          title="Scope"
          description="Filter reconciliation by partner when you need a partner-specific operational snapshot."
        >
          <form onSubmit={handleApplyFilters} className="grid gap-4 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <label
                htmlFor="commission-reconciliation-partner"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Partner ID
              </label>
              <input
                id="commission-reconciliation-partner"
                value={partnerInput}
                onChange={(event) => setPartnerInput(event.target.value)}
                placeholder="Leave blank for all partners"
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              />
            </div>

            <div className="flex flex-wrap items-end gap-2 lg:col-span-2">
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => void loadPage("refresh")}
                disabled={loading || refreshing}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </form>
        </SectionCard>

        {loading ? <LoadingBlock label="Loading commission reconciliation..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load commission reconciliation"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && data ? (
          <>
            <SectionCard
              title="Warning Overview"
              description="These counts come from backend reconciliation rules, not frontend-derived assumptions."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {warningCards.map((card) => (
                  <div
                    key={card.label}
                    className="rounded-xl border border-border bg-muted/40 p-4"
                  >
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {card.label}
                    </div>
                    <div className="mt-2 text-xl font-semibold text-foreground">
                      {card.value}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Partner Breakdown"
              description="Expected totals are projected from eligible partner payments using the current partner commission rate. Actual totals come from stored commission rows. Mismatch flags help isolate missing rows, zero-rate drift, or rate-history differences."
            >
              {data.partner_breakdown.length === 0 ? (
                <EmptyState
                  title="No partner commission rows"
                  description="There are no partner commission totals for the current filter scope."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left">
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Partner
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                          Rate
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                          Payments
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                          Missing
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                          Pending
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                          Settled
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                          Expected
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                          Actual
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                          Delta
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Flags
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.partner_breakdown.map((row) => (
                        <tr key={row.partner_id}>
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">{row.partner_username}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Commission rows {row.commission_count}
                            </div>
                          </td>
                          <td className="border-b border-border px-4 py-3 text-right text-sm text-foreground">
                            {row.current_commission_rate
                              ? `${row.current_commission_rate}%`
                              : "—"}
                          </td>
                          <td className="border-b border-border px-4 py-3 text-right text-sm text-foreground">
                            {row.payment_count ?? 0}
                          </td>
                          <td className="border-b border-border px-4 py-3 text-right text-sm text-foreground">
                            {row.missing_commission_count ?? 0}
                          </td>
                          <td className="border-b border-border px-4 py-3 text-right text-sm text-foreground">
                            {money(row.pending_commission)}
                          </td>
                          <td className="border-b border-border px-4 py-3 text-right text-sm text-foreground">
                            {money(row.settled_commission)}
                          </td>
                          <td className="border-b border-border px-4 py-3 text-right text-sm text-foreground">
                            {money(row.expected_commission_total ?? 0)}
                          </td>
                          <td className="border-b border-border px-4 py-3 text-right text-sm text-foreground">
                            {money(row.actual_commission_total ?? row.total_commission)}
                          </td>
                          <td className="border-b border-border px-4 py-3 text-right text-sm font-semibold text-foreground">
                            {money(row.mismatch_amount ?? 0)}
                          </td>
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div
                              className={
                                row.has_mismatch
                                  ? "font-medium text-destructive"
                                  : "font-medium text-emerald-700"
                              }
                            >
                              {row.has_mismatch ? "Mismatch" : "Aligned"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {row.has_rate_drift ? "Rate drift detected" : "No rate drift"}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <WarningSection
              title="Partner-linked payments missing commission rows"
              total={data.warnings.payments_missing_commission.total_payment_amount ?? "0.00"}
              rows={data.warnings.payments_missing_commission.results}
              valueKey="payment_amount"
            />

            <WarningSection
              title="Commissions without valid payment linkage"
              total={data.warnings.commissions_without_valid_payment.total_commission_amount ?? "0.00"}
              rows={data.warnings.commissions_without_valid_payment.results}
              valueKey="commission_amount"
            />

            <WarningSection
              title="Commissions attached to reversed payments"
              total={data.warnings.commissions_on_reversed_payments.total_commission_amount ?? "0.00"}
              rows={data.warnings.commissions_on_reversed_payments.results}
              valueKey="commission_amount"
            />

            <WarningSection
              title="Zero-rate or non-partner commission inconsistencies"
              total={data.warnings.commissions_zero_rate_or_non_partner.total_commission_amount ?? "0.00"}
              rows={data.warnings.commissions_zero_rate_or_non_partner.results}
              valueKey="commission_amount"
            />
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
