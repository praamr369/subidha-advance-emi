"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import StatusBadge from "@/components/ui/status-badge";
import { ROUTES } from "@/lib/routes";
import { apiFetch } from "@/lib/api";

type TabType = "overview" | "requests" | "lead" | "invoices";

type WorkbenchData = {
  customer: {
    id: number;
    name: string;
    phone: string;
    email: string;
    city: string;
    kyc_status: string;
    status: string;
  };
  online_requests: Array<{
    id: number;
    request_number: string;
    status: string;
    request_type: string;
    product_name: string;
    amount: string;
    created_at: string;
  }>;
  crm_lead: {
    id: number;
    name: string;
    phone: string;
    email: string;
    source: string;
    status: string;
    stage: string;
    assigned_to: string | null;
    assigned_to_id: number | null;
    notes: string;
    created_at: string;
    next_stage: string | null;
    prev_stage: string | null;
  } | null;
  product_requests: Array<{
    id: number;
    type: string;
    status: string;
    product_name: string;
    created_at: string;
  }>;
  invoices: Array<{
    id: number;
    amount: string;
    status: string;
    created_at: string;
  }>;
  subscriptions: Array<{
    id: number;
    plan_type: string;
    status: string;
    created_at: string;
  }>;
  timeline: Array<{
    time: string;
    event: string;
    type: string;
  }>;
  next_actions: string[];
};

