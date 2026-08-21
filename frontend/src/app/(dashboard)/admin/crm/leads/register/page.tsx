"use client";

import { useState, useCallback, useEffect } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import StatusBadge from "@/components/ui/status-badge";
import { ROUTES } from "@/lib/routes";
import { apiFetch } from "@/lib/api";

interface SubscriptionData {
  customer: {
    id: number;
    name: string;
    phone: string;
    email: string;
    kyc_status: string;
  };
  leads: Array<{
    id: number;
    status: string;
    source: string;
    created_at: string;
  }>;
  subscriptions: {
    emi: Array<{
      id: number;
      subscription_number?: string;
      amount: string;
      status: string;
      created_at: string;
      plan_type: string;
    }>;
    rent: Array<{
      id: number;
      subscription_number?: string;
      amount: string;
      status: string;
      created_at: string;
      plan_type: string;
    }>;
    lease: Array<{
      id: number;
      subscription_number?: string;
      amount: string;
      status: string;
      created_at: string;
      plan_type: string;
    }>;
  };
  direct_sales: Array<{
    id: number;
    amount: string;
    status: string;
    created_at: string;
  }>;
  summary: {
    total_emi_active: number;
    total_rent_active: number;
    total_lease_active: number;
    total_direct_sales: number;
    total_revenue: string;
  };
}

