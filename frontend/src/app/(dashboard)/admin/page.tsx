"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BarChart2,
  CheckSquare,
  Landmark,
  Package,
  Receipt,
  ShoppingCart,
  Truck,
  Users,
  Settings,
  Menu,
} from "lucide-react";
import { ModernDashboardShell, ModernCard, ModernButton, ModernBadge } from "@/components/modern";
import { ROUTES } from "@/lib/routes";

const MODULES = [
  {
    key: "sales",
    label: "Sales",
    purpose: "Direct-sale and billing operations",
    href: ROUTES.admin.salesWorkspace,
    icon: ShoppingCart,
    color: "emerald",
  },
  {
    key: "crm",
    label: "CRM",
    purpose: "Customers, leads, and follow-ups",
    href: ROUTES.admin.crmWorkspace,
    icon: Users,
    color: "blue",
  },
  {
    key: "accounting",
    label: "Accounting",
    purpose: "GL, invoices, and finance books",
    href: ROUTES.admin.accounting,
    icon: Landmark,
    color: "purple",
  },
  {
    key: "inventory",
    label: "Inventory",
    purpose: "Stock and movement control",
    href: ROUTES.admin.inventory,
    icon: Package,
    color: "amber",
  },
  {
    key: "finance",
    label: "Finance",
    purpose: "Collections and reconciliation",
    href: ROUTES.admin.finance,
    icon: BarChart2,
    color: "indigo",
  },
  {
    key: "billing",
    label: "Billing",
    purpose: "Invoices and receipts",
    href: ROUTES.admin.billingDirectSaleWorkspace,
    icon: Receipt,
    color: "blue",
  },
  {
    key: "delivery",
    label: "Delivery",
    purpose: "Delivery queue and handovers",
    href: ROUTES.admin.delivery,
    icon: Truck,
    color: "orange",
  },
  {
    key: "reports",
    label: "Reports",
    purpose: "Business analytics and exports",
    href: ROUTES.admin.reports,
    icon: BarChart2,
    color: "cyan",
  },
];

const QUICK_ACTIONS = [
  { label: "Settings", href: ROUTES.admin.settings, icon: Settings },
  { label: "Documentation", href: "#", icon: BarChart2 },
];

export default function AdminDashboardPage() {
  const getColorClass = (color: string) => {
    const colorMap: Record<string, string> = {
      emerald: "text-emerald-600 dark:text-emerald-400",
      blue: "text-blue-600 dark:text-blue-400",
      purple: "text-purple-600 dark:text-purple-400",
      amber: "text-amber-600 dark:text-amber-400",
      indigo: "text-indigo-600 dark:text-indigo-400",
      orange: "text-orange-600 dark:text-orange-400",
      cyan: "text-cyan-600 dark:text-cyan-400",
    };
    return colorMap[color] || "text-slate-600";
  };

  return (
    <ModernDashboardShell
      title="Admin Dashboard"
      subtitle="Access core admin modules and operations"
      breadcrumbs={[{ label: "Admin" }, { label: "Dashboard" }]}
    >
      {/* Main Modules Grid */}
      <div className="mb-8">
        <h2 className="text-lg font-bold mb-4 text-slate-900 dark:text-white">
          Core Modules
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {MODULES.map((module) => {
            const Icon = module.icon;
            return (
              <Link key={module.key} href={module.href || "#"}>
                <div className="h-full p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:shadow-lg hover:border-blue-400 dark:hover:border-blue-600 transition-all cursor-pointer">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`p-2 rounded-lg bg-slate-100 dark:bg-slate-700 ${getColorClass(module.color)}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <ModernBadge color="blue" variant="soft" size="sm">
                      Live
                    </ModernBadge>
                  </div>
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                    {module.label}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {module.purpose}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Quick Stats */}
      <ModernCard title="Quick Access" subtitle="Common operations">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.label} href={action.href}>
                <button className="w-full p-4 text-center rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <Icon className="w-5 h-5 mx-auto mb-2 text-slate-600 dark:text-slate-400" />
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {action.label}
                  </p>
                </button>
              </Link>
            );
          })}
        </div>
      </ModernCard>

      {/* System Status */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <ModernCard title="System Status">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600 dark:text-slate-400">API</span>
              <ModernBadge color="green" variant="soft" size="sm">
                Healthy
              </ModernBadge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600 dark:text-slate-400">Database</span>
              <ModernBadge color="green" variant="soft" size="sm">
                Connected
              </ModernBadge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600 dark:text-slate-400">Cache</span>
              <ModernBadge color="green" variant="soft" size="sm">
                Active
              </ModernBadge>
            </div>
          </div>
        </ModernCard>

        <ModernCard title="Performance">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">Uptime</span>
              <span className="text-sm font-mono">99.9%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">Avg Latency</span>
              <span className="text-sm font-mono">145ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">Requests/min</span>
              <span className="text-sm font-mono">2.4K</span>
            </div>
          </div>
        </ModernCard>

        <ModernCard title="Resources">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">CPU</span>
              <span className="text-sm font-mono">24%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">Memory</span>
              <span className="text-sm font-mono">62%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">Storage</span>
              <span className="text-sm font-mono">48%</span>
            </div>
          </div>
        </ModernCard>
      </div>
    </ModernDashboardShell>
  );
}
