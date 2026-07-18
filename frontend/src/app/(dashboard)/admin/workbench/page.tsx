"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import StatusBadge from "@/components/ui/status-badge";
import { ROUTES } from "@/lib/routes";
import { apiFetch } from "@/lib/api";

// Types
type TabType = "overview" | "customers" | "leads" | "requests";

type DashboardData = {
  kpis: {
    total_customers: number;
    active_leads: number;
    pending_requests: number;
    conversion_rate: number;
    average_deal_size: number;
    pending_approvals: number;
  };
  lead_metrics: {
    total: number;
    converted: number;
    in_pipeline: number;
    follow_up_needed: number;
  };
  request_metrics: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    in_progress: number;
  };
  pipeline: {
    stages: Array<{
      name: string;
      leads_count: number;
      value: number;
      percentage: number;
    }>;
    total_pipeline_value: number;
  };
  top_leads: Array<{
    id: number;
    name: string;
    status: string;
    assigned_to: string | null;
    created_at: string;
  }>;
  recent_requests: Array<{
    id: number;
    customer_name: string;
    type: string;
    status: string;
    created_at: string;
  }>;
  customers: Array<{
    id: number;
    name: string;
    phone: string;
    email: string;
    city: string;
    kyc_status: string;
    type: "REGISTERED" | "UNREGISTERED";
  }>;
};

