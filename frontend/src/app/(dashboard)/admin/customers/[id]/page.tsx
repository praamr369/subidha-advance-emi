"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import PortalPage from "@/components/ui/portal-page";
import { apiFetch, toArray } from "@/lib/api";

type Customer = {
  id: number;
  user?: number;
  user_username?: string;
  name: string;
  phone: string;
  kyc_status: string;
  created_at?: string;
};

type Subscription = {
  id: number;
  customer: number;
  customer_name?: string;
  product: number;
  product_name?: string;
  product_code?: string;
  batch: number | null;
  batch_code?: string;
  lucky_id: number | null;
  lucky_number?: number | null;
  partner: number | null;
  partner_name?: string;
  plan_type: string;
  tenure_months: number;
  monthly_amount: string;
  total_amount: string;
  status: string;
  start_date: string;
  emi_count?: number;
  paid_emi_count?: number;
  pending_emi_count?: number;
  waived_emi_count?: number;
};

type Payment = {
  id: number;
  customer: number;
  subscription: number;
  emi: number | null;
  emi_month_no?: number | null;
  amount: string;
  method: string;
  reference_no: string | null;
  payment_date: string;
  collected_by_username?: string | null;
  verified_by_username?: string | null;
};

type Emi = {
  id: number;
  subscription: number;
  customer?: number;
  customer_name?: string;
  customer_phone?: string;
  month_no: number;
  due_date: string;
  amount: string;
  status: string;
  total_paid?: string;
  balance_amount?: string;
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
  const amount = Number(value || 0);
  return `₹${amount.toFixed(2)}`;
}