export default function CustomerDetailPage() {
  const params = useParams<{ customer_id: string }>();
  const router = useRouter();
  const customerId = params?.customer_id;

  const [data, setData] = useState<WorkbenchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [expandedRequests, setExpandedRequests] = useState<Set<number>>(new Set());

  const loadWorkbench = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const result = await apiFetch<{ data: WorkbenchData }>(
        `/api/v1/admin/workbench/customer/${customerId}/`
      );
      setData(result.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading customer data");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    loadWorkbench();
  }, [loadWorkbench]);

  const toggleExpanded = (id: number) => {
    const newSet = new Set(expandedRequests);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedRequests(newSet);
  };

  if (loading) {
    return (
      <ERPPageShell
        eyebrow="Workbench"
        title="Customer Details"
        breadcrumbs={[
          { label: "Admin", href: ROUTES.admin.dashboard },
          { label: "Workbench", href: "/admin/workbench" },
          { label: "Customer" },
        ]}
      >
        <ERPLoadingState label="Loading customer details..." />
      </ERPPageShell>
    );
  }

  if (error || !data) {
    return (
      <ERPPageShell
        eyebrow="Workbench"
        title="Customer Details"
        breadcrumbs={[
          { label: "Admin", href: ROUTES.admin.dashboard },
          { label: "Workbench", href: "/admin/workbench" },
          { label: "Customer" },
        ]}
      >
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-destructive">
          <p>{error}</p>
        </div>
      </ERPPageShell>
    );
  }

  return (
    <ERPPageShell
      eyebrow={`Customer #${data.customer.id}`}
      title={data.customer.name}
      subtitle="Complete customer lifecycle and request management"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Workbench", href: "/admin/workbench" },
        { label: data.customer.name },
      ]}
    >
      {/* CUSTOMER HEADER CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-lg border border-border bg-gradient-to-br from-primary/5 to-primary/10 p-4">
          <div className="text-xs text-muted-foreground font-medium">Phone</div>
          <div className="text-xl font-bold text-primary mt-1">{data.customer.phone}</div>
        </div>
        <div className="rounded-lg border border-border bg-gradient-to-br from-blue-500/5 to-blue-500/10 p-4">
          <div className="text-xs text-muted-foreground font-medium">Email</div>
          <div className="text-sm font-semibold text-blue-600 mt-1 truncate">{data.customer.email}</div>
        </div>
        <div className="rounded-lg border border-border bg-gradient-to-br from-green-500/5 to-green-500/10 p-4">
          <div className="text-xs text-muted-foreground font-medium">City</div>
          <div className="text-lg font-bold text-green-600 mt-1">{data.customer.city}</div>
        </div>
        <div className="rounded-lg border border-border bg-gradient-to-br from-amber-500/5 to-amber-500/10 p-4">
          <div className="text-xs text-muted-foreground font-medium">KYC Status</div>
          <div className="mt-1">
            <StatusBadge status={data.customer.kyc_status} />
          </div>
        </div>
      </div>

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
          📋 Overview
        </button>
        <button
          onClick={() => setActiveTab("requests")}
          className={`px-4 py-3 font-medium text-sm transition-colors ${
            activeTab === "requests"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          🎯 Requests ({data.online_requests.length + data.product_requests.length})
        </button>
        <button
          onClick={() => setActiveTab("lead")}
          className={`px-4 py-3 font-medium text-sm transition-colors ${
            activeTab === "lead"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          👥 Lead
        </button>
        <button
          onClick={() => setActiveTab("invoices")}
          className={`px-4 py-3 font-medium text-sm transition-colors ${
            activeTab === "invoices"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          💰 Invoices ({data.invoices.length})
        </button>
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === "overview" && (
        <>
          {/* NEXT ACTIONS */}
          {data.next_actions.length > 0 && (
            <ERPSectionShell title="Recommended Next Actions" description="Smart suggestions">
              <div className="space-y-2">
                {data.next_actions.map((action, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-blue-50/50 rounded-lg border border-blue-200">
                    <div className="text-lg">✓</div>
                    <div className="text-sm font-medium text-blue-900">{action}</div>
                  </div>
                ))}
              </div>
            </ERPSectionShell>
          )}

          {/* TIMELINE */}
          <ERPSectionShell title="Activity Timeline" description="Complete event history">
            <div className="space-y-3">
              {data.timeline.map((event, i) => (
                <div key={i} className="flex gap-4 pb-4 border-b border-border last:border-0">
                  <div className="text-xs font-semibold text-muted-foreground min-w-fit whitespace-nowrap">
                    {new Date(event.time).toLocaleDateString()}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-foreground">{event.event}</div>
                    <div className="text-xs text-muted-foreground mt-1">{event.type}</div>
                  </div>
                </div>
              ))}
            </div>
          </ERPSectionShell>
        </>
      )}

      {/* REQUESTS TAB */}
      {activeTab === "requests" && (
        <>
          {/* ONLINE REQUESTS */}
          <ERPSectionShell title="Online Enquiries" description="Customer inquiries">
            <div className="space-y-2">
              {data.online_requests.length > 0 ? (
                data.online_requests.map((req) => (
                  <div
                    key={req.id}
                    className="border border-border rounded-lg p-4 hover:bg-muted/50 transition"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-sm">{req.request_number}</div>
                      <StatusBadge status={req.status} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {req.request_type} • {req.product_name} • ₹{req.amount}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(req.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground py-6">No online enquiries</div>
              )}
            </div>
          </ERPSectionShell>

          {/* PRODUCT REQUESTS */}
          <ERPSectionShell title="Product Requests" description="Customer product requests">
            <div className="space-y-2">
              {data.product_requests.length > 0 ? (
                data.product_requests.map((req) => (
                  <div
                    key={req.id}
                    className="border border-border rounded-lg p-4 hover:bg-muted/50 transition"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-sm">{req.product_name}</div>
                      <StatusBadge status={req.status} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {req.type} • {new Date(req.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground py-6">No product requests</div>
              )}
            </div>
          </ERPSectionShell>
        </>
      )}

      {/* LEAD TAB */}
      {activeTab === "lead" && (
        <>
          {data.crm_lead ? (
            <>
              {/* LEAD PROFILE */}
              <ERPSectionShell title="Lead Profile" description="Full lead details and pipeline">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground font-medium">Status</div>
                      <div className="mt-2">
                        <StatusBadge status={data.crm_lead.status} />
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground font-medium">Assigned To</div>
                      <div className="text-sm font-semibold mt-1">
                        {data.crm_lead.assigned_to || "Unassigned"}
                      </div>
                    </div>
                  </div>

                  {data.crm_lead.notes && (
                    <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                      <div className="text-xs text-muted-foreground font-medium mb-2">Notes</div>
                      <div className="text-sm text-foreground">{data.crm_lead.notes}</div>
                    </div>
                  )}

                  <div className="pt-2 border-t">
                    <div className="text-xs text-muted-foreground font-medium">Created</div>
                    <div className="text-sm mt-1">
                      {new Date(data.crm_lead.created_at).toLocaleString()}
                    </div>
                  </div>

                  {/* ACTION BUTTONS */}
                  <div className="flex gap-2 pt-4 border-t">
                    <button className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition">
                      ✓ Move Forward
                    </button>
                    <button className="px-4 py-2 bg-muted text-sm rounded-lg hover:bg-muted-foreground/20 transition">
                      📝 Edit Notes
                    </button>
                    <button className="px-4 py-2 bg-muted text-sm rounded-lg hover:bg-muted-foreground/20 transition">
                      👤 Reassign
                    </button>
                  </div>
                </div>
              </ERPSectionShell>

              {/* FOLLOW-UP TASKS */}
              <ERPSectionShell title="Follow-up Tasks" description="Scheduled actions">
                <div className="space-y-2">
                  <div className="text-center text-muted-foreground py-8">
                    <div className="text-sm">No follow-up tasks scheduled</div>
                    <button className="mt-4 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition">
                      + Add Follow-up Task
                    </button>
                  </div>
                </div>
              </ERPSectionShell>
            </>
          ) : (
            <ERPSectionShell title="No Lead Assigned" description="">
              <div className="text-center text-muted-foreground py-12">
                <div className="text-lg mb-4">👥</div>
                <div className="text-sm font-medium">This customer doesn't have a CRM lead yet</div>
                <button className="mt-4 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition">
                  + Create Lead
                </button>
              </div>
            </ERPSectionShell>
          )}
        </>
      )}

      {/* INVOICES TAB */}
      {activeTab === "invoices" && (
        <>
          <ERPSectionShell title="Invoices & Billing" description="Financial records">
            <div className="space-y-2">
              {data.invoices.length > 0 ? (
                data.invoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition"
                  >
                    <div>
                      <div className="font-semibold text-sm">Invoice #{invoice.id}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(invoice.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-primary">₹{invoice.amount}</div>
                      <StatusBadge status={invoice.status} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground py-6">No invoices</div>
              )}
            </div>
          </ERPSectionShell>

          {data.subscriptions && data.subscriptions.length > 0 && (
            <ERPSectionShell title="Active Subscriptions" description="Contracts">
              <div className="space-y-2">
                {data.subscriptions.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between p-4 border border-border rounded-lg"
                  >
                    <div>
                      <div className="font-semibold text-sm">{sub.plan_type}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(sub.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <StatusBadge status={sub.status} />
                  </div>
                ))}
              </div>
            </ERPSectionShell>
          )}
        </>
      )}
    </ERPPageShell>
  );
}
