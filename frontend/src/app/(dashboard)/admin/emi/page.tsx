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

  // optional readable fields if serializer provides them
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
  monthly_amount: string;
  total_amount: string;
  plan_type: string;
};

type Customer = {
  id: number;
  name: string;
  phone: string;
};

type EmiRow = {
  id: number;
  customer_label: string;
  subscription_label: string;
  month_label: string;
  due_date: string;
  amount_label: string;
  paid_label: string;
  balance_label: string;
  status: string;
};

type Filters = {
  q: string;
  status: string;
  subscription: string;
};

const defaultFilters: Filters = {
  q: "",
  status: "",
  subscription: "",
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

function isPastDate(dateStr: string): boolean {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);

  return due < today;
}

export default function AdminEmiPage() {
  const router = useRouter();

  const [emis, setEmis] = useState<Emi[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [filters, setFilters] = useState<Filters>(defaultFilters);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAll(showRefreshing = false): Promise<void> {
    try {
      if (showRefreshing) setRefreshing(true);
      else setLoading(true);

      const [emiRes, subscriptionRes, customerRes] = await Promise.all([
        apiFetch("/admin/emis/"),
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

  const filteredEmis = useMemo(() => {
    const q = filters.q.trim().toLowerCase();

    return emis.filter((emi) => {
      if (filters.status && emi.status !== filters.status) return false;
      if (filters.subscription && String(emi.subscription) !== filters.subscription) return false;

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
        emi.due_date,
        emi.status,
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
  }, [emis, filters, subscriptionMap, customerMap]);

  const kpis = useMemo(() => {
    const totalEmis = filteredEmis.length;
    const pending = filteredEmis.filter((e) => e.status === "PENDING").length;
    const paid = filteredEmis.filter((e) => e.status === "PAID").length;
    const waived = filteredEmis.filter((e) => e.status === "WAIVED").length;
    const overdue = filteredEmis.filter((e) => e.status === "PENDING" && isPastDate(e.due_date)).length;

    const totalAmount = filteredEmis.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const pendingAmount = filteredEmis
      .filter((e) => e.status === "PENDING")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    return {
      totalEmis,
      pending,
      paid,
      waived,
      overdue,
      totalAmount,
      pendingAmount,
    };
  }, [filteredEmis]);

  const tableRows = useMemo<EmiRow[]>(() => {
    return filteredEmis.map((emi) => {
      const sub = subscriptionMap[emi.subscription];
      const customer =
        (emi.customer && customerMap[emi.customer]) ||
        (sub?.customer && customerMap[sub.customer]) ||
        null;

      const customerName =
        emi.customer_name ||
        sub?.customer_name ||
        customer?.name ||
        "Unknown";

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
        amount_label: formatCurrency(emi.amount),
        paid_label: formatCurrency(emi.total_paid),
        balance_label: formatCurrency(emi.balance_amount || emi.amount),
        status: emi.status,
      };
    });
  }, [filteredEmis, subscriptionMap, customerMap]);

  return (
    <PortalPage
      title="EMI Management"
      subtitle="Monitor EMI schedules, due status, collection exposure, and customer subscription obligations."
    >
      <section style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={() => loadAll(true)} disabled={refreshing}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
        <button type="button" onClick={() => router.push("/admin/emi/overdue")}>
          View Overdue EMI
        </button>
        <button type="button" onClick={() => router.push("/admin/payments")}>
          Open Payments
        </button>
        <button type="button" onClick={() => router.push("/admin/subscriptions")}>
          Open Subscriptions
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
          Total EMI Rows: <b>{kpis.totalEmis}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Pending EMI: <b>{kpis.pending}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Paid EMI: <b>{kpis.paid}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Waived EMI: <b>{kpis.waived}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Overdue EMI: <b>{kpis.overdue}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          EMI Book Value: <b>{formatCurrency(kpis.totalAmount)}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Pending Exposure: <b>{formatCurrency(kpis.pendingAmount)}</b>
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
            <label htmlFor="emi-search">Search</label>
            <input
              id="emi-search"
              placeholder="Customer, product, batch, lucky no, subscription..."
              value={filters.q}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  q: event.target.value,
                }))
              }
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="emi-status">Status</label>
            <select
              id="emi-status"
              value={filters.status}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  status: event.target.value,
                }))
              }
            >
              <option value="">All statuses</option>
              <option value="PENDING">PENDING</option>
              <option value="PAID">PAID</option>
              <option value="WAIVED">WAIVED</option>
            </select>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="emi-subscription">Subscription</label>
            <select
              id="emi-subscription"
              value={filters.subscription}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  subscription: event.target.value,
                }))
              }
            >
              <option value="">All subscriptions</option>
              {subscriptions
                .slice()
                .sort((a, b) => b.id - a.id)
                .map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    #{sub.id} - {sub.customer_name || `Customer ${sub.customer}`} - {sub.product_name || "Product"}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div>
          <button type="button" onClick={() => setFilters(defaultFilters)}>
            Reset Filters
          </button>
        </div>
      </section>

      <DataTable<EmiRow>
        loading={loading}
        error={error}
        rows={tableRows}
        columns={[
          { key: "id", title: "EMI ID" },
          { key: "customer_label", title: "Customer" },
          { key: "subscription_label", title: "Subscription" },
          { key: "month_label", title: "Month" },
          { key: "due_date", title: "Due Date" },
          { key: "amount_label", title: "Amount" },
          { key: "paid_label", title: "Paid" },
          { key: "balance_label", title: "Balance" },
          { key: "status", title: "Status" },
        ]}
      />

      {!loading && !error && filteredEmis.length > 0 ? (
        <section
          style={{
            marginTop: 16,
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <h2 style={{ marginTop: 0 }}>Quick Actions</h2>

          <div style={{ display: "grid", gap: 10 }}>
            {filteredEmis.slice(0, 8).map((emi) => (
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
                    Due {emi.due_date} • {formatCurrency(emi.amount)} • {emi.status}
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
                    Collect EMI
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