export default function AdminCustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = String(params?.id || "");

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [emis, setEmis] = useState<Emi[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadAll(): Promise<void> {
    try {
      setLoading(true);

      const [customerRes, subscriptionRes, paymentRes, emiRes] = await Promise.all([
        apiFetch(`/admin/customers/${id}/`),
        apiFetch(`/admin/subscriptions/?customer=${encodeURIComponent(id)}`),
        apiFetch(`/admin/payments/?customer=${encodeURIComponent(id)}`),
        apiFetch("/admin/emis/"),
      ]);

      setCustomer(customerRes as Customer);
      setSubscriptions(toArray<Subscription>(subscriptionRes));
      setPayments(toArray<Payment>(paymentRes));
      setEmis(toArray<Emi>(emiRes));
      setError(null);
    } catch (e) {
      setError(parseError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) loadAll();
  }, [id]);

  const customerEmis = useMemo(() => {
    const subscriptionIds = new Set(subscriptions.map((s) => s.id));
    return emis.filter((item) => subscriptionIds.has(item.subscription));
  }, [subscriptions, emis]);

  const kpis = useMemo(() => {
    const totalSubscriptions = subscriptions.length;
    const activeSubscriptions = subscriptions.filter((s) => s.status === "ACTIVE").length;
    const totalPaid = payments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalContractValue = subscriptions.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const totalMonthlyValue = subscriptions.reduce((sum, item) => sum + Number(item.monthly_amount || 0), 0);
    const pendingEmis = customerEmis.filter((item) => item.status === "PENDING").length;
    const paidEmis = customerEmis.filter((item) => item.status === "PAID").length;

    return {
      totalSubscriptions,
      activeSubscriptions,
      totalPaid,
      totalContractValue,
      totalMonthlyValue,
      pendingEmis,
      paidEmis,
    };
  }, [subscriptions, payments, customerEmis]);

  return (
    <PortalPage
      title={customer ? `${customer.name} - Customer Profile` : "Customer Profile"}
      subtitle="Review profile information, subscription history, EMI obligations, and payment ledger for this customer."
    >
      <section style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={() => router.push("/admin/customers")}>
          Back to Customers
        </button>
        {customer ? (
          <>
            <button type="button" onClick={() => router.push(`/admin/subscriptions/create?customer=${customer.id}`)}>
              Create Subscription
            </button>
            <button type="button" onClick={() => router.push("/admin/payments")}>
              Open Payments
            </button>
          </>
        ) : null}
      </section>

      {loading ? <p>Loading customer profile...</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

      {!loading && !error && customer ? (
        <>
          <section
            style={{
              marginBottom: 16,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
              gap: 10,
            }}
          >
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
              Customer ID: <b>#{customer.id}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
              KYC Status: <b>{customer.kyc_status}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
              Total Subscriptions: <b>{kpis.totalSubscriptions}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
              Active Subscriptions: <b>{kpis.activeSubscriptions}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
              Total Paid: <b>{formatCurrency(kpis.totalPaid)}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
              Monthly Exposure: <b>{formatCurrency(kpis.totalMonthlyValue)}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
              Contract Value: <b>{formatCurrency(kpis.totalContractValue)}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
              Pending EMI Count: <b>{kpis.pendingEmis}</b>
            </div>
          </section>

          <section
            style={{
              marginBottom: 16,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
              gap: 16,
            }}
          >
            <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
              <h2 style={{ marginTop: 0 }}>Profile Information</h2>
              <p><strong>Name:</strong> {customer.name}</p>
              <p><strong>Phone:</strong> {customer.phone}</p>
              <p><strong>Username:</strong> {customer.user_username || "-"}</p>
              <p><strong>KYC:</strong> {customer.kyc_status}</p>
              <p><strong>Created:</strong> {customer.created_at ? customer.created_at.slice(0, 10) : "-"}</p>
            </section>

            <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
              <h2 style={{ marginTop: 0 }}>Collections Snapshot</h2>
              <p><strong>Total Paid:</strong> {formatCurrency(kpis.totalPaid)}</p>
              <p><strong>Paid EMI Count:</strong> {kpis.paidEmis}</p>
              <p><strong>Pending EMI Count:</strong> {kpis.pendingEmis}</p>
              <p><strong>Subscriptions:</strong> {kpis.totalSubscriptions}</p>
              <p><strong>Active Plans:</strong> {kpis.activeSubscriptions}</p>
            </section>
          </section>

          <section style={{ marginBottom: 16, border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>Subscription History</h2>

            {subscriptions.length === 0 ? (
              <p>No subscriptions found for this customer.</p>
            ) : (
              <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Product</th>
                    <th>Batch</th>
                    <th>Lucky ID</th>
                    <th>Plan</th>
                    <th>Tenure</th>
                    <th>Monthly</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((sub) => (
                    <tr key={sub.id}>
                      <td>#{sub.id}</td>
                      <td>{sub.product_name || "-"}</td>
                      <td>{sub.batch_code || "-"}</td>
                      <td>{sub.lucky_number != null ? `#${sub.lucky_number}` : "-"}</td>
                      <td>{sub.plan_type}</td>
                      <td>{sub.tenure_months}</td>
                      <td>{formatCurrency(sub.monthly_amount)}</td>
                      <td>{formatCurrency(sub.total_amount)}</td>
                      <td>{sub.status}</td>
                      <td>
                        <button type="button" onClick={() => router.push(`/admin/subscriptions/${sub.id}`)}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section style={{ marginBottom: 16, border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>EMI Payment Ledger</h2>

            {payments.length === 0 ? (
              <p>No payments recorded for this customer.</p>
            ) : (
              <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th>Payment ID</th>
                    <th>Subscription</th>
                    <th>EMI Month</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th>Date</th>
                    <th>Collected By</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>#{payment.id}</td>
                      <td>#{payment.subscription}</td>
                      <td>{payment.emi_month_no ?? "-"}</td>
                      <td>{formatCurrency(payment.amount)}</td>
                      <td>{payment.method}</td>
                      <td>{payment.reference_no || "-"}</td>
                      <td>{payment.payment_date}</td>
                      <td>{payment.collected_by_username || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>EMI Status Overview</h2>

            {customerEmis.length === 0 ? (
              <p>No EMI records found for this customer.</p>
            ) : (
              <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th>Subscription</th>
                    <th>Month</th>
                    <th>Due Date</th>
                    <th>Amount</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {customerEmis
                    .slice()
                    .sort((a, b) => {
                      if (a.subscription !== b.subscription) return a.subscription - b.subscription;
                      return a.month_no - b.month_no;
                    })
                    .map((emi) => (
                      <tr key={emi.id}>
                        <td>#{emi.subscription}</td>
                        <td>{emi.month_no}</td>
                        <td>{emi.due_date}</td>
                        <td>{formatCurrency(emi.amount)}</td>
                        <td>{formatCurrency(emi.total_paid)}</td>
                        <td>{formatCurrency(emi.balance_amount || emi.amount)}</td>
                        <td>{emi.status}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : null}
    </PortalPage>
  );
}