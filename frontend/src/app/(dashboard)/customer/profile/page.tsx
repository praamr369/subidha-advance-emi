"use client";

import { useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import { getCustomerProfile } from "@/services/customer";

function money(value: string | number): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Failed to load customer profile.";
}

export default function CustomerProfilePage() {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof getCustomerProfile>
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadPage() {
    setLoading(true);
    try {
      const payload = await getCustomerProfile();
      setData(payload);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, []);

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

  return (
    <PortalPage
      title="Profile"
      subtitle="Your account identity and operational status for Lucky Plan."
      breadcrumbs={[{ label: "Customer", href: "/customer" }, { label: "Profile" }]}
    >
      {loading ? <LoadingBlock label="Loading profile..." /> : null}

      {!loading && error ? (
        <ErrorState
          title="Unable to load profile"
          description={error}
          onRetry={loadPage}
        />
      ) : null}

      {!loading && !error && data ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Name
                </div>
                <div className="mt-1 text-sm font-medium text-foreground">
                  {data.name}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Phone
                </div>
                <div className="mt-1 text-sm font-medium text-foreground">
                  {data.phone}
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
            </div>
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
