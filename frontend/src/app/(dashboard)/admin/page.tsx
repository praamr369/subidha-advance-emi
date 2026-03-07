"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import PortalPage from "@/components/ui/portal-page";
import { apiFetch, toArray } from "@/lib/api";

type Batch = {
  id: number;
  batch_code: string;
  status: string;
  duration_months: number;
  total_slots: number;
  draw_day?: number;
  start_date?: string;
};

type Subscription = {
  id: number;
  customer: number;
  customer_name?: string;
  customer_phone?: string;
  product_name?: string;
  partner: number | null;
  partner_name?: string;
  batch: number | null;
  batch_code?: string;
  lucky_id: number | null;
  lucky_number?: number | null;
  plan_type: string;
  tenure_months: number;
  start_date: string;
  total_amount: string;
  monthly_amount: string;
  status: string;
  waived_amount?: string;
  winner_month?: number | null;
};

type Payment = {
  id: number;
  customer: number;
  customer_name?: string;
  customer_phone?: string;
  subscription: number;
  emi?: number | null;
  amount: string;
  method: string;
  payment_date: string;
  collected_by?: number | null;
  verified_by?: number | null;
};

type Emi = {
  id: number;
  subscription: number;
  month_no: number;
  due_date: string;
  amount: string;
  status: string;
  balance_amount?: string;
};

type Customer = {
  id: number;
  name: string;
  phone: string;
  kyc_status: string;
};

type Partner = {
  id: number;
  username: string;
  phone?: string;
  is_active?: boolean;
};

type LuckyDraw = {
  id: number;
  batch: number;
  draw_month: number;
  is_revealed: boolean;
  winner_lucky_id?: number | null;
  winner_lucky_number?: number | null;
  draw_date?: string | null;
};

type SubscriptionKpis = {
  total_subscriptions?: number;
  active_subscriptions?: number;
  won_subscriptions?: number;
  completed_subscriptions?: number;
  defaulted_subscriptions?: number;
  emi_count?: number;
  rent_count?: number;
  lease_count?: number;
  total_contract_value?: string;
  total_monthly_value?: string;
  total_waived_value?: string;
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

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString();
}

