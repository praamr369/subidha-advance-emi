"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import PortalPage from "@/components/ui/portal-page";
import DataTable from "@/components/ui/DataTable";
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

type Payment = {
  id: number;
  customer: number;
  amount: string;
  method: string;
  payment_date: string;
};

type CustomerRow = {
  id: number;
  name: string;
  phone: string;
  username: string;
  kyc_status: string;
  total_subscriptions: number;
  active_subscriptions: number;
  total_paid: string;
  created_at: string;
};

type Filters = {
  q: string;
  kyc_status: string;
};

const defaultFilters: Filters = {
  q: "",
  kyc_status: "",
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

export default function AdminCustomersPage() {
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const [filters, setFilters] = useState<Filters>(defaultFilters);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAll(showRefreshing = false): Promise<void> {
    try {
      if (showRefreshing) setRefreshing(true);
      else setLoading(true);

      const [customerRes, subscriptionRes, paymentRes] = await Promise.all([
        apiFetch("/admin/customers/"),
        apiFetch("/admin/subscriptions/"),
        apiFetch("/admin/payments/"),
      ]);

      setCustomers(toArray<Customer>(customerRes));
      setSubscriptions(toArray<Subscription>(subscriptionRes));
      setPayments(toArray<Payment>(paymentRes));
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

  const filteredCustomers = useMemo(() => {
    const q = filters.q.trim().toLowerCase();

    return customers.filter((customer) => {
      if (filters.kyc_status && customer.kyc_status !== filters.kyc_status) return false;

      if (!q) return true;

      const haystack = [
        String(customer.id),
        customer.name,
        customer.phone,
        customer.user_username,
        customer.kyc_status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [customers, filters]);

  const customerRows = useMemo<CustomerRow[]>(() => {
    return filteredCustomers.map((customer) => {
      const customerSubscriptions = subscriptions.filter((s) => s.customer === customer.id);
      const activeSubscriptions = customerSubscriptions.filter((s) => s.status === "ACTIVE");
      const customerPayments = payments.filter((p) => p.customer === customer.id);
      const totalPaid = customerPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0);

      return {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        username: customer.user_username || "-",
        kyc_status: customer.kyc_status,
        total_subscriptions: customerSubscriptions.length,
        active_subscriptions: activeSubscriptions.length,
        total_paid: formatCurrency(totalPaid),
        created_at: customer.created_at ? customer.created_at.slice(0, 10) : "-",
      };
    });
  }, [filteredCustomers, subscriptions, payments]);

  const kpis = useMemo(() => {
    const totalCustomers = filteredCustomers.length;
    const verifiedCount = filteredCustomers.filter((c) => c.kyc_status === "VERIFIED").length;
    const pendingKycCount = filteredCustomers.filter((c) => c.kyc_status === "PENDING").length;
    const rejectedKycCount = filteredCustomers.filter((c) => c.kyc_status === "REJECTED").length;

    const filteredCustomerIds = new Set(filteredCustomers.map((c) => c.id));
    const filteredSubscriptions = subscriptions.filter((s) => filteredCustomerIds.has(s.customer));
    const filteredPayments = payments.filter((p) => filteredCustomerIds.has(p.customer));

    const totalSubscriptions = filteredSubscriptions.length;
    const activeSubscriptions = filteredSubscriptions.filter((s) => s.status === "ACTIVE").length;
    const totalCollections = filteredPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    return {
      totalCustomers,
      verifiedCount,
      pendingKycCount,
      rejectedKycCount,
      totalSubscriptions,
      activeSubscriptions,
      totalCollections,
    };
  }, [filteredCustomers, subscriptions, payments]);

  return (
    <PortalPage
      title="Customer Management"
      subtitle="Search customers, monitor KYC, track subscription activity, and open detailed customer profiles."
    >
      <section style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={() => router.push("/admin/customers/create")}>
          Create Customer
        </button>
        <button type="button" onClick={() => loadAll(true)} disabled={refreshing}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
        <button type="button" onClick={() => router.push("/admin/subscriptions")}>
          Go to Subscriptions
        </button>
        <button type="button" onClick={() => router.push("/admin/payments")}>
          Go to Payments
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
          Total Customers: <b>{kpis.totalCustomers}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Verified KYC: <b>{kpis.verifiedCount}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Pending KYC: <b>{kpis.pendingKycCount}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Rejected KYC: <b>{kpis.rejectedKycCount}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Total Subscriptions: <b>{kpis.totalSubscriptions}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Active Subscriptions: <b>{kpis.activeSubscriptions}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Total Collections: <b>{formatCurrency(kpis.totalCollections)}</b>
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
            <label htmlFor="customer-search">Search</label>
            <input
              id="customer-search"
              placeholder="Search by name, phone, username, id..."
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
            <label htmlFor="kyc-status">KYC Status</label>
            <select
              id="kyc-status"
              value={filters.kyc_status}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  kyc_status: event.target.value,
                }))
              }
            >
              <option value="">All</option>
              <option value="PENDING">PENDING</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="REJECTED">REJECTED</option>
              <option value="NOT_PROVIDED">NOT_PROVIDED</option>
            </select>
          </div>
        </div>

        <div>
          <button type="button" onClick={() => setFilters(defaultFilters)}>
            Reset Filters
          </button>
        </div>
      </section>

      <DataTable<CustomerRow>
        loading={loading}
        error={error}
        rows={customerRows}
        columns={[
          { key: "id", title: "Customer ID" },
          { key: "name", title: "Name" },
          { key: "phone", title: "Phone" },
          { key: "username", title: "Username" },
          { key: "kyc_status", title: "KYC" },
          { key: "total_subscriptions", title: "Subscriptions" },
          { key: "active_subscriptions", title: "Active" },
          { key: "total_paid", title: "Total Paid" },
          { key: "created_at", title: "Created" },
        ]}
      />

      {!loading && !error && customerRows.length > 0 ? (
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
            {filteredCustomers.slice(0, 8).map((customer) => (
              <div
                key={customer.id}
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
                    <strong>{customer.name}</strong> ({customer.phone})
                  </div>
                  <div style={{ color: "#4b5563" }}>
                    KYC: {customer.kyc_status} • Username: {customer.user_username || "-"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => router.push(`/admin/customers/${customer.id}`)}>
                    View Profile
                  </button>
                  <button type="button" onClick={() => router.push(`/admin/subscriptions/create?customer=${customer.id}`)}>
                    Create Subscription
                  </button>
                  <button type="button" onClick={() => router.push("/admin/payments")}>
                    View Payments
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