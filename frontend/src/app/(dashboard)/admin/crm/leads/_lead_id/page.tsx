"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import StatusBadge from "@/components/ui/status-badge";
import { ROUTES } from "@/lib/routes";
import { getLeadConversionJourney } from "@/services/crm";

interface LeadDetail {
  id: number;
  name: string;
  phone: string;
  email: string;
  city: string;
  source: string;
  status: string;
  interested_product: string;
  notes: string;
  created_at: string;
  assigned_to: string | null;
  customer: {
    id: number;
    name: string;
    phone: string;
    email: string;
    kyc_status: string;
    city: string;
    created_at: string;
  } | null;
  journey: {
    online_request: boolean;
    product_request: boolean;
    subscription: boolean;
    direct_sale: boolean;
  };
}

export default function LeadDetailPage() {
  const params = useParams<{ lead_id: string }>();
  const leadId = params?.lead_id;

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLead = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      // Try to fetch from our workbench API first
      const result = await getLeadConversionJourney(leadId);
      if (result.data) {
        setLead(result.data as any);
      } else {
        setError("Lead not found");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading lead");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    loadLead();
  }, [loadLead]);

  if (loading) {
    return (
      <ERPPageShell
        eyebrow="CRM"
        title="Lead Details"
        breadcrumbs={[
          { label: "Admin", href: ROUTES.admin.dashboard },
          { label: "CRM", href: "/admin/crm" },
          { label: "Leads" },
        ]}
      >
        <ERPLoadingState label="Loading lead details..." />
      </ERPPageShell>
    );
  }

  if (error || !lead) {
    return (
      <ERPPageShell
        eyebrow="CRM"
        title="Lead Details"
        breadcrumbs={[
          { label: "Admin", href: ROUTES.admin.dashboard },
          { label: "CRM", href: "/admin/crm" },
          { label: "Leads" },
        ]}
      >
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-destructive">
          <p>{error || "Lead not found"}</p>
        </div>
      </ERPPageShell>
    );
  }

  return (
    <ERPPageShell
      eyebrow="CRM"
      title={`Lead: ${lead.name}`}
      subtitle="Lead profile with customer mapping"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "CRM", href: "/admin/crm" },
        { label: "Leads" },
        { label: lead.name },
      ]}
    >
      {/* LEAD-TO-CUSTOMER MAPPING */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* LEAD INFORMATION */}
        <ERPSectionShell title="Lead Information" description="Original lead record">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Lead ID</div>
                <div className="text-lg font-bold text-primary mt-1">{lead.id}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Status</div>
                <div className="mt-1">
                  <StatusBadge status={lead.status} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Name</div>
                <div className="font-semibold mt-1">{lead.name}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Phone</div>
                <div className="font-mono mt-1">{lead.phone}</div>
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground">Email</div>
              <div className="font-mono mt-1">{lead.email || "N/A"}</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">City</div>
                <div className="mt-1">{lead.city || "N/A"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Source</div>
                <div className="mt-1">{lead.source}</div>
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground">Created</div>
              <div className="text-sm mt-1">
                {new Date(lead.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>
        </ERPSectionShell>

        {/* CUSTOMER MAPPING */}
        {lead.customer ? (
          <ERPSectionShell title="✓ Registered Customer" description="Linked customer account">
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="text-sm font-semibold text-green-900 dark:text-green-200 mb-3">
                  Customer Successfully Mapped
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Customer ID</div>
                    <div className="text-lg font-bold text-green-600 dark:text-green-400 mt-1">
                      #{lead.customer.id}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">KYC Status</div>
                    <div className="mt-1">
                      <StatusBadge status={lead.customer.kyc_status} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Name</div>
                    <div className="font-semibold mt-1">{lead.customer.name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Phone</div>
                    <div className="font-mono mt-1">{lead.customer.phone}</div>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground">Email</div>
                  <div className="font-mono mt-1">{lead.customer.email}</div>
                </div>

                <div className="text-xs text-muted-foreground mt-4">Registered</div>
                <div className="text-sm mt-1">
                  {new Date(lead.customer.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          </ERPSectionShell>
        ) : (
          <ERPSectionShell title="⚠️ No Customer Account" description="Lead not yet converted">
            <div className="text-center py-8">
              <div className="text-4xl mb-4">🚀</div>
              <p className="text-sm text-muted-foreground mb-4">
                This lead hasn't been converted to a customer yet. When this lead submits an online enquiry or direct sale,
                a customer account will be automatically created and linked.
              </p>
              <button className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition">
                Create Customer Now
              </button>
            </div>
          </ERPSectionShell>
        )}
      </div>

      {/* LEAD JOURNEY */}
      {lead.customer && (
        <ERPSectionShell title="Lead-to-Customer Journey" description="Conversion pipeline progress">
          <div className="grid grid-cols-4 gap-4">
            <div className={`p-4 rounded-lg border-2 ${lead.journey.online_request ? "border-green-500 bg-green-50 dark:bg-green-950/20" : "border-gray-300 bg-gray-50 dark:bg-gray-900/20"}`}>
              <div className="text-2xl mb-2">{lead.journey.online_request ? "✓" : "○"}</div>
              <div className="text-xs font-semibold">Online Enquiry</div>
              <div className="text-xs text-muted-foreground mt-1">
                {lead.journey.online_request ? "Created" : "Pending"}
              </div>
            </div>

            <div className={`p-4 rounded-lg border-2 ${lead.journey.product_request ? "border-green-500 bg-green-50 dark:bg-green-950/20" : "border-gray-300 bg-gray-50 dark:bg-gray-900/20"}`}>
              <div className="text-2xl mb-2">{lead.journey.product_request ? "✓" : "○"}</div>
              <div className="text-xs font-semibold">Product Request</div>
              <div className="text-xs text-muted-foreground mt-1">
                {lead.journey.product_request ? "Created" : "Pending"}
              </div>
            </div>

            <div className={`p-4 rounded-lg border-2 ${lead.journey.subscription ? "border-green-500 bg-green-50 dark:bg-green-950/20" : "border-gray-300 bg-gray-50 dark:bg-gray-900/20"}`}>
              <div className="text-2xl mb-2">{lead.journey.subscription ? "✓" : "○"}</div>
              <div className="text-xs font-semibold">Subscription</div>
              <div className="text-xs text-muted-foreground mt-1">
                {lead.journey.subscription ? "Active" : "Pending"}
              </div>
            </div>

            <div className={`p-4 rounded-lg border-2 ${lead.journey.direct_sale ? "border-green-500 bg-green-50 dark:bg-green-950/20" : "border-gray-300 bg-gray-50 dark:bg-gray-900/20"}`}>
              <div className="text-2xl mb-2">{lead.journey.direct_sale ? "✓" : "○"}</div>
              <div className="text-xs font-semibold">Direct Sale</div>
              <div className="text-xs text-muted-foreground mt-1">
                {lead.journey.direct_sale ? "Completed" : "Pending"}
              </div>
            </div>
          </div>
        </ERPSectionShell>
      )}

      {/* LEAD DETAILS */}
      <ERPSectionShell title="Additional Information" description="Lead notes and metadata">
        {lead.notes && (
          <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="text-xs font-semibold text-blue-900 dark:text-blue-200 mb-2">Notes</div>
            <div className="text-sm text-blue-800 dark:text-blue-300">{lead.notes}</div>
          </div>
        )}

        {lead.assigned_to && (
          <div className="mb-4 p-4 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-lg">
            <div className="text-xs font-semibold text-purple-900 dark:text-purple-200 mb-2">Assigned To</div>
            <div className="text-sm text-purple-800 dark:text-purple-300">{lead.assigned_to}</div>
          </div>
        )}

        <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="text-xs font-semibold text-amber-900 dark:text-amber-200 mb-2">Interested Product</div>
          <div className="text-sm text-amber-800 dark:text-amber-300">{lead.interested_product || "Not specified"}</div>
        </div>
      </ERPSectionShell>

      {/* MAPPING EXPLANATION */}
      <ERPSectionShell title="📊 Lead-to-Customer Mapping Explained" description="How the system works">
        <div className="space-y-4">
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-4">
            <div className="font-semibold text-blue-900 dark:text-blue-200 mb-2">What is Lead Mapping?</div>
            <p className="text-sm text-blue-800 dark:text-blue-300">
              When a lead (from CRM or online form) matches an existing registered customer or triggers customer creation,
              the system automatically links them together using phone number, email, or name matching. This creates a
              complete audit trail from initial interest through final fulfillment.
            </p>
          </div>

          <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-4">
            <div className="font-semibold text-green-900 dark:text-green-200 mb-2">Lead Status Progression</div>
            <div className="text-sm text-green-800 dark:text-green-300">
              <div>• <strong>NEW</strong> - Lead created from form or import</div>
              <div>• <strong>CONTACTED</strong> - Lead submitted online enquiry</div>
              <div>• <strong>QUALIFIED</strong> - Quote sent, product interest confirmed</div>
              <div>• <strong>PROPOSAL_SENT</strong> - Quote awaiting acceptance</div>
              <div>• <strong>CONVERTED</strong> - Customer completed purchase (subscription or direct sale)</div>
            </div>
          </div>

          {lead.customer && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-4">
              <div className="font-semibold text-emerald-900 dark:text-emerald-200 mb-2">✓ This Lead is Mapped</div>
              <p className="text-sm text-emerald-800 dark:text-emerald-300">
                Lead ID <strong>#{lead.id}</strong> is connected to Customer ID <strong>#{lead.customer.id}</strong>.
                All future activity for this customer will be tracked under this lead record.
              </p>
            </div>
          )}
        </div>
      </ERPSectionShell>
    </ERPPageShell>
  );
}
