"use client";

import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import PortalPage from "@/components/ui/portal-page";
import DataTable from "@/components/ui/DataTable";
import { apiFetch, toArray } from "@/lib/api";

type Payment = {
  id: number;
  customer: number;
  customer_name?: string;
  customer_phone?: string;
  subscription: number;
  subscription_status?: string;
  emi: number | null;
  emi_month_no?: number | null;
  batch?: number | null;
  batch_code?: string;
  lucky_number?: number | null;
  amount: string;
  method: string;
  reference_no: string | null;
  payment_date: string;
  collected_by?: number | null;
  collected_by_username?: string | null;
  verified_by?: number | null;
  verified_by_username?: string | null;
  created_at?: string;
};

type Customer = {
  id: number;
  name: string;
  phone: string;
  kyc_status: string;
};

type Subscription = {
  id: number;
  customer: number;
  customer_name?: string;
  customer_phone?: string;
  product: number;
  product_name?: string;
  batch: number | null;
  batch_code?: string;
  lucky_id: number | null;
  lucky_number?: number | null;
  plan_type: string;
  tenure_months: number;
  monthly_amount: string;
  total_amount: string;
  status: string;
  start_date: string;
};

type PaymentTableRow = {
  id: number;
  customer_label: string;
  subscription_label: string;
  emi_label: string;
  amount_label: string;
  method: string;
  reference_no: string;
  payment_date: string;
  collected_by: string;
  verified_by: string;
  status_label: string;
};

type Filters = {
  q: string;
  method: string;
  customer: string;
  subscription: string;
};

const defaultFilters: Filters = {
  q: "",
  method: "",
  customer: "",
  subscription: "",
};

function parseError(error: unknown): string {
  if (!(error instanceof Error)) return "Request failed";
  const raw = error.message?.trim() || "Request failed";

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const preferredKeys = [
      "detail",
      "amount",
      "emi",
      "subscription",
      "customer",
      "reference_no",
      "method",
      "non_field_errors",
    ];

    for (const key of preferredKeys) {
      const value = parsed[key];
      if (Array.isArray(value) && value[0]) return String(value[0]);
      if (typeof value === "string") return value;
    }

    const first = Object.values(parsed)[0];
    if (Array.isArray(first) && first[0]) return String(first[0]);
    if (typeof first === "string") return first;
  } catch {
    return raw;
  }

  return raw;
}

function formatCurrency(value: string | number | null | undefined): string {
  const amount = Number(value || 0);
  return `₹${amount.toFixed(2)}`;
}