export default function UnifiedWorkbenchPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await apiFetch<{ status: string; data: DashboardData }>(
          `/api/v1/admin/workbench/dashboard/`
        );
        console.log("Dashboard API full result:", result);
        console.log("Dashboard API keys:", Object.keys(result));

        // Handle both response formats
        const dataPayload = (result as any)?.data || result;
        console.log("Dashboard data payload:", dataPayload);
        console.log("Data payload keys:", dataPayload ? Object.keys(dataPayload) : 'null');
        console.log("Data payload.kpis:", dataPayload?.kpis);

        setData(dataPayload);
        setError(null);
      } catch (err) {
        console.error("Dashboard fetch error:", err);
        setError(err instanceof Error ? err.message : "Failed to load workbench");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleSelectCustomer = (customerId: number) => {
    router.push(`/admin/workbench/customer/${customerId}`);
  };

  const filteredLeads = (data?.top_leads || []).filter(
    (lead) =>
      lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.assigned_to?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCustomers = (data?.customers || []).filter(
    (customer) =>
      customer.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      customer.phone.includes(customerSearch) ||
      customer.email.toLowerCase().includes(customerSearch.toLowerCase())
  );

  if (loading) {
    return (
      <ERPPageShell
        eyebrow="Workbench"
        title="Unified Workbench"
        breadcrumbs={[
          { label: "Admin", href: ROUTES.admin.dashboard },
          { label: "Workbench" },
        ]}
      >
        <ERPLoadingState label="Loading unified workbench..." />
      </ERPPageShell>
    );
  }

  return (
    <ERPPageShell
      eyebrow="Workbench"
      title="Unified Workbench"
      subtitle="Complete CRM & Request Management Hub"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Workbench" },
      ]}
    >
      {/* TABS */}
      <div className="flex gap-2 mb-6 border-b border-border">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-3 font-medium text-sm transition-colors ${
            activeTab === "overview"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          📊 Overview & KPIs
        </button>
        <button
          onClick={() => setActiveTab("customers")}
          className={`px-4 py-3 font-medium text-sm transition-colors ${
            activeTab === "customers"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          👥 All Customers
        </button>
        <button
          onClick={() => setActiveTab("leads")}
          className={`px-4 py-3 font-medium text-sm transition-colors ${
            activeTab === "leads"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          🎯 Leads Pipeline
        </button>
        <button
          onClick={() => setActiveTab("requests")}
          className={`px-4 py-3 font-medium text-sm transition-colors ${
            activeTab === "requests"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          📋 All Requests
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive mb-6">
          <p>{error}</p>
        </div>
      )}

      {!data ? null : activeTab === "overview" ? (
        <>
          {/* KPI CARDS */}
          <ERPSectionShell title="Dashboard KPIs" description="Real-time metrics">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              <div className="rounded-lg border border-border bg-gradient-to-br from-primary/5 to-primary/10 p-6">
                <div className="text-sm text-muted-foreground font-medium">Total Customers</div>
                <div className="text-4xl font-bold text-primary mt-2">{data.kpis.total_customers}</div>
                <div className="text-xs text-muted-foreground mt-2">Active accounts</div>
              </div>
              <div className="rounded-lg border border-border bg-gradient-to-br from-blue-500/5 to-blue-500/10 p-6">
                <div className="text-sm text-muted-foreground font-medium">Active Leads</div>
                <div className="text-4xl font-bold text-blue-600 mt-2">{data.kpis.active_leads}</div>
                <div className="text-xs text-muted-foreground mt-2">In pipeline</div>
              </div>
              <div className="rounded-lg border border-border bg-gradient-to-br from-amber-500/5 to-amber-500/10 p-6">
                <div className="text-sm text-muted-foreground font-medium">Pending Requests</div>
                <div className="text-4xl font-bold text-amber-600 mt-2">{data.kpis.pending_requests}</div>
                <div className="text-xs text-muted-foreground mt-2">Awaiting approval</div>
              </div>
              <div className="rounded-lg border border-border bg-gradient-to-br from-green-500/5 to-green-500/10 p-6">
                <div className="text-sm text-muted-foreground font-medium">Conversion Rate</div>
                <div className="text-4xl font-bold text-green-600 mt-2">{data.kpis.conversion_rate}%</div>
                <div className="text-xs text-muted-foreground mt-2">Leads to customers</div>
              </div>
              <div className="rounded-lg border border-border bg-gradient-to-br from-purple-500/5 to-purple-500/10 p-6">
                <div className="text-sm text-muted-foreground font-medium">Avg Deal Size</div>
                <div className="text-4xl font-bold text-purple-600 mt-2">₹{(data.kpis.average_deal_size / 100000).toFixed(1)}L</div>
                <div className="text-xs text-muted-foreground mt-2">Average value</div>
              </div>
              <div className="rounded-lg border border-border bg-gradient-to-br from-red-500/5 to-red-500/10 p-6">
                <div className="text-sm text-muted-foreground font-medium">Pending Approvals</div>
                <div className="text-4xl font-bold text-red-600 mt-2">{data.kpis.pending_approvals}</div>
                <div className="text-xs text-muted-foreground mt-2">Action items</div>
              </div>
            </div>
          </ERPSectionShell>

          {/* METRICS GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* REQUESTS */}
            <ERPSectionShell title="Request Metrics" description="By status">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">Total: {data.request_metrics.total}</span>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm">Approved</span>
                    <span className="text-sm font-bold text-green-600">{data.request_metrics.approved}</span>
                  </div>
                  <div className="w-full bg-muted h-2 rounded-full">
                    <div className="bg-green-500 h-2 rounded-full" style={{width: `${(data.request_metrics.approved / data.request_metrics.total * 100)}%`}}/>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm">Pending</span>
                    <span className="text-sm font-bold text-amber-600">{data.request_metrics.pending}</span>
                  </div>
                  <div className="w-full bg-muted h-2 rounded-full">
                    <div className="bg-amber-500 h-2 rounded-full" style={{width: `${(data.request_metrics.pending / data.request_metrics.total * 100)}%`}}/>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm">In Progress</span>
                    <span className="text-sm font-bold text-blue-600">{data.request_metrics.in_progress}</span>
                  </div>
                  <div className="w-full bg-muted h-2 rounded-full">
                    <div className="bg-blue-500 h-2 rounded-full" style={{width: `${(data.request_metrics.in_progress / data.request_metrics.total * 100)}%`}}/>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm">Rejected</span>
                    <span className="text-sm font-bold text-red-600">{data.request_metrics.rejected}</span>
                  </div>
                  <div className="w-full bg-muted h-2 rounded-full">
                    <div className="bg-red-500 h-2 rounded-full" style={{width: `${(data.request_metrics.rejected / data.request_metrics.total * 100)}%`}}/>
                  </div>
                </div>
              </div>
            </ERPSectionShell>

            {/* LEADS */}
            <ERPSectionShell title="Lead Funnel" description="Pipeline metrics">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">Total: {data.lead_metrics.total}</span>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm">Converted</span>
                    <span className="text-sm font-bold text-green-600">{data.lead_metrics.converted}</span>
                  </div>
                  <div className="w-full bg-muted h-2 rounded-full">
                    <div className="bg-green-500 h-2 rounded-full" style={{width: `${(data.lead_metrics.converted / data.lead_metrics.total * 100)}%`}}/>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm">In Pipeline</span>
                    <span className="text-sm font-bold text-blue-600">{data.lead_metrics.in_pipeline}</span>
                  </div>
                  <div className="w-full bg-muted h-2 rounded-full">
                    <div className="bg-blue-500 h-2 rounded-full" style={{width: `${(data.lead_metrics.in_pipeline / data.lead_metrics.total * 100)}%`}}/>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm">Follow Up Needed</span>
                    <span className="text-sm font-bold text-amber-600">{data.lead_metrics.follow_up_needed}</span>
                  </div>
                  <div className="w-full bg-muted h-2 rounded-full">
                    <div className="bg-amber-500 h-2 rounded-full" style={{width: `${(data.lead_metrics.follow_up_needed / data.lead_metrics.total * 100)}%`}}/>
                  </div>
                </div>
              </div>
            </ERPSectionShell>
          </div>

          {/* PIPELINE */}
          <ERPSectionShell title="Sales Pipeline" description="Revenue by stage">
            <div className="space-y-4">
              {data.pipeline.stages.map((stage) => (
                <div key={stage.name}>
                  <div className="flex justify-between mb-2">
                    <div>
                      <div className="text-sm font-semibold">{stage.name}</div>
                      <div className="text-xs text-muted-foreground">{stage.leads_count} leads</div>
                    </div>
                    <div className="text-sm font-bold">{stage.percentage.toFixed(0)}%</div>
                  </div>
                  <div className="w-full bg-muted h-3 rounded-full">
                    <div className="bg-primary h-3 rounded-full" style={{width: `${stage.percentage}%`}}/>
                  </div>
                </div>
              ))}
              <div className="pt-4 border-t">
                <div className="flex justify-between">
                  <span className="font-semibold">Total Pipeline</span>
                  <span className="text-2xl font-bold text-primary">₹{(data.pipeline.total_pipeline_value / 1000000).toFixed(1)}M</span>
                </div>
              </div>
            </div>
          </ERPSectionShell>
        </>
      ) : activeTab === "customers" ? (
        <ERPSectionShell title="All Customers" description="Registered & Active Customers">
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search by name, phone, or email..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="w-full px-4 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="space-y-2">
            {filteredCustomers.length > 0 ? (
              filteredCustomers.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => customer.type === "REGISTERED" ? handleSelectCustomer(customer.id) : null}
                  disabled={customer.type === "UNREGISTERED"}
                  className={`w-full flex items-center justify-between p-4 border rounded-lg transition ${
                    customer.type === "REGISTERED"
                      ? "border-border hover:bg-muted/50 cursor-pointer"
                      : "border-amber-200 bg-amber-50/50 cursor-default opacity-75"
                  }`}
                >
                  <div className="text-left flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-sm">{customer.name}</div>
                      <div className={`text-xs px-2 py-1 rounded-full font-medium ${
                        customer.type === "REGISTERED"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}>
                        {customer.type === "REGISTERED" ? "✓ Customer" : "🎯 Prospect"}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {customer.phone} • {customer.email} • {customer.city}
                    </div>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={customer.kyc_status} />
                    <div className="text-xs text-muted-foreground mt-1">ID: {customer.id}</div>
                  </div>
                </button>
              ))
            ) : (
              <div className="text-center text-muted-foreground py-8">No customers found</div>
            )}
          </div>
        </ERPSectionShell>
      ) : activeTab === "leads" ? (
        <ERPSectionShell title="Leads Pipeline" description="All leads in funnel">
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search leads by name or assignee..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="space-y-2">
            {filteredLeads.length > 0 ? (
              filteredLeads.map((lead) => (
                <div key={lead.id} className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition">
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{lead.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Assigned to: {lead.assigned_to || "Unassigned"} • {new Date(lead.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <StatusBadge status={lead.status} />
                </div>
              ))
            ) : (
              <div className="text-center text-muted-foreground py-8">No leads found</div>
            )}
          </div>
        </ERPSectionShell>
      ) : (
        <ERPSectionShell title="Recent Requests" description="All customer requests">
          <div className="space-y-2">
            {data.recent_requests.length > 0 ? (
              data.recent_requests.map((request) => (
                <div key={request.id} className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition">
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{request.customer_name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {request.type} • {new Date(request.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <StatusBadge status={request.status} />
                </div>
              ))
            ) : (
              <div className="text-center text-muted-foreground py-8">No requests found</div>
            )}
          </div>
        </ERPSectionShell>
      )}
    </ERPPageShell>
  );
}
