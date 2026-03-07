"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import PortalPage from "@/components/ui/portal-page";
import DataTable from "@/components/ui/DataTable";
import { apiFetch, toArray } from "@/lib/api";

type Partner = {
  id: number;
  username: string;
  email?: string;
  phone?: string;
  is_active: boolean;
};

type Subscription = {
  id: number;
  customer: number;
  customer_name?: string;
  customer_phone?: string;
  product_name?: string;
  partner: number | null;
  batch: number | null;
  batch_code?: string;
  lucky_id: number | null;
  lucky_number?: number | null;
  plan_type: string;
  monthly_amount: string;
  total_amount: string;
  status: string;
};

type Payment = {
  id: number;
  customer: number;
  subscription: number;
  emi?: number | null;
  amount: string;
  method: string;
  payment_date: string;
  collected_by?: number | null;
  verified_by?: number | null;
};

type CommissionRow = {
  id: number;
  partner_label: string;
  subscription_label: string;
  customer_label: string;
  payment_count_label: string;
  collected_amount_label: string;
  estimated_commission_label: string;
  status_label: string;
};

const DEFAULT_COMMISSION_PERCENTAGE = 5;

function parseError(error: unknown): string {
  if (!(error instanceof Error)) return "Request failed";
  const raw = error.message?.trim() || "Request failed";

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const first = Object.values(parsed)[0];
    if (Array.isArray(first) && first[0]) return String(first[0]);
    if (typeof first === "string") return first;
  } catch {
    return raw;
  }

  return raw;
}