export default function LeadRegisterPage() {
  const [customerId, setCustomerId] = useState("1");
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscriptionData = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<{ status: string; data: SubscriptionData }>(
        `/api/v1/admin/lead-tracker/customer/${customerId}/subscriptions/`
      );
      if (result.data) {
        setData(result.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    if (customerId) {
      fetchSubscriptionData();
    }
  }, [fetchSubscriptionData]);

  return (
    <ERPPageShell
      eyebrow="CRM"
      title="Lead Registration & Conversions"
      subtitle="Track lead registrations across all subscription types (EMI, RENT, LEASE) and direct sales"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "CRM", href: "/admin/crm" },
        { label: "Leads", href: "/admin/crm/leads" },
        { label: "Registration" },
      ]}
    >
      {/* CUSTOMER SEARCH */}
      <ERPSectionShell title="Search by Customer" description="Enter customer ID to view their lead registration and all conversions">
        <div className="flex gap-3 mb-6">
          <input
            id="lead-customer-id"
            type="number"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            placeholder="Enter customer ID"
            aria-label="Customer ID"
            className="flex-1 px-4 py-2 border border-border rounded-lg bg-background"
          />
          <button
            onClick={fetchSubscriptionData}
            disabled={loading}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition disabled:opacity-50"
          >
            {loading ? "Loading..." : "Search"}
          </button>
        </div>

        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/50 rounded-lg text-destructive text-sm" role="alert" aria-live="polite">
            {error}
          </div>
        )}
      </ERPSectionShell>

      {loading && !data ? (
        <ERPLoadingState label="Loading customer registration data..." />
      ) : data ? (
        <>
          {/* CUSTOMER HEADER */}
          <ERPSectionShell title="Customer Information" description="Linked leads and registration status">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg border border-border bg-gradient-to-br from-primary/5 to-primary/10 p-4">
                <div className="text-xs text-muted-foreground font-medium mb-2">Customer ID</div>
                <div className="text-2xl font-bold text-primary">#{data.customer.id}</div>
              </div>
              <div className="rounded-lg border border-border bg-gradient-to-br from-blue-500/5 to-blue-500/10 p-4">
                <div className="text-xs text-muted-foreground font-medium mb-2">Name</div>
                <div className="font-semibold text-lg">{data.customer.name}</div>
              </div>
              <div className="rounded-lg border border-border bg-gradient-to-br from-green-500/5 to-green-500/10 p-4">
                <div className="text-xs text-muted-foreground font-medium mb-2">Phone</div>
                <div className="font-mono text-lg">{data.customer.phone}</div>
              </div>
              <div className="rounded-lg border border-border bg-gradient-to-br from-amber-500/5 to-amber-500/10 p-4">
                <div className="text-xs text-muted-foreground font-medium mb-2">KYC Status</div>
                <div className="mt-1">
                  <StatusBadge status={data.customer.kyc_status} />
                </div>
              </div>
            </div>

            {/* LINKED LEADS */}
            <div className="rounded-lg border border-border p-4">
              <div className="font-semibold mb-3">🔗 Linked Leads</div>
              <div className="space-y-2">
                {data.leads.length > 0 ? (
                  data.leads.map((lead) => (
                    <div key={lead.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <div className="font-medium text-sm">Lead ID: {lead.id}</div>
                        <div className="text-xs text-muted-foreground">{lead.source} • {new Date(lead.created_at).toLocaleDateString()}</div>
                      </div>
                      <StatusBadge status={lead.status} />
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">No leads linked</div>
                )}
              </div>
            </div>
          </ERPSectionShell>

          {/* REVENUE SUMMARY */}
          <ERPSectionShell title="Revenue Summary" description="Total conversions and active subscriptions">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg border border-border bg-gradient-to-br from-blue-500/5 to-blue-500/10 p-4">
                <div className="text-xs text-muted-foreground font-medium mb-2">Total Active EMI</div>
                <div className="text-3xl font-bold text-blue-600">{data.summary.total_emi_active}</div>
              </div>
              <div className="rounded-lg border border-border bg-gradient-to-br from-purple-500/5 to-purple-500/10 p-4">
                <div className="text-xs text-muted-foreground font-medium mb-2">Total Active RENT/LEASE</div>
                <div className="text-3xl font-bold text-purple-600">
                  {data.summary.total_rent_active + data.summary.total_lease_active}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-gradient-to-br from-green-500/5 to-green-500/10 p-4">
                <div className="text-xs text-muted-foreground font-medium mb-2">Total Direct Sales</div>
                <div className="text-3xl font-bold text-green-600">{data.summary.total_direct_sales}</div>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-border bg-gradient-to-r from-amber-500/10 to-orange-500/10 p-4">
              <div className="text-sm text-muted-foreground">Total Revenue Generated</div>
              <div className="text-4xl font-bold text-amber-600 mt-1">₹{data.summary.total_revenue}</div>
            </div>
          </ERPSectionShell>

          {/* EMI SUBSCRIPTIONS */}
          {data.subscriptions.emi.length > 0 && (
            <ERPSectionShell title="📊 EMI Subscriptions" description={`${data.subscriptions.emi.length} advance EMI contract(s)`}>
              <div className="space-y-3">
                {data.subscriptions.emi.map((sub) => (
                  <div key={sub.id} className="p-4 border border-border rounded-lg hover:bg-muted/50 transition">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">{sub.subscription_number || `EMI #${sub.id}`}</div>
                      <StatusBadge status={sub.status} />
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Amount</div>
                        <div className="font-mono">₹{sub.amount}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Plan</div>
                        <div className="font-semibold">{sub.plan_type}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Created</div>
                        <div className="text-xs">{new Date(sub.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ERPSectionShell>
          )}

          {/* RENT SUBSCRIPTIONS */}
          {data.subscriptions.rent.length > 0 && (
            <ERPSectionShell title="🏢 Rent Subscriptions" description={`${data.subscriptions.rent.length} rent contract(s)`}>
              <div className="space-y-3">
                {data.subscriptions.rent.map((sub) => (
                  <div key={sub.id} className="p-4 border border-border rounded-lg hover:bg-muted/50 transition">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">{sub.subscription_number || `Rent #${sub.id}`}</div>
                      <StatusBadge status={sub.status} />
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Amount</div>
                        <div className="font-mono">₹{sub.amount}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Plan</div>
                        <div className="font-semibold">{sub.plan_type}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Created</div>
                        <div className="text-xs">{new Date(sub.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ERPSectionShell>
          )}

          {/* LEASE SUBSCRIPTIONS */}
          {data.subscriptions.lease.length > 0 && (
            <ERPSectionShell title="📋 Lease Subscriptions" description={`${data.subscriptions.lease.length} lease contract(s)`}>
              <div className="space-y-3">
                {data.subscriptions.lease.map((sub) => (
                  <div key={sub.id} className="p-4 border border-border rounded-lg hover:bg-muted/50 transition">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">{sub.subscription_number || `Lease #${sub.id}`}</div>
                      <StatusBadge status={sub.status} />
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Amount</div>
                        <div className="font-mono">₹{sub.amount}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Plan</div>
                        <div className="font-semibold">{sub.plan_type}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Created</div>
                        <div className="text-xs">{new Date(sub.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ERPSectionShell>
          )}

          {/* DIRECT SALES */}
          {data.direct_sales.length > 0 && (
            <ERPSectionShell title="🛍️ Direct Sales" description={`${data.direct_sales.length} direct sale(s)`}>
              <div className="space-y-3">
                {data.direct_sales.map((sale) => (
                  <div key={sale.id} className="p-4 border border-border rounded-lg hover:bg-muted/50 transition">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">Direct Sale #{sale.id}</div>
                      <StatusBadge status={sale.status} />
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Amount</div>
                        <div className="font-mono text-lg font-bold">₹{sale.amount}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Created</div>
                        <div className="text-xs">{new Date(sale.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ERPSectionShell>
          )}

          {/* NO CONVERSIONS */}
          {data.subscriptions.emi.length === 0 &&
            data.subscriptions.rent.length === 0 &&
            data.subscriptions.lease.length === 0 &&
            data.direct_sales.length === 0 && (
              <div className="rounded-lg border border-border bg-muted/50 p-8 text-center text-muted-foreground">
                <p className="text-lg">No subscriptions or sales found for this customer.</p>
                <p className="text-sm mt-2">They have been registered but not yet converted to any subscription type.</p>
              </div>
            )}
        </>
      ) : null}
    </ERPPageShell>
  );
}
