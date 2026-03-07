"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import PortalPage from "@/components/ui/portal-page";
import DataTable from "@/components/ui/DataTable";
import { apiFetch, toArray } from "@/lib/api";

type Partner = {
  id: number;
  username: string;
  email?: string;
  phone?: string;
  is_active: boolean;
  referred_customers?: number;
  active_subscriptions?: number;
  total_commission?: number | string;
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
  monthly_amount: string;
  total_amount: string;
  status: string;
};

type PartnerRow = {
  id: number;
  username: string;
  phone: string;
  email: string;
  active_label: string;
  referred_customers_label: string;
  active_subscriptions_label: string;
  total_monthly_book_label: string;
  total_contract_value_label: string;
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

export default function AdminPartnersPage() {
  const router = useRouter();

  const [partners, setPartners] = useState<Partner[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);

  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAll(showRefreshing = false): Promise<void> {
    try {
      if (showRefreshing) setRefreshing(true);
      else setLoading(true);

      const [partnerRes, subscriptionRes] = await Promise.all([
        apiFetch("/admin/partners/"),
        apiFetch("/admin/subscriptions/"),
      ]);

      setPartners(toArray<Partner>(partnerRes));
      setSubscriptions(toArray<Subscription>(subscriptionRes));
      setError(null);
    } catch (e) {
      setError(parseError(e));
      setPartners([]);
      setSubscriptions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const partnerMetrics = useMemo(() => {
    const map = new Map<
      number,
      {
        referredCustomers: Set<number>;
        totalSubscriptions: number;
        activeSubscriptions: number;
        totalMonthlyBook: number;
        totalContractValue: number;
      }
    >();

    for (const sub of subscriptions) {
      if (!sub.partner) continue;

      if (!map.has(sub.partner)) {
        map.set(sub.partner, {
          referredCustomers: new Set<number>(),
          totalSubscriptions: 0,
          activeSubscriptions: 0,
          totalMonthlyBook: 0,
          totalContractValue: 0,
        });
      }

      const entry = map.get(sub.partner)!;
      entry.totalSubscriptions += 1;
      entry.referredCustomers.add(sub.customer);
      if (sub.status === "ACTIVE") entry.activeSubscriptions += 1;
      entry.totalMonthlyBook += Number(sub.monthly_amount || 0);
      entry.totalContractValue += Number(sub.total_amount || 0);
    }

    return map;
  }, [subscriptions]);

  const filteredPartners = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return partners.filter((partner) => {
      if (activeFilter === "active" && !partner.is_active) return false;
      if (activeFilter === "inactive" && partner.is_active) return false;

      if (!needle) return true;

      const metrics = partnerMetrics.get(partner.id);
      const haystack = [
        String(partner.id),
        partner.username,
        partner.phone,
        partner.email,
        metrics ? String(metrics.referredCustomers.size) : "",
        metrics ? String(metrics.activeSubscriptions) : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [partners, query, activeFilter, partnerMetrics]);

  const kpis = useMemo(() => {
    const totalPartners = filteredPartners.length;
    const activePartners = filteredPartners.filter((p) => p.is_active).length;
    const inactivePartners = filteredPartners.filter((p) => !p.is_active).length;

    let totalLinkedSubscriptions = 0;
    let totalMonthlyBook = 0;
    let totalContractValue = 0;
    const referredCustomers = new Set<number>();

    for (const partner of filteredPartners) {
      const metrics = partnerMetrics.get(partner.id);
      if (!metrics) continue;

      totalLinkedSubscriptions += metrics.totalSubscriptions;
      totalMonthlyBook += metrics.totalMonthlyBook;
      totalContractValue += metrics.totalContractValue;
      for (const customerId of metrics.referredCustomers) referredCustomers.add(customerId);
    }

    return {
      totalPartners,
      activePartners,
      inactivePartners,
      totalLinkedSubscriptions,
      totalMonthlyBook,
      totalContractValue,
      referredCustomers: referredCustomers.size,
    };
  }, [filteredPartners, partnerMetrics]);

  const rows = useMemo<PartnerRow[]>(() => {
    return filteredPartners.map((partner) => {
      const metrics = partnerMetrics.get(partner.id);

      return {
        id: partner.id,
        username: partner.username,
        phone: partner.phone || "-",
        email: partner.email || "-",
        active_label: partner.is_active ? "ACTIVE" : "INACTIVE",
        referred_customers_label: String(
          partner.referred_customers ?? metrics?.referredCustomers.size ?? 0
        ),
        active_subscriptions_label: String(
          partner.active_subscriptions ?? metrics?.activeSubscriptions ?? 0
        ),
        total_monthly_book_label: formatCurrency(metrics?.totalMonthlyBook || 0),
        total_contract_value_label: formatCurrency(metrics?.totalContractValue || 0),
      };
    });
  }, [filteredPartners, partnerMetrics]);

  return (
    <PortalPage
      title="Partner Management"
      subtitle="Monitor partner productivity, customer acquisition, linked subscriptions, and business contribution."
    >
      <section style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={() => loadAll(true)} disabled={refreshing}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
        <button type="button" onClick={() => router.push("/admin/partners/commissions")}>
          Open Partner Commissions
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
          Total Partners: <b>{kpis.totalPartners}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Active Partners: <b>{kpis.activePartners}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Inactive Partners: <b>{kpis.inactivePartners}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Referred Customers: <b>{kpis.referredCustomers}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Linked Subscriptions: <b>{kpis.totalLinkedSubscriptions}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Monthly Book Value: <b>{formatCurrency(kpis.totalMonthlyBook)}</b>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
          Contract Value: <b>{formatCurrency(kpis.totalContractValue)}</b>
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
            <label htmlFor="partner-search">Search</label>
            <input
              id="partner-search"
              placeholder="Username, phone, email..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="partner-active-filter">Partner Status</label>
            <select
              id="partner-active-filter"
              value={activeFilter}
              onChange={(event) => setActiveFilter(event.target.value)}
            >
              <option value="">All</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setActiveFilter("");
            }}
          >
            Reset Filters
          </button>
        </div>
      </section>

      <DataTable<PartnerRow>
        loading={loading}
        error={error}
        rows={rows}
        columns={[
          { key: "id", title: "Partner ID" },
          { key: "username", title: "Username" },
          { key: "phone", title: "Phone" },
          { key: "email", title: "Email" },
          { key: "active_label", title: "Status" },
          { key: "referred_customers_label", title: "Referred Customers" },
          { key: "active_subscriptions_label", title: "Active Subscriptions" },
          { key: "total_monthly_book_label", title: "Monthly Book" },
          { key: "total_contract_value_label", title: "Contract Value" },
        ]}
      />

      {!loading && !error && filteredPartners.length > 0 ? (
        <section
          style={{
            marginTop: 16,
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <h2 style={{ marginTop: 0 }}>Quick Partner Actions</h2>

          <div style={{ display: "grid", gap: 10 }}>
            {filteredPartners.slice(0, 8).map((partner) => {
              const metrics = partnerMetrics.get(partner.id);

              return (
                <div
                  key={partner.id}
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
                      <strong>{partner.username}</strong> ({partner.phone || "No phone"})
                    </div>
                    <div style={{ color: "#4b5563" }}>
                      Active subscriptions: {metrics?.activeSubscriptions || 0} • Referred customers:{" "}
                      {metrics?.referredCustomers.size || 0} • Monthly book:{" "}
                      {formatCurrency(metrics?.totalMonthlyBook || 0)}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/admin/subscriptions?partner=${partner.id}`)
                      }
                    >
                      View Subscriptions
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/admin/partners/commissions?partner=${partner.id}`)
                      }
                    >
                      View Commissions
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </PortalPage>
  );
}