function formatCurrency(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

export default function AdminPartnerCommissionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialPartner = searchParams.get("partner") || "";

  const [partners, setPartners] = useState<Partner[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const [partnerFilter, setPartnerFilter] = useState(initialPartner);
  const [query, setQuery] = useState("");
  const [commissionPercent, setCommissionPercent] = useState(String(DEFAULT_COMMISSION_PERCENTAGE));

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAll(showRefreshing = false): Promise<void> {
    try {
      if (showRefreshing) setRefreshing(true);
      else setLoading(true);

      const [partnerRes, subscriptionRes, paymentRes] = await Promise.all([
        apiFetch("/admin/partners/"),
        apiFetch("/admin/subscriptions/"),
        apiFetch("/admin/payments/"),
      ]);

      setPartners(toArray<Partner>(partnerRes));
      setSubscriptions(toArray<Subscription>(subscriptionRes));
      setPayments(toArray<Payment>(paymentRes));
      setError(null);
    } catch (e) {
      setError(parseError(e));
      setPartners([]);
      setSubscriptions([]);
      setPayments([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const partnerMap = useMemo(
    () => Object.fromEntries(partners.map((p) => [p.id, p])),
    [partners]
  );

  const paymentBySubscription = useMemo(() => {
    const map = new Map<number, Payment[]>();

    for (const payment of payments) {
      if (!map.has(payment.subscription)) {
        map.set(payment.subscription, []);
      }
      map.get(payment.subscription)!.push(payment);
    }

    return map;
  }, [payments]);

  const commissionRate = useMemo(() => {
    const numeric = Number(commissionPercent || 0);
    if (Number.isNaN(numeric) || numeric < 0) return 0;
    return numeric;
  }, [commissionPercent]);

  const scopedSubscriptions = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return subscriptions.filter((sub) => {
      if (!sub.partner) return false;
      if (partnerFilter && String(sub.partner) !== partnerFilter) return false;

      if (!needle) return true;

      const partner = partnerMap[sub.partner];
      const haystack = [
        String(sub.id),
        sub.customer_name,
        sub.customer_phone,
        sub.product_name,
        sub.batch_code,
        sub.lucky_number != null ? String(sub.lucky_number) : "",
        partner?.username,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [subscriptions, partnerFilter, query, partnerMap]);

  const rows = useMemo<CommissionRow[]>(() => {
    return scopedSubscriptions.map((sub) => {
      const partner = sub.partner ? partnerMap[sub.partner] : null;
      const subscriptionPayments = paymentBySubscription.get(sub.id) || [];
      const collectedAmount = subscriptionPayments.reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      );
      const estimatedCommission = (collectedAmount * commissionRate) / 100;

      return {
        id: sub.id,
        partner_label: partner ? `${partner.username}${partner.phone ? ` (${partner.phone})` : ""}` : "-",
        subscription_label: `#${sub.id} • ${sub.product_name || "Product"} • ${sub.batch_code || "-"}${sub.lucky_number != null ? ` • Lucky #${sub.lucky_number}` : ""}`,
        customer_label: `${sub.customer_name || `Customer ${sub.customer}`}${sub.customer_phone ? ` (${sub.customer_phone})` : ""}`,
        payment_count_label: String(subscriptionPayments.length),
        collected_amount_label: formatCurrency(collectedAmount),
        estimated_commission_label: formatCurrency(estimatedCommission),
        status_label: sub.status,
      };
    });
  }, [scopedSubscriptions, partnerMap, paymentBySubscription, commissionRate]);

  const kpis = useMemo(() => {
    const partnerIds = new Set<number>();
    let linkedSubscriptions = 0;
    let collectedAmount = 0;
    let estimatedCommission = 0;

    for (const sub of scopedSubscriptions) {
      if (sub.partner) partnerIds.add(sub.partner);
      linkedSubscriptions += 1;

      const subscriptionPayments = paymentBySubscription.get(sub.id) || [];
      const totalCollectedForSubscription = subscriptionPayments.reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0
      );

      collectedAmount += totalCollectedForSubscription;
      estimatedCommission += (totalCollectedForSubscription * commissionRate) / 100;
    }

    return {
      partnersInScope: partnerIds.size,
      linkedSubscriptions,
      collectedAmount,
      estimatedCommission,
      activeSubscriptions: scopedSubscriptions.filter((s) => s.status === "ACTIVE").length,
      wonSubscriptions: scopedSubscriptions.filter((s) => s.status === "WON").length,
    };
  }, [scopedSubscriptions, paymentBySubscription, commissionRate]);

  return (
    <PortalPage
      title="Partner Commissions"
      subtitle="Track partner-linked collections and estimate payout exposure from subscription payment activity."
    >
      <section style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={() => router.push("/admin/partners")}>
          Back to Partners
        </button>
        <button type="button" onClick={() => loadAll(true)} disabled={refreshing}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
        <button type="button" onClick={() => router.push("/admin/payments")}>
          Open Payments
        </button>
      </section>

      <section
        style={{
          marginBottom: 16,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 10,
        }}
      >
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Partners in Scope: <b>{kpis.partnersInScope}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Linked Subscriptions: <b>{kpis.linkedSubscriptions}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Active Subscriptions: <b>{kpis.activeSubscriptions}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Won Subscriptions: <b>{kpis.wonSubscriptions}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Collected Amount: <b>{formatCurrency(kpis.collectedAmount)}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Estimated Commission: <b>{formatCurrency(kpis.estimatedCommission)}</b>
        </div>
      </section>

      <section
        style={{
          marginBottom: 16,
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 16,
          display: "grid",
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0 }}>Filters</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: 12,
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="commission-partner">Partner</label>
            <select
              id="commission-partner"
              value={partnerFilter}
              onChange={(event) => setPartnerFilter(event.target.value)}
            >
              <option value="">All partners</option>
              {partners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.username} {partner.phone ? `(${partner.phone})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="commission-search">Search</label>
            <input
              id="commission-search"
              placeholder="Customer, product, batch, lucky no..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="commission-percent">Commission %</label>
            <input
              id="commission-percent"
              type="number"
              min={0}
              step="0.01"
              value={commissionPercent}
              onChange={(event) => setCommissionPercent(event.target.value)}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => {
              setPartnerFilter("");
              setQuery("");
              setCommissionPercent(String(DEFAULT_COMMISSION_PERCENTAGE));
            }}
          >
            Reset Filters
          </button>
        </div>
      </section>

      <DataTable<CommissionRow>
        loading={loading}
        error={error}
        rows={rows}
        columns={[
          { key: "partner_label", title: "Partner" },
          { key: "subscription_label", title: "Subscription" },
          { key: "customer_label", title: "Customer" },
          { key: "payment_count_label", title: "Payments" },
          { key: "collected_amount_label", title: "Collected" },
          { key: "estimated_commission_label", title: "Estimated Commission" },
          { key: "status_label", title: "Subscription Status" },
        ]}
      />

      {!loading && !error && scopedSubscriptions.length > 0 ? (
        <section
          style={{
            marginTop: 16,
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <h2 style={{ marginTop: 0 }}>Priority Review Queue</h2>

          <div style={{ display: "grid", gap: 10 }}>
            {scopedSubscriptions.slice(0, 8).map((sub) => {
              const partner = sub.partner ? partnerMap[sub.partner] : null;
              const subscriptionPayments = paymentBySubscription.get(sub.id) || [];
              const collectedAmount = subscriptionPayments.reduce(
                (sum, payment) => sum + Number(payment.amount || 0),
                0
              );
              const estimatedCommission = (collectedAmount * commissionRate) / 100;

              return (
                <div
                  key={sub.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div>
                      <strong>{partner?.username || "-"}</strong> — Subscription #{sub.id}
                    </div>
                    <div style={{ color: "#4b5563" }}>
                      Customer: {sub.customer_name || `Customer ${sub.customer}`} • Collected:{" "}
                      {formatCurrency(collectedAmount)} • Estimated commission:{" "}
                      {formatCurrency(estimatedCommission)}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => router.push(`/admin/subscriptions/${sub.id}`)}
                    >
                      View Subscription
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push(`/admin/payments?subscription=${sub.id}`)}
                    >
                      View Payments
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section
        style={{
          marginTop: 16,
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 16,
          background: "#fafafa",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Operational Note</h2>
        <p style={{ marginBottom: 0 }}>
          This page estimates commission exposure from partner-linked subscriptions and recorded payments.
          For final payout accounting, expose a dedicated backend commission API from your Commission model.
        </p>
      </section>
    </PortalPage>
  );
}