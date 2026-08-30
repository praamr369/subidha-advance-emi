"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { apiFetch } from "@/lib/api";
import { Wallet, PackageSearch, Users, Activity, ExternalLink } from "lucide-react";
import Link from "next/link";
import { ROUTES } from "@/lib/routes";

interface SolopreneurData {
  total_liquid_balance: number;
  active_subscriptions: number;
  pending_production_jobs: number;
  unposted_labor_accruals: number;
  open_leads: number;
}

export default function UniversalControlCenterPage() {
  const [data, setData] = useState<SolopreneurData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/v1/admin/solopreneur-dashboard/")
      .then((res: any) => {
        setData(res.data);
      })
      .catch((err) => {
        console.error("Failed to load solopreneur dashboard", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <ERPPageShell title="Universal Control Center">
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard 
            title="Liquid Balance" 
            value={data ? `₹${data.total_liquid_balance.toLocaleString()}` : (loading ? "..." : "0")} 
            icon={<Wallet className="h-5 w-5" />} 
          />
          <StatCard 
            title="Active Plans" 
            value={data ? data.active_subscriptions.toLocaleString() : (loading ? "..." : "0")} 
            icon={<Activity className="h-5 w-5" />} 
          />
          <StatCard 
            title="Open Leads" 
            value={data ? data.open_leads.toLocaleString() : (loading ? "..." : "0")} 
            icon={<Users className="h-5 w-5" />} 
          />
          <StatCard 
            title="Pending Jobs" 
            value={data ? data.pending_production_jobs.toLocaleString() : (loading ? "..." : "0")} 
            icon={<PackageSearch className="h-5 w-5" />} 
          />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Fast Workflows</h3>
            <div className="space-y-3">
              <QuickActionLink href="/admin/collections" label="Collect Customer Payment" />
              <QuickActionLink href="/admin/crm/leads" label="Process CRM Leads" />
              <QuickActionLink href="/admin/products" label="Stock / Inventory" />
              <QuickActionLink href="/admin/subscriptions" label="Subscription Manager" />
              <QuickActionLink href="/admin/operations" label="Logistics & Delivery" />
            </div>
          </div>
        </div>
      </div>
    </ERPPageShell>
  );
}

function StatCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="text-3xl font-bold tracking-tight text-foreground mt-2">{value}</p>
      </div>
      <div className="text-primary/50 bg-primary/10 p-3 rounded-full">{icon}</div>
    </div>
  );
}

function QuickActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/30 hover:bg-accent hover:border-accent hover:text-accent-foreground transition-all">
      <span className="font-medium text-sm">{label}</span>
      <ExternalLink className="h-4 w-4 opacity-50" />
    </Link>
  );
}
