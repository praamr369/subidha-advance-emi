"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import ModuleCard from "@/components/ui/module-card";
import ModuleSection from "@/components/ui/module-section";
import PortalPage from "@/components/ui/portal-page";
import { apiFetch, logout } from "@/lib/api";

type PartnerMetrics = {
  total_customers: number;
  total_emis_paid: number;
  total_commission: string;
  pending_commission: string;
  paid_commission: string;
};

export default function PartnerDashboardPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<PartnerMetrics | null>(null);

  useEffect(() => {
    apiFetch("/partner/dashboard/")
      .then((res) => setMetrics(res as PartnerMetrics))
      .catch(() => setMetrics(null));
  }, []);

  return (
    <PortalPage
      title="Partner Workspace"
      subtitle="Register customers, create subscriptions, and monitor commissions."
      actions={[
        { href: "/partner/customers", label: "Customers" },
        { href: "/partner/subscriptions", label: "Subscriptions" },
        { href: "/partner/commissions", label: "Commissions" },
      ]}
    >
      <button
        type="button"
        className="rounded border px-3 py-2"
        onClick={() => {
          logout();
          router.push("/login");
        }}
      >
        Logout
      </button>

      <ModuleSection
        title="Partner Modules"
        subtitle="Everything needed for partner-led customer onboarding and commission lifecycle."
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ModuleCard title="Customer Registration" description="Add and track referred customers." href="/partner/customers" />
          <ModuleCard title="Subscription Creation" description="Create subscriptions for valid customers and slots." href="/partner/subscriptions" />
          <ModuleCard title="Commission Ledger" description="Review pending and paid commission statements." href="/partner/commissions" />
        </div>
      </ModuleSection>

      {metrics ? (
        <ModuleSection title="Live Partner KPIs" subtitle="Partner-level metrics from backend analytics.">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="rounded border bg-white p-4">Customers: {metrics.total_customers}</div>
            <div className="rounded border bg-white p-4">EMIs Paid: {metrics.total_emis_paid}</div>
            <div className="rounded border bg-white p-4">Total Commission: ₹ {metrics.total_commission}</div>
            <div className="rounded border bg-white p-4">Pending: ₹ {metrics.pending_commission}</div>
            <div className="rounded border bg-white p-4">Paid: ₹ {metrics.paid_commission}</div>
          </div>
        </ModuleSection>
      ) : null}
    </PortalPage>
  );
}
