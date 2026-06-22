import { PageHeader } from "@/shared/ui/PageHeader";
import {
  Users,
  Package,
  CreditCard,
  TrendingUp,
} from "lucide-react";

const stats = [
  { label: "Total Customers", value: "—", icon: Users, color: "bg-blue-50 text-blue-600" },
  { label: "Active Products", value: "—", icon: Package, color: "bg-emerald-50 text-emerald-600" },
  { label: "Payments Today", value: "—", icon: CreditCard, color: "bg-amber-50 text-amber-600" },
  { label: "Monthly Revenue", value: "—", icon: TrendingUp, color: "bg-purple-50 text-purple-600" },
];

export function DashboardPage() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of your business operations"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="rounded-lg border border-stone-200 bg-white p-5"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-stone-500">
                  {s.label}
                </span>
                <div className={`rounded-lg p-2 ${s.color}`}>
                  <Icon size={18} />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold text-stone-800">
                {s.value}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-stone-200 bg-white p-5">
          <h3 className="mb-4 font-semibold text-stone-700">
            Revenue Trend
          </h3>
          <div className="flex h-48 items-center justify-center text-sm text-stone-400">
            Chart placeholder — Recharts integration pending
          </div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-5">
          <h3 className="mb-4 font-semibold text-stone-700">
            Recent Activity
          </h3>
          <div className="flex h-48 items-center justify-center text-sm text-stone-400">
            Activity feed coming soon
          </div>
        </div>
      </div>
    </div>
  );
}