export default function AdminPaymentsPage() {
  const router = useRouter();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);

  const [filters, setFilters] = useState<Filters>(defaultFilters);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function loadAll(showRefreshing = false): Promise<void> {
    try {
      if (showRefreshing) setRefreshing(true);
      else setLoading(true);

      const [paymentRes, customerRes, subscriptionRes] = await Promise.all([
        apiFetch("/admin/payments/"),
        apiFetch("/admin/customers/"),
        apiFetch("/admin/subscriptions/"),
      ]);

      setPayments(toArray<Payment>(paymentRes));
      setCustomers(toArray<Customer>(customerRes));
      setSubscriptions(toArray<Subscription>(subscriptionRes));
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

  const customerMap = useMemo(
    () => Object.fromEntries(customers.map((c) => [c.id, c])),
    [customers]
  );

  const subscriptionMap = useMemo(
    () => Object.fromEntries(subscriptions.map((s) => [s.id, s])),
    [subscriptions]
  );

  const customerOptions = useMemo(
    () =>
      customers
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({
          value: String(c.id),
          label: `${c.name} (${c.phone})`,
        })),
    [customers]
  );

  const subscriptionOptions = useMemo(
    () =>
      subscriptions
        .slice()
        .sort((a, b) => b.id - a.id)
        .map((s) => ({
          value: String(s.id),
          label: `#${s.id} - ${s.customer_name || customerMap[s.customer]?.name || `Customer ${s.customer}`} - ${s.product_name || `Product ${s.product}`}`,
        })),
    [subscriptions, customerMap]
  );

  const filteredPayments = useMemo(() => {
    const q = filters.q.trim().toLowerCase();

    return payments.filter((payment) => {
      if (filters.method && payment.method !== filters.method) return false;
      if (filters.customer && String(payment.customer) !== filters.customer) return false;
      if (filters.subscription && String(payment.subscription) !== filters.subscription) return false;

      if (!q) return true;

      const subscription = subscriptionMap[payment.subscription];
      const customer = customerMap[payment.customer];

      const haystack = [
        String(payment.id),
        payment.customer_name,
        payment.customer_phone,
        customer?.name,
        customer?.phone,
        String(payment.customer),
        String(payment.subscription),
        subscription?.product_name,
        subscription?.batch_code,
        payment.reference_no,
        payment.method,
        payment.collected_by_username,
        payment.verified_by_username,
        payment.payment_date,
        payment.emi_month_no ? `month ${payment.emi_month_no}` : "",
        payment.lucky_number != null ? String(payment.lucky_number) : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [payments, filters, subscriptionMap, customerMap]);

  const kpis = useMemo(() => {
    const totalPayments = filteredPayments.length;
    const totalAmount = filteredPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const cashAmount = filteredPayments
      .filter((item) => item.method === "CASH")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const upiAmount = filteredPayments
      .filter((item) => item.method === "UPI")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const bankAmount = filteredPayments
      .filter((item) => item.method === "BANK")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const today = new Date().toISOString().slice(0, 10);
    const todayCollections = filteredPayments
      .filter((item) => item.payment_date === today)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const verifiedCount = filteredPayments.filter((item) => Boolean(item.verified_by)).length;

    return {
      totalPayments,
      totalAmount,
      cashAmount,
      upiAmount,
      bankAmount,
      todayCollections,
      verifiedCount,
    };
  }, [filteredPayments]);

  const tableRows = useMemo<PaymentTableRow[]>(
    () =>
      filteredPayments.map((payment) => {
        const customer = customerMap[payment.customer];
        const subscription = subscriptionMap[payment.subscription];

        return {
          id: payment.id,
          customer_label:
            payment.customer_name && payment.customer_phone
              ? `${payment.customer_name} (${payment.customer_phone})`
              : customer
                ? `${customer.name} (${customer.phone})`
                : `Customer #${payment.customer}`,
          subscription_label: `#${payment.subscription}${subscription?.product_name ? ` - ${subscription.product_name}` : ""}${payment.batch_code ? ` - ${payment.batch_code}` : ""}`,
          emi_label:
            payment.emi != null
              ? `EMI #${payment.emi}${payment.emi_month_no ? ` (Month ${payment.emi_month_no})` : ""}`
              : "-",
          amount_label: formatCurrency(payment.amount),
          method: payment.method,
          reference_no: payment.reference_no || "-",
          payment_date: payment.payment_date,
          collected_by: payment.collected_by_username || "-",
          verified_by: payment.verified_by_username || "-",
          status_label: payment.subscription_status || subscription?.status || "-",
        };
      }),
    [filteredPayments, customerMap, subscriptionMap]
  );

  async function handleDeleteSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!deleteTarget) return;

    setDeleteError(null);
    setDeleting(true);

    try {
      await apiFetch(`/admin/payments/${deleteTarget.id}/`, {
        method: "DELETE",
      });

      setPayments((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      setDeleteError(parseError(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <PortalPage
      title="Payments Management"
      subtitle="Monitor all collections across subscriptions and customers, filter by payment channel, and drill into subscription-level payment workflows."
    >
      <section style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={() => router.push("/admin/payments/create")}>
          Create Payment
        </button>
        <button type="button" onClick={() => loadAll(true)} disabled={refreshing}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
        <button type="button" onClick={() => router.push("/admin/subscriptions")}>
          Go to Subscriptions
        </button>
        <button type="button" onClick={() => router.push("/admin/customers")}>
          Go to Customers
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
          Total Payments: <b>{kpis.totalPayments}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Total Collected: <b>{formatCurrency(kpis.totalAmount)}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Cash Collections: <b>{formatCurrency(kpis.cashAmount)}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          UPI Collections: <b>{formatCurrency(kpis.upiAmount)}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Bank Collections: <b>{formatCurrency(kpis.bankAmount)}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Today Collections: <b>{formatCurrency(kpis.todayCollections)}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Verified Payments: <b>{kpis.verifiedCount}</b>
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
            <label htmlFor="payment-search">Search</label>
            <input
              id="payment-search"
              placeholder="Search by customer, subscription, product, ref no, lucky no..."
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
            <label htmlFor="payment-method">Method</label>
            <select
              id="payment-method"
              value={filters.method}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  method: event.target.value,
                }))
              }
            >
              <option value="">All methods</option>
              <option value="CASH">CASH</option>
              <option value="UPI">UPI</option>
              <option value="BANK">BANK</option>
            </select>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="payment-customer">Customer</label>
            <select
              id="payment-customer"
              value={filters.customer}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  customer: event.target.value,
                  subscription: "",
                }))
              }
            >
              <option value="">All customers</option>
              {customerOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="payment-subscription">Subscription</label>
            <select
              id="payment-subscription"
              value={filters.subscription}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  subscription: event.target.value,
                }))
              }
            >
              <option value="">All subscriptions</option>
              {subscriptionOptions
                .filter((item) => {
                  if (!filters.customer) return true;
                  const sub = subscriptions.find((s) => String(s.id) === item.value);
                  return sub ? String(sub.customer) === filters.customer : true;
                })
                .map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setFilters(defaultFilters)}>
            Reset Filters
          </button>

          {filters.subscription ? (
            <button
              type="button"
              onClick={() => router.push(`/admin/payments/create?subscription=${filters.subscription}`)}
            >
              Create Payment for Selected Subscription
            </button>
          ) : null}
        </div>
      </section>

      {deleteTarget ? (
        <section
          style={{
            marginBottom: 16,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <h3 style={{ marginTop: 0, color: "#991b1b" }}>Delete Payment #{deleteTarget.id}</h3>
          <p style={{ marginTop: 0 }}>
            This will remove the payment record. Use only if this payment was created incorrectly.
          </p>

          <form onSubmit={handleDeleteSubmit} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" disabled={deleting}>
              {deleting ? "Deleting..." : "Confirm Delete"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteError(null);
              }}
            >
              Cancel
            </button>
          </form>

          {deleteError ? <p style={{ color: "#b91c1c", marginBottom: 0 }}>{deleteError}</p> : null}
        </section>
      ) : null}

      <DataTable<PaymentTableRow>
        loading={loading}
        error={error}
        rows={tableRows}
        columns={[
          { key: "id", title: "Payment ID" },
          { key: "customer_label", title: "Customer" },
          { key: "subscription_label", title: "Subscription" },
          { key: "emi_label", title: "EMI" },
          { key: "amount_label", title: "Amount" },
          { key: "method", title: "Method" },
          { key: "reference_no", title: "Reference" },
          { key: "payment_date", title: "Date" },
          { key: "collected_by", title: "Collected By" },
          { key: "verified_by", title: "Verified By" },
          { key: "status_label", title: "Subscription Status" },
        ]}
      />

      {!loading && !error && filteredPayments.length > 0 ? (
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
            {filteredPayments.slice(0, 8).map((payment) => (
              <div
                key={payment.id}
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
                    <strong>#{payment.id}</strong> — {payment.customer_name || customerMap[payment.customer]?.name || `Customer ${payment.customer}`}
                  </div>
                  <div style={{ color: "#4b5563" }}>
                    Subscription #{payment.subscription} • {formatCurrency(payment.amount)} • {payment.method} • {payment.payment_date}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => router.push(`/admin/subscriptions/${payment.subscription}`)}
                  >
                    View Subscription
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/admin/customers/${payment.customer}`)}
                  >
                    View Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/admin/payments/create?subscription=${payment.subscription}`)}
                  >
                    Add Another Payment
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteTarget(payment);
                      setDeleteError(null);
                    }}
                  >
                    Delete
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