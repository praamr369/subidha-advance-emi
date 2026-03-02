"use client";

import { useEffect, useState } from "react";

import PublicNav from "@/components/ui/public-nav";
import PortalPage from "@/components/ui/portal-page";
import { apiFetch } from "@/lib/api";
import StatCard from "@/components/ui/stat-card";

type PublicStats = {
  total_batches: number;
  total_subscriptions: number;
  total_winners: number;
  active_subscriptions: number;
};

export default function HomePage() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/public/stats/")
      .then((response: unknown) => {
        if (
          response &&
          typeof response === "object" &&
          "total_batches" in response
        ) {
          setStats(response as PublicStats);
        } else {
          setStats(null);
        }
      })
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  const completionRate =
    stats && stats.total_subscriptions > 0
      ? (
          ((stats.total_subscriptions - stats.active_subscriptions) /
            stats.total_subscriptions) *
          100
        ).toFixed(1)
      : "0";

  const activePercentage =
    stats && stats.total_subscriptions > 0
      ? (stats.active_subscriptions / stats.total_subscriptions) * 100
      : 0;

  return (
    <PortalPage
      title="Subidha Lucky Plan EMI Management"
      subtitle="Transparent 15-month retail EMI subscriptions with monthly lucky winner selection and strict ledger-based controls."
    >
      <PublicNav />

      {/* How It Works */}
      <section className="mt-8">
        <h2 className="text-2xl font-semibold mb-4">How It Works</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Register as customer/partner.</li>
          <li>Assign customer to batch Lucky ID (00-99).</li>
          <li>Collect EMI monthly and track in ledger.</li>
          <li>Publish monthly winner transparently.</li>
        </ol>
      </section>

      {/* Transparency Section */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold mb-6">
          Live Transparency Snapshot
        </h2>

        {loading ? (
          <p className="text-gray-600">Loading live statistics...</p>
        ) : stats ? (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                label="Total Batches"
                value={stats.total_batches}
              />
              <StatCard
                label="Total Subscriptions"
                value={stats.total_subscriptions}
              />
              <StatCard
                label="Total Winners"
                value={stats.total_winners}
              />
              <StatCard
                label="Active Subscriptions"
                value={stats.active_subscriptions}
              />
            </div>

            {/* Completion Metric */}
            <div className="mt-8">
              <p className="text-sm text-gray-600">
                Completion Rate:{" "}
                <span className="font-semibold">{completionRate}%</span>
              </p>
            </div>

            {/* Progress Bar */}
            <div className="mt-4">
              <div className="h-3 bg-gray-200 rounded-full">
                <div
                  className="h-3 bg-blue-600 rounded-full transition-all duration-500"
                  style={{ width: `${activePercentage}%` }}
                />
              </div>
            </div>
          </>
        ) : (
          <p className="text-red-600">
            Live statistics are temporarily unavailable.
          </p>
        )}
      </section>
    </PortalPage>
  );
}