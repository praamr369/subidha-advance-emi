"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import PortalPage from "@/components/ui/PortalPage";
import DataTable from "@/components/ui/DataTable";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ErrorState from "@/components/feedback/ErrorState";
import EmptyState from "@/components/feedback/EmptyState";
import { apiFetch, toArray } from "@/lib/api";

type Partner = {
  id: number;
  username: string;
  email?: string;
  phone?: string;
  is_active: boolean;
  referred_customers: number;
  active_subscriptions: number;
  total_commission?: number | string;
  total_monthly_book: number;
  total_contract_value: number;
};

type PartnerRow = {
  id: number;
  username: string;
  phone: string;
  email: string;
  active_label: string;
  referred_customers: number;
  active_subscriptions: number;
  total_monthly_book: number;
  total_contract_value: number;
  total_commission: number;
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

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatCurrency(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function normalizePartner(item: unknown): Partner {
  const row = (item ?? {}) as Record<string, unknown>;

  return {
    id: toNumber(row.id),
    username: typeof row.username === "string" ? row.username : "",
    email: typeof row.email === "string" ? row.email : undefined,
    phone: typeof row.phone === "string" ? row.phone : undefined,
    is_active: row.is_active === true,
    referred_customers: toNumber(row.referred_customers, 0),
    active_subscriptions: toNumber(row.active_subscriptions, 0),
    total_commission: toNumber(row.total_commission, 0).toFixed(2),
    total_monthly_book: toNumber(row.total_monthly_book, 0),
    total_contract_value: toNumber(row.total_contract_value, 0),
  };
}

export default function AdminPartnersPage() {
  const router = useRouter();

  const [partners, setPartners] = useState<Partner[]>([]);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [sortBy, setSortBy] = useState<
    "username" | "monthly_book" | "contract_value" | "subscriptions"
  >("monthly_book");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    try {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const partnerRes = await apiFetch("/admin/partners/");
      const rows = toArray<unknown>(partnerRes).map(normalizePartner);

      setPartners(rows);
      setError(null);
    } catch (e) {
      setError(parseError(e));
      setPartners([]);
    } finally {
      if (mode === "initial") {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadAll("initial");
  }, [loadAll]);

  const filteredPartners = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const base = partners.filter((partner) => {
      if (activeFilter === "active" && !partner.is_active) return false;
      if (activeFilter === "inactive" && partner.is_active) return false;

      if (!needle) return true;

      const haystack = [
        String(partner.id),
        partner.username,
        partner.phone,
        partner.email,
        String(partner.referred_customers),
        String(partner.active_subscriptions),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });

    const sorted = [...base];

    sorted.sort((a, b) => {
      switch (sortBy) {
        case "username":
          return a.username.localeCompare(b.username);
        case "contract_value":
          return b.total_contract_value - a.total_contract_value;
        case "subscriptions":
          return b.active_subscriptions - a.active_subscriptions;
        case "monthly_book":
        default:
          return b.total_monthly_book - a.total_monthly_book;
      }
    });

    return sorted;
  }, [partners, query, activeFilter, sortBy]);

  const kpis = useMemo(() => {
    const totalPartners = filteredPartners.length;
    const activePartners = filteredPartners.filter((p) => p.is_active).length;
    const inactivePartners = filteredPartners.filter((p) => !p.is_active).length;

    const totalLinkedSubscriptions = filteredPartners.reduce(
      (sum, partner) => sum + partner.active_subscriptions,
      0
    );

    const totalMonthlyBook = filteredPartners.reduce(
      (sum, partner) => sum + partner.total_monthly_book,
      0
    );

    const totalContractValue = filteredPartners.reduce(
      (sum, partner) => sum + partner.total_contract_value,
      0
    );

    const totalReferredCustomers = filteredPartners.reduce(
      (sum, partner) => sum + partner.referred_customers,
      0
    );

    const totalCommission = filteredPartners.reduce(
      (sum, partner) => sum + toNumber(partner.total_commission, 0),
      0
    );

    return {
      totalPartners,
      activePartners,
      inactivePartners,
      totalLinkedSubscriptions,
      totalMonthlyBook,
      totalContractValue,
      totalReferredCustomers,
      totalCommission,
    };
  }, [filteredPartners]);

  const rows = useMemo<PartnerRow[]>(() => {
    return filteredPartners.map((partner) => ({
      id: partner.id,
      username: partner.username,
      phone: partner.phone || "—",
      email: partner.email || "—",
      active_label: partner.is_active ? "ACTIVE" : "INACTIVE",
      referred_customers: partner.referred_customers,
      active_subscriptions: partner.active_subscriptions,
      total_monthly_book: partner.total_monthly_book,
      total_contract_value: partner.total_contract_value,
      total_commission: toNumber(partner.total_commission, 0),
    }));
  }, [filteredPartners]);

  return (
    <PortalPage
      title="Partner Management"
      subtitle="Monitor partner productivity, customer acquisition, active subscriptions, collections workflow visibility, and commercial contribution."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Partners" },
      ]}
      actions={[
        {
          label: "Partner Commissions",
          href: "/admin/finance/commissions",
          variant: "secondary",
        },
        {
          label: "Collection Requests",
          href: "/admin/partners/collection-requests",
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Partners", value: kpis.totalPartners },
        { label: "Active", value: kpis.activePartners },
        { label: "Subscriptions", value: kpis.totalLinkedSubscriptions },
        { label: "Monthly Book", value: formatCurrency(kpis.totalMonthlyBook) },
      ]}
    >
      <div className="mb-4 flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => void loadAll("refresh")}
          disabled={refreshing}
          className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>

        <button
          type="button"
          onClick={() => router.push("/admin/finance/commissions")}
          className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
        >
          Open Partner Commissions
        </button>

        <button
          type="button"
          onClick={() => router.push("/admin/partners/collection-requests")}
          className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
        >
          Open Collection Requests
        </button>

        <button
          type="button"
          onClick={() => router.push("/admin/subscriptions")}
          className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
        >
          Open Subscriptions
        </button>
      </div>

      {loading ? <LoadingBlock label="Loading partners..." /> : null}

      {!loading && error ? (
        <ErrorState
          title="Unable to load partners"
          description={error}
          onRetry={() => void loadAll("initial")}
        />
      ) : null}

      {!loading && !error ? (
        <>
          <section className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Total Partners
              </div>
              <div className="mt-2 text-xl font-semibold text-card-foreground">
                {kpis.totalPartners}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Active Partners
              </div>
              <div className="mt-2 text-xl font-semibold text-card-foreground">
                {kpis.activePartners}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Inactive Partners
              </div>
              <div className="mt-2 text-xl font-semibold text-card-foreground">
                {kpis.inactivePartners}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Referred Customers
              </div>
              <div className="mt-2 text-xl font-semibold text-card-foreground">
                {kpis.totalReferredCustomers}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Active Subscriptions
              </div>
              <div className="mt-2 text-xl font-semibold text-card-foreground">
                {kpis.totalLinkedSubscriptions}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Monthly Book Value
              </div>
              <div className="mt-2 text-xl font-semibold text-card-foreground">
                {formatCurrency(kpis.totalMonthlyBook)}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Contract Value
              </div>
              <div className="mt-2 text-xl font-semibold text-card-foreground">
                {formatCurrency(kpis.totalContractValue)}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Commission Total
              </div>
              <div className="mt-2 text-xl font-semibold text-card-foreground">
                {formatCurrency(kpis.totalCommission)}
              </div>
            </div>
          </section>

          <section className="mb-4 rounded-xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-card-foreground">
              Filters
            </h2>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="grid gap-1.5">
                <label
                  htmlFor="partner-search"
                  className="text-sm font-medium text-foreground"
                >
                  Search
                </label>
                <input
                  id="partner-search"
                  placeholder="Username, phone, email, partner id..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div className="grid gap-1.5">
                <label
                  htmlFor="partner-active-filter"
                  className="text-sm font-medium text-foreground"
                >
                  Partner Status
                </label>
                <select
                  id="partner-active-filter"
                  value={activeFilter}
                  onChange={(event) => setActiveFilter(event.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">All</option>
                  <option value="active">Active only</option>
                  <option value="inactive">Inactive only</option>
                </select>
              </div>

              <div className="grid gap-1.5">
                <label
                  htmlFor="partner-sort"
                  className="text-sm font-medium text-foreground"
                >
                  Sort By
                </label>
                <select
                  id="partner-sort"
                  value={sortBy}
                  onChange={(event) =>
                    setSortBy(
                      event.target.value as
                        | "username"
                        | "monthly_book"
                        | "contract_value"
                        | "subscriptions"
                    )
                  }
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="monthly_book">Monthly Book</option>
                  <option value="contract_value">Contract Value</option>
                  <option value="subscriptions">Active Subscriptions</option>
                  <option value="username">Username</option>
                </select>
              </div>
            </div>

            <div className="mt-3">
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setActiveFilter("");
                  setSortBy("monthly_book");
                }}
                className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Reset Filters
              </button>
            </div>
          </section>

          {rows.length === 0 ? (
            <EmptyState
              title="No partners found"
              description="No partner records matched the current filter criteria."
            />
          ) : (
            <DataTable<PartnerRow>
              rows={rows}
              emptyText="No partners available."
              columns={[
                { key: "id", title: "Partner ID" },
                { key: "username", title: "Username" },
                { key: "phone", title: "Phone" },
                { key: "email", title: "Email" },
                { key: "active_label", title: "Status" },
                {
                  key: "referred_customers",
                  title: "Referred Customers",
                  align: "right",
                },
                {
                  key: "active_subscriptions",
                  title: "Active Subscriptions",
                  align: "right",
                },
                {
                  key: "total_monthly_book",
                  title: "Monthly Book",
                  align: "right",
                  render: (row) => formatCurrency(row.total_monthly_book),
                },
                {
                  key: "total_contract_value",
                  title: "Contract Value",
                  align: "right",
                  render: (row) => formatCurrency(row.total_contract_value),
                },
                {
                  key: "total_commission",
                  title: "Commission",
                  align: "right",
                  render: (row) => formatCurrency(row.total_commission),
                },
                {
                  key: "actions",
                  title: "Actions",
                  render: (row) => (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => router.push(`/admin/partners/${row.id}`)}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Access
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          router.push(`/admin/subscriptions?partner=${row.id}`)
                        }
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Subscriptions
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          router.push(
                            `/admin/finance/commissions?partner=${row.id}`
                          )
                        }
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Commissions
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          )}

          {!loading && !error && filteredPartners.length > 0 ? (
            <section className="mt-4 rounded-xl border border-border bg-card p-4 shadow-sm">
              <h2 className="mb-3 text-base font-semibold text-card-foreground">
                Quick Partner Actions
              </h2>

              <div className="grid gap-3">
                {filteredPartners.slice(0, 8).map((partner) => (
                  <div
                    key={partner.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-4"
                  >
                    <div>
                      <div className="font-semibold text-foreground">
                        {partner.username}{" "}
                        <span className="font-normal text-muted-foreground">
                          ({partner.phone || "No phone"})
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Active subscriptions: {partner.active_subscriptions} •
                        Referred customers: {partner.referred_customers} • Monthly
                        book: {formatCurrency(partner.total_monthly_book)}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => router.push(`/admin/partners/${partner.id}`)}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Access
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          router.push(`/admin/subscriptions?partner=${partner.id}`)
                        }
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        View Subscriptions
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          router.push(
                            `/admin/finance/commissions?partner=${partner.id}`
                          )
                        }
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        View Commissions
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </PortalPage>
  );
}
