"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import PortalPage from "@/components/ui/portal-page";
import DataTable from "@/components/ui/DataTable";
import { apiFetch, toArray } from "@/lib/api";

type Emi = {
  id: number;
  subscription: number;
  month_no: number;
  due_date: string;
  amount: string;
  status: string;

  customer?: number;
  customer_name?: string;
  customer_phone?: string;
  batch?: number | null;
  batch_code?: string;
  lucky_id?: number | null;
  lucky_number?: number | null;
  product_name?: string;
  total_paid?: string;
  balance_amount?: string;
};

type Subscription = {
  id: number;
  customer: number;
  customer_name?: string;
  customer_phone?: string;
  product_name?: string;
  batch: number | null;
  batch_code?: string;
  lucky_id: number | null;
  lucky_number?: number | null;
  status: string;
};

type Customer = {
  id: number;
  name: string;
  phone: string;
};

type OverdueRow = {
  id: number;
  customer_label: string;
  subscription_label: string;
  month_label: string;
  due_date: string;
  overdue_days: string;
  amount_label: string;
  balance_label: string;
  status: string;
};

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

function getOverdueDays(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);

  const diffMs = today.getTime() - due.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export default function AdminEmiOverduePage() {
  const router = useRouter();

  const [emis, setEmis] = useState<Emi[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [query, setQuery] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAll(showRefreshing = false): Promise<void> {
    try {
      if (showRefreshing) setRefreshing(true);
      else setLoading(true);

      const [emiRes, subscriptionRes, customerRes] = await Promise.all([
        apiFetch("/admin/emis/?overdue_only=true"),
        apiFetch("/admin/subscriptions/"),
        apiFetch("/admin/customers/"),
      ]);

      setEmis(toArray<Emi>(emiRes));
      setSubscriptions(toArray<Subscription>(subscriptionRes));
      setCustomers(toArray<Customer>(customerRes));
      setError(null);
    } catch (e) {
      setError(parseError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const subscriptionMap = useMemo(
    () => Object.fromEntries(subscriptions.map((s) => [s.id, s])),
    [subscriptions]
  );

  const customerMap = useMemo(
    () => Object.fromEntries(customers.map((c) => [c.id, c])),
    [customers]
  );

  const overdueEmis = useMemo(() => {
    const q = query.trim().toLowerCase();

    return emis
      .filter((emi) => emi.status === "PENDING")
      .filter((emi) => getOverdueDays(emi.due_date) > 0)
      .filter((emi) => {
        if (!q) return true;

        const sub = subscriptionMap[emi.subscription];
        const customer =
          (emi.customer && customerMap[emi.customer]) ||
          (sub?.customer && customerMap[sub.customer]) ||
          null;

        const haystack = [
          String(emi.id),
          String(emi.subscription),
          String(emi.month_no),
          emi.customer_name,
          emi.customer_phone,
          emi.product_name,
          emi.batch_code,
          customer?.name,
          customer?.phone,
          sub?.customer_name,
          sub?.customer_phone,
          sub?.product_name,
          sub?.batch_code,
          sub?.lucky_number != null ? String(sub.lucky_number) : "",
          emi.lucky_number != null ? String(emi.lucky_number) : "",
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(q);
      });
  }, [emis, query, subscriptionMap, customerMap]);

  const kpis = useMemo(() => {
    const overdueCount = overdueEmis.length;
    const overdueAmount = overdueEmis.reduce((sum, emi) => sum + Number(emi.amount || 0), 0);
    const maxDays = overdueEmis.reduce((max, emi) => Math.max(max, getOverdueDays(emi.due_date)), 0);
    const severeCount = overdueEmis.filter((emi) => getOverdueDays(emi.due_date) >= 30).length;

    return {
      overdueCount,
      overdueAmount,
      maxDays,
      severeCount,
    };
  }, [overdueEmis]);

  const tableRows = useMemo<OverdueRow[]>(() => {
    return overdueEmis
      .slice()
      .sort((a, b) => getOverdueDays(b.due_date) - getOverdueDays(a.due_date))
      .map((emi) => {
        const sub = subscriptionMap[emi.subscription];
        const customer =
          (emi.customer && customerMap[emi.customer]) ||
          (sub?.customer && customerMap[sub.customer]) ||
          null;

        const customerName =
          emi.customer_name ||
          sub?.customer_name ||
          customer?.name ||
          "Customer";

        const customerPhone =
          emi.customer_phone ||
          sub?.customer_phone ||
          customer?.phone ||
          "-";

        const productName =
          emi.product_name ||
          sub?.product_name ||
          "-";

        const batchCode =
          emi.batch_code ||
          sub?.batch_code ||
          "-";

        const luckyNumber =
          emi.lucky_number ??
          sub?.lucky_number ??
          null;

        return {
          id: emi.id,
          customer_label: `${customerName} (${customerPhone})`,
          subscription_label: `#${emi.subscription} • ${productName} • ${batchCode}${luckyNumber != null ? ` • Lucky #${luckyNumber}` : ""}`,
          month_label: `Month ${emi.month_no}`,
          due_date: emi.due_date,
          overdue_days: String(getOverdueDays(emi.due_date)),
          amount_label: formatCurrency(emi.amount),
          balance_label: formatCurrency(emi.balance_amount || emi.amount),
          status: emi.status,
        };
      });
  }, [overdueEmis, subscriptionMap, customerMap]);

  return (
    <PortalPage
      title="Overdue EMI Monitor"
      subtitle="Track overdue EMI obligations, aging exposure, and fastest collection priorities."
    >
      <section style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={() => router.push("/admin/emi")}>
          Back to EMI
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
        <div style={{ border: "1px solid #fecaca", borderRadius: 8, padding: 12, background: "#fef2f2" }}>
          Overdue EMI Count: <b>{kpis.overdueCount}</b>
        </div>
        <div style={{ border: "1px solid #fecaca", borderRadius: 8, padding: 12, background: "#fef2f2" }}>
          Overdue Exposure: <b>{formatCurrency(kpis.overdueAmount)}</b>
        </div>
        <div style={{ border: "1px solid #fecaca", borderRadius: 8, padding: 12, background: "#fef2f2" }}>
          Maximum Delay: <b>{kpis.maxDays}</b> days
        </div>
        <div style={{ border: "1px solid #fecaca", borderRadius: 8, padding: 12, background: "#fef2f2" }}>
          Severe Cases (30+ days): <b>{kpis.severeCount}</b>
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
        <h2 style={{ margin: 0 }}>Search</h2>
        <input
          placeholder="Customer, product, batch, lucky no, subscription..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </section>

      <DataTable<OverdueRow>
        loading={loading}
        error={error}
        rows={tableRows}
        columns={[
          { key: "id", title: "EMI ID" },
          { key: "customer_label", title: "Customer" },
          { key: "subscription_label", title: "Subscription" },
          { key: "month_label", title: "Month" },
          { key: "due_date", title: "Due Date" },
          { key: "overdue_days", title: "Overdue Days" },
          { key: "amount_label", title: "Amount" },
          { key: "balance_label", title: "Balance" },
          { key: "status", title: "Status" },
        ]}
      />

      {!loading && !error && overdueEmis.length > 0 ? (
        <section
          style={{
            marginTop: 16,
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <h2 style={{ marginTop: 0 }}>Priority Collection Queue</h2>

          <div style={{ display: "grid", gap: 10 }}>
            {overdueEmis
              .slice()
              .sort((a, b) => getOverdueDays(b.due_date) - getOverdueDays(a.due_date))
              .slice(0, 8)
              .map((emi) => (
                <div
                  key={emi.id}
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
                      <strong>EMI #{emi.id}</strong> — Subscription #{emi.subscription} — Month {emi.month_no}
                    </div>
                    <div style={{ color: "#4b5563" }}>
                      Due {emi.due_date} • {getOverdueDays(emi.due_date)} days overdue • {formatCurrency(emi.amount)}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => router.push(`/admin/subscriptions/${emi.subscription}`)}
                    >
                      View Subscription
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push(`/admin/payments/create?subscription=${emi.subscription}&emi=${emi.id}`)}
                    >
                      Collect Now
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </section>
      ) : null}
    </PortalPage>
  );
}