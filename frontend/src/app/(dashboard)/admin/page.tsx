"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import PortalPage from "@/components/ui/portal-page";
import { apiFetch, logout } from "@/lib/api";

type AdminDashboardResponse = {
  financial: {
    total_revenue: number;
    today_collection: number;
    total_outstanding: number;
  };
  emi: {
    pending: number;
    overdue: number;
  };
  subscriptions: {
    active: number;
    completed: number;
    won: number;
  };
  batches: {
    total_batches: number;
    total_draws: number;
  };
  risk: {
    healthy: number;
    at_risk: number;
    high_risk: number;
    defaulted: number;
    default_rate: number;
  };
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminDashboardResponse | null>(null);

  useEffect(() => {
    apiFetch("/admin/dashboard")
      .then((response) => setData(response as AdminDashboardResponse))
      .catch(() => {
        logout();
        router.replace("/login?next=/admin");
      });
  }, [router]);

  return (
    <PortalPage
      title="Admin Control Panel"
      subtitle="Enterprise system intelligence overview"
      actions={[
        { href: "/admin/batches", label: "Batch Management" },
        { href: "/admin/subscriptions", label: "Subscription" },
        { href: "/admin/emi", label: "EMI" },
        { href: "/admin/lucky-draw", label: "Lucky Draw" },
        { href: "/admin/reports", label: "Reports" },
      ]}
    >
      <button onClick={() => { logout(); router.push("/login"); }}>
        Logout
      </button>

      {!data ? (
        <p>Loading dashboard...</p>
      ) : (
        <>
          <h2>Financial Overview</h2>
          <ul>
            <li>Total Revenue: ₹ {data.financial.total_revenue}</li>
            <li>Today Collection: ₹ {data.financial.today_collection}</li>
            <li>Total Outstanding: ₹ {data.financial.total_outstanding}</li>
          </ul>

          <h2>EMI Status</h2>
          <ul>
            <li>Pending EMI: {data.emi.pending}</li>
            <li>Overdue EMI: {data.emi.overdue}</li>
          </ul>

          <h2>Subscriptions</h2>
          <ul>
            <li>Active: {data.subscriptions.active}</li>
            <li>Completed: {data.subscriptions.completed}</li>
            <li>Won: {data.subscriptions.won}</li>
          </ul>

          <h2>Batch & Draw</h2>
          <ul>
            <li>Total Batches: {data.batches.total_batches}</li>
            <li>Total Draws: {data.batches.total_draws}</li>
          </ul>

          <h2>Risk Overview</h2>
          <ul>
            <li>Healthy: {data.risk.healthy}</li>
            <li>At Risk: {data.risk.at_risk}</li>
            <li>High Risk: {data.risk.high_risk}</li>
            <li>Defaulted: {data.risk.defaulted}</li>
            <li>Default Rate: {(data.risk.default_rate * 100).toFixed(2)}%</li>
          </ul>
        </>
      )}
    </PortalPage>
  );
}