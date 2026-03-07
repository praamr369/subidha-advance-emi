"use client";

import { useEffect, useState } from "react";

import RoleGuard from "@/components/auth/RoleGuard";
import ModuleSection from "@/components/ui/module-section";
import PortalPage from "@/components/ui/portal-page";
import { apiFetch } from "@/lib/api";

type CustomerDashboard = {
  customer: { id: number; name: string; phone: string; kyc_status: string };
  summary: { active_subscriptions: number; pending_emis: number; paid_emis: number; total_paid_amount: string };
  subscriptions: Array<{ id: number; status: string; monthly_amount: string; tenure_months: number }>;
};

export default function CustomerDashboardPage() {
  const [data, setData] = useState<CustomerDashboard | null>(null);

  useEffect(() => {
    apiFetch("/customer/dashboard/")
      .then((res) => setData(res as CustomerDashboard))
      .catch(() => setData(null));
  }, []);

  return (
    <RoleGuard allowedRoles={["CUSTOMER", "ADMIN"]}>
      <PortalPage title="Customer Dashboard" subtitle="Track your registration, subscription, EMI and payment lifecycle.">
        {!data ? (
          <p>Loading...</p>
        ) : (
          <>
            <ModuleSection title={`Welcome, ${data.customer.name}`} subtitle={`Phone: ${data.customer.phone} • KYC: ${data.customer.kyc_status}`}>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded border bg-white p-4">Active Subscriptions: {data.summary.active_subscriptions}</div>
                <div className="rounded border bg-white p-4">Pending EMI: {data.summary.pending_emis}</div>
                <div className="rounded border bg-white p-4">Paid EMI: {data.summary.paid_emis}</div>
                <div className="rounded border bg-white p-4">Total Paid: ₹ {data.summary.total_paid_amount}</div>
              </div>
            </ModuleSection>

            <ModuleSection title="My Subscriptions" subtitle="All subscriptions associated with your account.">
              <table border={1} cellPadding={8} cellSpacing={0} style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Status</th>
                    <th>Tenure</th>
                    <th>Monthly Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.subscriptions.map((subscription) => (
                    <tr key={subscription.id}>
                      <td>{subscription.id}</td>
                      <td>{subscription.status}</td>
                      <td>{subscription.tenure_months}</td>
                      <td>{subscription.monthly_amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ModuleSection>
          </>
        )}
      </PortalPage>
    </RoleGuard>
  );
}
