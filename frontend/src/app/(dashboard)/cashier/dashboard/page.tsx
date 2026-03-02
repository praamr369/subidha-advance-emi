"use client";

import { useEffect, useState } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { apiFetch } from "@/lib/api";

type Transaction = {
  id: number;
  customer_name: string;
  month_no: number;
  amount: number;
  method: string;
  reference_no?: string;
  payment_time: string;
};

type DashboardStats = {
  total_pending_emis: number;
  total_pending_amount: number;

  today_collection_count: number;
  today_collection_amount: number;

  today_cash_total: number;
  today_upi_total: number;

  today_transactions: Transaction[];
};

export default function CashierDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [closingCash, setClosingCash] = useState("");
  const [difference, setDifference] = useState<number | null>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const data = await apiFetch("/cashier/dashboard/");
        setStats(data as DashboardStats);
      } catch (error) {
        console.error("Failed to load dashboard", error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  const calculateDifference = () => {
    if (!stats) return;

    const expected = stats.today_cash_total;
    const entered = Number(closingCash);

    if (!isNaN(entered)) {
      setDifference(entered - expected);
    }
  };

  return (
    <RoleGuard allowedRoles={["CASHIER", "ADMIN"]}>
      <div className="p-6 space-y-8">

        <h1 className="text-2xl font-bold">Cashier Dashboard</h1>

        {loading && <p>Loading dashboard...</p>}

        {!loading && stats && (
          <>
            {/* KPI SECTION */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              <StatCard
                title="Total Pending EMIs"
                value={stats.total_pending_emis}
              />

              <StatCard
                title="Total Pending Amount"
                value={`₹ ${stats.total_pending_amount}`}
              />

              <StatCard
                title="Today's Collection"
                value={`₹ ${stats.today_collection_amount}`}
              />

              <StatCard
                title="Cash Today"
                value={`₹ ${stats.today_cash_total}`}
              />

              <StatCard
                title="UPI / Bank Today"
                value={`₹ ${stats.today_upi_total}`}
              />

              <StatCard
                title="Transactions Today"
                value={stats.today_collection_count}
              />

            </div>

            {/* TODAY TRANSACTIONS */}
            <div className="bg-white shadow rounded p-6">
              <h2 className="text-lg font-semibold mb-4">
                Today's Transactions
              </h2>

              <table className="w-full text-sm border">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-2">Customer</th>
                    <th className="border p-2">Month</th>
                    <th className="border p-2">Amount</th>
                    <th className="border p-2">Method</th>
                    <th className="border p-2">Ref</th>
                    <th className="border p-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.today_transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="border p-2">{tx.customer_name}</td>
                      <td className="border p-2">{tx.month_no}</td>
                      <td className="border p-2">₹ {tx.amount}</td>
                      <td className="border p-2">{tx.method}</td>
                      <td className="border p-2">
                        {tx.reference_no || "-"}
                      </td>
                      <td className="border p-2">
                        {tx.payment_time}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* END DAY SECTION */}
            <div className="bg-white shadow rounded p-6 space-y-4">
              <h2 className="text-lg font-semibold">End Day Summary</h2>

              <p>
                Expected Cash: ₹ {stats.today_cash_total}
              </p>

              <input
                type="number"
                placeholder="Enter closing cash"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                className="border rounded px-3 py-2 w-60"
              />

              <button
                onClick={calculateDifference}
                className="bg-blue-600 text-white px-4 py-2 rounded ml-3"
              >
                Calculate
              </button>

              {difference !== null && (
                <p
                  className={`font-bold ${
                    difference === 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  Difference: ₹ {difference}
                </p>
              )}
            </div>

          </>
        )}

      </div>
    </RoleGuard>
  );
}

function StatCard({ title, value }: { title: string; value: any }) {
  return (
    <div className="p-6 bg-white shadow rounded">
      <h2 className="text-sm text-gray-500">{title}</h2>
      <p className="text-2xl font-bold mt-2">{value}</p>
    </div>
  );
}