"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import CustomerProductSummaryCard from "@/domains/subscriptions/components/CustomerProductSummaryCard";
import {
  getCustomerProfile,
  updateCustomerProfile,
  type CustomerProfileResponse,
} from "@/services/customer";
import { listCustomerSubscriptionsRegister } from "@/services/customer/paginated-subscriptions";

function money(value: string | number): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    const raw = error.message.trim();
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.detail === "string" && parsed.detail.trim()) {
        return parsed.detail;
      }
      for (const [field, value] of Object.entries(parsed)) {
        if (Array.isArray(value) && value.length > 0) {
          return `${field}: ${String(value[0])}`;
        }
        if (typeof value === "string" && value.trim()) {
          return `${field}: ${value}`;
        }
      }
    } catch {
      return raw;
    }
    return raw;
  }
  return "Failed to load customer profile.";
}

export default function CustomerProfilePage() {
  const [data, setData] = useState<CustomerProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [productRows, setProductRows] = useState<Awaited<
    ReturnType<typeof listCustomerSubscriptionsRegister>
  >["results"]>([]);
  const [productError, setProductError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");

  function hydrate(payload: CustomerProfileResponse) {
    setData(payload);
    setName(payload.name);
    setPhone(payload.phone);
    setEmail(payload.email || "");
    setAddress(payload.address || "");
    setCity(payload.city || "");
  }

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const [profileResult, subscriptionsResult] = await Promise.allSettled([
        getCustomerProfile(),
        listCustomerSubscriptionsRegister({ page: 1, pageSize: 4 }),
      ]);

      if (profileResult.status === "rejected") {
        throw profileResult.reason;
      }

      hydrate(profileResult.value);
      setError(null);

      if (subscriptionsResult.status === "fulfilled") {
        setProductRows(subscriptionsResult.value.results);
        setProductError(null);
      } else {
        setProductRows([]);
        setProductError("Product summaries are temporarily unavailable.");
      }
    } catch (err) {
      setError(toErrorMessage(err));
      setData(null);
      setProductRows([]);
      setProductError(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const stats = useMemo(() => {
    if (!data) return null;
    return [
      {
        label: "Total Subscriptions",
        value: String(data.summary.total_subscriptions ?? 0),
        subtext: "All-time subscriptions",
      },
      {
        label: "Active",
        value: String(data.summary.active_subscriptions ?? 0),
        subtext: "Live contracts",
      },
      {
        label: "Won",
        value: String(data.summary.won_subscriptions ?? 0),
        subtext: "Lucky draw winners",
      },
      {
        label: "Total Paid",
        value: money(data.summary.total_paid_amount ?? 0),
        subtext: "Total collected amount",
      },
    ];
  }, [data]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);

    try {
      const payload = await updateCustomerProfile({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        city: city.trim(),
      });
      hydrate(payload);
      setSuccess("Profile updated successfully.");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PortalPage
      title="Profile"
      subtitle="Your account identity and operational status for Lucky Plan."
      breadcrumbs={[{ label: "Customer", href: "/customer" }, { label: "Profile" }]}
    >
      {loading ? <LoadingBlock label="Loading profile..." /> : null}

      {!loading && error && !data ? (
        <ErrorState
          title="Unable to load profile"
          description={error}
          onRetry={loadPage}
        />
      ) : null}

      {!loading && !error && data ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Username
                </div>
                <div className="mt-1 text-sm font-medium text-foreground">
                  {data.username}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  KYC Status
                </div>
                <div className="mt-1 text-sm font-medium text-foreground">
                  {data.kyc_status}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Email
                </div>
                <div className="mt-1 text-sm font-medium text-foreground">
                  {data.email || "Add email to enable password reset"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  City
                </div>
                <div className="mt-1 text-sm font-medium text-foreground">
                  {data.city || "—"}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-foreground">
                Account details
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Keep your profile current. Email is required for self-service password reset.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="customer-name">
                    Name
                  </label>
                  <input
                    id="customer-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="customer-phone">
                    Phone
                  </label>
                  <input
                    id="customer-phone"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="customer-email">
                    Email
                  </label>
                  <input
                    id="customer-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="customer-city">
                    City
                  </label>
                  <input
                    id="customer-city"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="customer-address">
                  Address
                </label>
                <textarea
                  id="customer-address"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  className="min-h-28 w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-ring"
                />
              </div>

              {error ? (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              {success ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  {success}
                </div>
              ) : null}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save profile"}
                </button>
              </div>
            </form>
          </section>

          <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div>
              <h2 className="text-base font-semibold text-foreground">My Products</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Product image, batch, lucky number, and winner or waiver context come directly from your linked subscriptions.
              </p>
            </div>

            {productError ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {productError}
              </div>
            ) : null}

            {productRows.length > 0 ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {productRows.map((subscription) => (
                  <CustomerProductSummaryCard
                    key={subscription.id}
                    subscription={subscription}
                    href={`/customer/subscriptions/${subscription.id}`}
                    compact
                  />
                ))}
              </div>
            ) : !productError ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                No subscription-linked products are available yet.
              </div>
            ) : null}
          </section>

          {stats ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {stats.map((card) => (
                <StatCard
                  key={card.label}
                  label={card.label}
                  value={card.value}
                  subtext={card.subtext}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No profile summary available"
              description="The profile endpoint returned no summary metrics."
            />
          )}
        </div>
      ) : null}
    </PortalPage>
  );
}