export default function AdminDashboardPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [emis, setEmis] = useState<Emi[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [draws, setDraws] = useState<LuckyDraw[]>([]);
  const [subscriptionKpis, setSubscriptionKpis] = useState<SubscriptionKpis>({});

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadDashboard(showRefreshing = false): Promise<void> {
    try {
      if (showRefreshing) setRefreshing(true);
      else setLoading(true);

      const [
        batchRes,
        subscriptionRes,
        paymentRes,
        emiRes,
        customerRes,
        partnerRes,
        drawRes,
        subscriptionKpiRes,
      ] = await Promise.all([
        apiFetch("/admin/batches/"),
        apiFetch("/admin/subscriptions/"),
        apiFetch("/admin/payments/"),
        apiFetch("/admin/emis/"),
        apiFetch("/admin/customers/"),
        apiFetch("/admin/partners/"),
        apiFetch("/admin/lucky-draws/"),
        apiFetch("/admin/subscriptions/kpis/"),
      ]);

      setBatches(toArray<Batch>(batchRes));
      setSubscriptions(toArray<Subscription>(subscriptionRes));
      setPayments(toArray<Payment>(paymentRes));
      setEmis(toArray<Emi>(emiRes));
      setCustomers(toArray<Customer>(customerRes));
      setPartners(toArray<Partner>(partnerRes));
      setDraws(toArray<LuckyDraw>(drawRes));
      setSubscriptionKpis((subscriptionKpiRes as SubscriptionKpis) || {});
      setError(null);
    } catch (e) {
      setError(parseError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const summary = useMemo(() => {
    const totalCustomers = customers.length;
    const verifiedCustomers = customers.filter((c) => c.kyc_status === "VERIFIED").length;

    const totalPartners = partners.length;
    const activePartners = partners.filter((p) => p.is_active !== false).length;

    const totalPayments = payments.length;
    const totalCollections = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const totalEmis = emis.length;
    const pendingEmis = emis.filter((e) => e.status === "PENDING").length;
    const paidEmis = emis.filter((e) => e.status === "PAID").length;
    const waivedEmis = emis.filter((e) => e.status === "WAIVED").length;
    const overdueEmis = emis.filter((e) => e.status === "PENDING" && isPastDate(e.due_date)).length;

    const totalBatches = batches.length;
    const openBatches = batches.filter((b) => b.status === "OPEN").length;
    const draftBatches = batches.filter((b) => b.status === "DRAFT").length;
    const closedBatches = batches.filter((b) =>
      ["CLOSED", "COMPLETED", "FULL", "DRAW_IN_PROGRESS"].includes(b.status)
    ).length;

    const activeSubscriptions =
      Number(subscriptionKpis.active_subscriptions || 0) ||
      subscriptions.filter((s) => s.status === "ACTIVE").length;

    const totalSubscriptions =
      Number(subscriptionKpis.total_subscriptions || 0) || subscriptions.length;

    const wonSubscriptions =
      Number(subscriptionKpis.won_subscriptions || 0) ||
      subscriptions.filter((s) => s.status === "WON").length;

    const completedSubscriptions =
      Number(subscriptionKpis.completed_subscriptions || 0) ||
      subscriptions.filter((s) => s.status === "COMPLETED").length;

    const defaultedSubscriptions =
      Number(subscriptionKpis.defaulted_subscriptions || 0) ||
      subscriptions.filter((s) => s.status === "DEFAULTED").length;

    const totalContractValue =
      Number(subscriptionKpis.total_contract_value || 0) ||
      subscriptions.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);

    const totalMonthlyValue =
      Number(subscriptionKpis.total_monthly_value || 0) ||
      subscriptions.reduce((sum, s) => sum + Number(s.monthly_amount || 0), 0);

    const totalWaivedValue =
      Number(subscriptionKpis.total_waived_value || 0) ||
      subscriptions.reduce((sum, s) => sum + Number(s.waived_amount || 0), 0);

    const totalDraws = draws.length;
    const revealedDraws = draws.filter((d) => d.is_revealed).length;
    const committedDraws = draws.filter((d) => !d.is_revealed).length;

    return {
      totalCustomers,
      verifiedCustomers,
      totalPartners,
      activePartners,
      totalPayments,
      totalCollections,
      totalEmis,
      pendingEmis,
      paidEmis,
      waivedEmis,
      overdueEmis,
      totalBatches,
      openBatches,
      draftBatches,
      closedBatches,
      totalSubscriptions,
      activeSubscriptions,
      wonSubscriptions,
      completedSubscriptions,
      defaultedSubscriptions,
      totalContractValue,
      totalMonthlyValue,
      totalWaivedValue,
      totalDraws,
      revealedDraws,
      committedDraws,
    };
  }, [customers, partners, payments, emis, batches, subscriptions, draws, subscriptionKpis]);

  const recentPayments = useMemo(() => {
    return payments
      .slice()
      .sort((a, b) => {
        const dateCompare = new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime();
        if (dateCompare !== 0) return dateCompare;
        return b.id - a.id;
      })
      .slice(0, 8);
  }, [payments]);

  const recentSubscriptions = useMemo(() => {
    return subscriptions.slice().sort((a, b) => b.id - a.id).slice(0, 8);
  }, [subscriptions]);

  const overdueList = useMemo(() => {
    return emis
      .filter((e) => e.status === "PENDING" && isPastDate(e.due_date))
      .slice()
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
      .slice(0, 8);
  }, [emis]);

  const openBatchList = useMemo(() => {
    return batches.filter((b) => b.status === "OPEN").slice(0, 6);
  }, [batches]);

  const pendingDraws = useMemo(() => {
    return draws
      .filter((d) => !d.is_revealed)
      .slice()
      .sort((a, b) => a.draw_month - b.draw_month)
      .slice(0, 6);
  }, [draws]);

  return (
    <PortalPage
      title="Admin Dashboard"
      subtitle="Executive control center for subscriptions, EMI collections, batches, draws, customers, and partner operations."
    >
      <section style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={() => loadDashboard(true)} disabled={refreshing}>
          {refreshing ? "Refreshing..." : "Refresh Dashboard"}
        </button>

        <Link href="/admin/subscriptions/create">Create Subscription</Link>
        <Link href="/admin/payments/create">Collect Payment</Link>
        <Link href="/admin/customers/create">Create Customer</Link>
        <Link href="/admin/batches/create">Create Batch</Link>
      </section>

      {loading ? <p>Loading dashboard...</p> : null}
      {error ? <p style={{ color: "#b91c1c", fontWeight: 600 }}>{error}</p> : null}

      {!loading && !error ? (
        <>
          <section
            style={{
              marginBottom: 18,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
              gap: 10,
            }}
          >
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              Total Customers: <b>{summary.totalCustomers}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              Verified KYC: <b>{summary.verifiedCustomers}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              Total Partners: <b>{summary.totalPartners}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              Active Partners: <b>{summary.activePartners}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              Total Subscriptions: <b>{summary.totalSubscriptions}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              Active Subscriptions: <b>{summary.activeSubscriptions}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              Won Subscriptions: <b>{summary.wonSubscriptions}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              Defaulted Subscriptions: <b>{summary.defaultedSubscriptions}</b>
            </div>
          </section>

          <section
            style={{
              marginBottom: 18,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
              gap: 10,
            }}
          >
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              Contract Value: <b>{formatCurrency(summary.totalContractValue)}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              Monthly Book Value: <b>{formatCurrency(summary.totalMonthlyValue)}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              Total Collections: <b>{formatCurrency(summary.totalCollections)}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              Waived Value: <b>{formatCurrency(summary.totalWaivedValue)}</b>
            </div>
            <div style={{ border: "1px solid #fee2e2", borderRadius: 10, padding: 14, background: "#fff7f7" }}>
              Overdue EMI Count: <b>{summary.overdueEmis}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              Pending EMI Count: <b>{summary.pendingEmis}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              Paid EMI Count: <b>{summary.paidEmis}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              Waived EMI Count: <b>{summary.waivedEmis}</b>
            </div>
          </section>

          <section
            style={{
              marginBottom: 18,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
              gap: 10,
            }}
          >
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              Total Batches: <b>{summary.totalBatches}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              Open Batches: <b>{summary.openBatches}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              Draft Batches: <b>{summary.draftBatches}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              Closed / Matured Batches: <b>{summary.closedBatches}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              Draw Records: <b>{summary.totalDraws}</b>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
              Revealed Draws: <b>{summary.revealedDraws}</b>
            </div>
            <div style={{ border: "1px solid #fef3c7", borderRadius: 10, padding: 14, background: "#fffbeb" }}>
              Pending Commit / Reveal: <b>{summary.committedDraws}</b>
            </div>
          </section>

          <section
            style={{
              marginBottom: 18,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
              gap: 16,
            }}
          >
            <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
              <h2 style={{ marginTop: 0 }}>Quick Navigation</h2>
              <div style={{ display: "grid", gap: 8 }}>
                <Link href="/admin/subscriptions">Subscription Management</Link>
                <Link href="/admin/payments">Payment Management</Link>
                <Link href="/admin/emi">EMI Management</Link>
                <Link href="/admin/emi/overdue">Overdue EMI Monitor</Link>
                <Link href="/admin/customers">Customer Management</Link>
                <Link href="/admin/batches">Batch Management</Link>
                <Link href="/admin/lucky-draw">Lucky Draw Operations</Link>
                <Link href="/admin/partners">Partner Management</Link>
                <Link href="/admin/partners/commissions">Partner Commissions</Link>
                <Link href="/admin/reports">Reports</Link>
              </div>
            </section>

            <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
              <h2 style={{ marginTop: 0 }}>Operational Priorities</h2>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
                  <strong>Overdue Collections</strong>
                  <p style={{ marginBottom: 8 }}>
                    {summary.overdueEmis} EMI rows require immediate follow-up.
                  </p>
                  <Link href="/admin/emi/overdue">Open overdue queue</Link>
                </div>

                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
                  <strong>Pending Draw Actions</strong>
                  <p style={{ marginBottom: 8 }}>
                    {summary.committedDraws} draw records are committed but not revealed.
                  </p>
                  <Link href="/admin/batches">Open batch controls</Link>
                </div>

                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
                  <strong>Growth Operations</strong>
                  <p style={{ marginBottom: 8 }}>
                    {summary.openBatches} open batches available for new subscriptions.
                  </p>
                  <Link href="/admin/subscriptions/create">Create subscription</Link>
                </div>
              </div>
            </section>
          </section>

          <section
            style={{
              marginBottom: 18,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(420px,1fr))",
              gap: 16,
            }}
          >
            <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <h2 style={{ marginTop: 0, marginBottom: 12 }}>Recent Subscriptions</h2>
                <Link href="/admin/subscriptions">View all</Link>
              </div>

              <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Customer</th>
                    <th>Product</th>
                    <th>Batch</th>
                    <th>Lucky</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSubscriptions.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center" }}>
                        No subscriptions found.
                      </td>
                    </tr>
                  ) : (
                    recentSubscriptions.map((sub) => (
                      <tr key={sub.id}>
                        <td>
                          <Link href={`/admin/subscriptions/${sub.id}`}>#{sub.id}</Link>
                        </td>
                        <td>{sub.customer_name || `Customer ${sub.customer}`}</td>
                        <td>{sub.product_name || "-"}</td>
                        <td>{sub.batch_code || "-"}</td>
                        <td>{sub.lucky_number != null ? `#${sub.lucky_number}` : "-"}</td>
                        <td>{sub.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>

            <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <h2 style={{ marginTop: 0, marginBottom: 12 }}>Recent Collections</h2>
                <Link href="/admin/payments">View all</Link>
              </div>

              <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Subscription</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center" }}>
                        No payments found.
                      </td>
                    </tr>
                  ) : (
                    recentPayments.map((payment) => (
                      <tr key={payment.id}>
                        <td>#{payment.id}</td>
                        <td>
                          <Link href={`/admin/subscriptions/${payment.subscription}`}>
                            #{payment.subscription}
                          </Link>
                        </td>
                        <td>{formatCurrency(payment.amount)}</td>
                        <td>{payment.method}</td>
                        <td>{formatDate(payment.payment_date)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          </section>

          <section
            style={{
              marginBottom: 18,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(420px,1fr))",
              gap: 16,
            }}
          >
            <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <h2 style={{ marginTop: 0, marginBottom: 12 }}>Overdue EMI Queue</h2>
                <Link href="/admin/emi/overdue">View all</Link>
              </div>

              <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th>EMI ID</th>
                    <th>Subscription</th>
                    <th>Month</th>
                    <th>Due Date</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueList.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center" }}>
                        No overdue EMI rows.
                      </td>
                    </tr>
                  ) : (
                    overdueList.map((emi) => (
                      <tr key={emi.id}>
                        <td>#{emi.id}</td>
                        <td>
                          <Link href={`/admin/subscriptions/${emi.subscription}`}>
                            #{emi.subscription}
                          </Link>
                        </td>
                        <td>{emi.month_no}</td>
                        <td>{formatDate(emi.due_date)}</td>
                        <td>{formatCurrency(emi.amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>

            <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <h2 style={{ marginTop: 0, marginBottom: 12 }}>Open Batch Watchlist</h2>
                <Link href="/admin/batches">View all</Link>
              </div>

              <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Status</th>
                    <th>Slots</th>
                    <th>Duration</th>
                    <th>Draw Day</th>
                  </tr>
                </thead>
                <tbody>
                  {openBatchList.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center" }}>
                        No open batches found.
                      </td>
                    </tr>
                  ) : (
                    openBatchList.map((batch) => (
                      <tr key={batch.id}>
                        <td>
                          <Link href={`/admin/batches/${batch.id}`}>{batch.batch_code}</Link>
                        </td>
                        <td>{batch.status}</td>
                        <td>{batch.total_slots}</td>
                        <td>{batch.duration_months}</td>
                        <td>{batch.draw_day ?? "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          </section>

          <section
            style={{
              marginBottom: 18,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(420px,1fr))",
              gap: 16,
            }}
          >
            <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <h2 style={{ marginTop: 0, marginBottom: 12 }}>Pending Draw Reveals</h2>
                <Link href="/admin/batches">Open batch controls</Link>
              </div>

              <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Month</th>
                    <th>Status</th>
                    <th>Draw Date</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingDraws.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center" }}>
                        No pending draw reveals.
                      </td>
                    </tr>
                  ) : (
                    pendingDraws.map((draw) => {
                      const batch = batches.find((b) => b.id === draw.batch);
                      return (
                        <tr key={draw.id}>
                          <td>
                            {batch ? (
                              <Link href={`/admin/batches/${batch.id}`}>{batch.batch_code}</Link>
                            ) : (
                              `Batch ${draw.batch}`
                            )}
                          </td>
                          <td>{draw.draw_month}</td>
                          <td>COMMITTED</td>
                          <td>{formatDate(draw.draw_date)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </section>

            <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
              <h2 style={{ marginTop: 0 }}>System Health Snapshot</h2>

              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
                  <strong>Customer KYC Readiness</strong>
                  <p style={{ margin: "8px 0 0 0" }}>
                    {summary.verifiedCustomers} of {summary.totalCustomers} customers are verified.
                  </p>
                </div>

                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
                  <strong>Collection Health</strong>
                  <p style={{ margin: "8px 0 0 0" }}>
                    {summary.paidEmis} EMI rows are paid, with {summary.overdueEmis} overdue rows needing action.
                  </p>
                </div>

                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
                  <strong>Batch Readiness</strong>
                  <p style={{ margin: "8px 0 0 0" }}>
                    {summary.openBatches} open batches are available for ongoing subscription intake.
                  </p>
                </div>

                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
                  <strong>Draw Governance</strong>
                  <p style={{ margin: "8px 0 0 0" }}>
                    {summary.committedDraws} committed draws still need reveal action and winner finalization.
                  </p>
                </div>
              </div>
            </section>
          </section>
        </>
      ) : null}
    </PortalPage>
  );
}