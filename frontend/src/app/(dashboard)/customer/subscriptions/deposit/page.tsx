"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type Deposit = {
  id: number;
  subscription_number: string;
  product_name: string;
  deposit_amount: number;
  paid_amount: number;
  status: "PENDING" | "PAID" | "REFUNDED" | "FORFEITED";
  paid_at: string | null;
  refund_eligible_date: string | null;
  refunded_at: string | null;
  notes: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Payment Pending", color: "yellow" },
  PAID: { label: "Paid & Held", color: "blue" },
  REFUNDED: { label: "Refunded", color: "green" },
  FORFEITED: { label: "Forfeited", color: "red" },
};

export default function DepositStatusPage() {
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/v1/subscriptions/deposits/")
      .then((d) => setDeposits(Array.isArray(d) ? d as Deposit[] : ((d as { results?: Deposit[] })?.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalHeld = deposits.filter((d) => d.status === "PAID").reduce((s, d) => s + d.deposit_amount, 0);
  const totalRefunded = deposits.filter((d) => d.status === "REFUNDED").reduce((s, d) => s + d.deposit_amount, 0);

  return (
    <ERPPageShell
      title="Security Deposit"
      subtitle="Security deposit status for all your rental and lease subscriptions"
      breadcrumbs={[
        { label: "Home", href: "/customer/dashboard" },
        { label: "Subscriptions", href: "/customer/subscriptions" },
        { label: "Security Deposit" },
      ]}
    >
      <div className="space-y-6">
        {!loading && deposits.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200">
              <div className="text-2xl font-bold text-blue-700">₹{totalHeld.toLocaleString("en-IN")}</div>
              <div className="text-xs text-blue-600 mt-1">Total Held</div>
            </div>
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200">
              <div className="text-2xl font-bold text-green-700">₹{totalRefunded.toLocaleString("en-IN")}</div>
              <div className="text-xs text-green-600 mt-1">Total Refunded</div>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border">
              <div className="text-2xl font-bold">{deposits.length}</div>
              <div className="text-xs text-gray-500 mt-1">Total Deposits</div>
            </div>
          </div>
        )}

        <WorkspaceSection title="Deposit Records">
          {loading && <div className="py-8 text-center text-gray-500">Loading...</div>}

          {!loading && deposits.length === 0 && (
            <div className="py-12 text-center text-gray-500">
              <div className="text-4xl mb-3">🏦</div>
              <p className="font-medium">No security deposits</p>
              <p className="text-sm mt-1">Security deposits apply to rental and lease subscriptions.</p>
            </div>
          )}

          {!loading && deposits.map((dep) => {
            const cfg = STATUS_CONFIG[dep.status];
            return (
              <div key={dep.id} className="p-4 border rounded-lg mb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold">{dep.product_name}</div>
                    <div className="text-sm text-gray-500">{dep.subscription_number}</div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium bg-${cfg.color}-100 text-${cfg.color}-700`}>
                    {cfg.label}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-gray-500 text-xs">Deposit Amount</div>
                    <div className="font-semibold">₹{dep.deposit_amount.toLocaleString("en-IN")}</div>
                  </div>
                  {dep.paid_at && (
                    <div>
                      <div className="text-gray-500 text-xs">Paid On</div>
                      <div className="font-medium">{new Date(dep.paid_at).toLocaleDateString("en-IN")}</div>
                    </div>
                  )}
                  {dep.refund_eligible_date && dep.status === "PAID" && (
                    <div>
                      <div className="text-gray-500 text-xs">Refund Eligible</div>
                      <div className="font-medium">{new Date(dep.refund_eligible_date).toLocaleDateString("en-IN")}</div>
                    </div>
                  )}
                  {dep.refunded_at && (
                    <div>
                      <div className="text-gray-500 text-xs">Refunded On</div>
                      <div className="font-medium text-green-600">{new Date(dep.refunded_at).toLocaleDateString("en-IN")}</div>
                    </div>
                  )}
                </div>
                {dep.notes && <div className="mt-2 text-xs text-gray-500">{dep.notes}</div>}
              </div>
            );
          })}
        </WorkspaceSection>

        <WorkspaceSection title="Deposit Policy">
          <ul className="text-sm space-y-1 list-disc list-inside text-blue-800 dark:text-blue-200">
            <li>Security deposit is refunded after successful product return inspection</li>
            <li>Deductions apply for damage beyond normal use</li>
            <li>Refund processed within 7–14 business days of return</li>
            <li>Forfeiture applies if product is lost or severely damaged</li>
          </ul>
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
