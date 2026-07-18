"use client";

import { useState, useCallback } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import StatusBadge from "@/components/ui/status-badge";
import { ROUTES } from "@/lib/routes";
import { apiFetch } from "@/lib/api";

type WorkflowStep = "lead" | "online_enquiry" | "product_request" | "fulfillment";

interface LeadJourney {
  id: number;
  name: string;
  phone: string;
  email: string;
  status: string;
  source: string;
  created_at: string;
  customer?: {
    id: number;
    name: string;
    phone: string;
  };
  online_request?: {
    id: number;
    request_number: string;
    status: string;
  };
  product_request?: {
    id: number;
    type: string;
    status: string;
  };
  subscription?: {
    id: number;
    plan_type: string;
    status: string;
  };
  direct_sale?: {
    id: number;
    amount: string;
    status: string;
  };
}

export default function LeadWorkflowPage() {
  const [formData, setFormData] = useState({
    phone: "9000090000",
    name: "Amrita Roy",
    email: "amrita@gmail.com",
    product_name: "Sofa Set",
    amount: "50000",
  });

  const [journey, setJourney] = useState<LeadJourney | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<WorkflowStep>("lead");

  const handleFormChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const fetchJourney = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<{ status: string; data: LeadJourney | null }>(
        `/api/v1/admin/lead-workflow/journey/?phone=${formData.phone}`
      );
      setJourney(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch journey");
    } finally {
      setLoading(false);
    }
  }, [formData.phone]);

  const processOnlineEnquiry = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<any>(`/api/v1/admin/lead-workflow/online-enquiry/`, {
        method: "POST",
        body: {
          phone: formData.phone,
          name: formData.name,
          email: formData.email,
          product_name: formData.product_name,
          amount: formData.amount,
          request_number: `ONL-${Date.now()}`,
        },
      });

      if (result.status === "success") {
        await fetchJourney();
        setActiveStep("online_enquiry");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process enquiry");
    } finally {
      setLoading(false);
    }
  };

  const processDirectSale = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<any>(`/api/v1/admin/lead-workflow/direct-sale/`, {
        method: "POST",
        body: {
          phone: formData.phone,
          name: formData.name,
          email: formData.email,
          product_name: formData.product_name,
          amount: formData.amount,
        },
      });

      if (result.status === "success") {
        await fetchJourney();
        setActiveStep("fulfillment");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process direct sale");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ERPPageShell
      eyebrow="Workbench"
      title="Lead Conversion Workflow"
      subtitle="Complete lead journey from enquiry to fulfillment"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Workbench", href: "/admin/workbench" },
        { label: "Lead Workflow" },
      ]}
    >
      {/* WORKFLOW DIAGRAM */}
      <ERPSectionShell title="Lead Journey Workflow" description="Automated lead → customer conversion pipeline">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-8">
          {/* Step 1: Lead */}
          <div
            onClick={() => setActiveStep("lead")}
            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
              activeStep === "lead"
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/50"
            }`}
          >
            <div className="text-sm font-semibold text-center">1. Lead Created</div>
            <div className="text-xs text-muted-foreground text-center mt-2">Online form / API</div>
            <div className="mt-3 pt-3 border-t text-xs text-center">
              {journey ? (
                <span className="text-green-600 font-semibold">✓ Exists</span>
              ) : (
                <span className="text-amber-600">Pending</span>
              )}
            </div>
          </div>

          {/* Arrow */}
          <div className="flex items-center justify-center">
            <div className="text-2xl text-muted-foreground">→</div>
          </div>

          {/* Step 2: Online Enquiry */}
          <div
            onClick={() => setActiveStep("online_enquiry")}
            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
              activeStep === "online_enquiry"
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/50"
            }`}
          >
            <div className="text-sm font-semibold text-center">2. Online Enquiry</div>
            <div className="text-xs text-muted-foreground text-center mt-2">Customer interest</div>
            <div className="mt-3 pt-3 border-t text-xs text-center">
              {journey?.online_request ? (
                <span className="text-green-600 font-semibold">✓ Created</span>
              ) : (
                <span className="text-muted-foreground">Not yet</span>
              )}
            </div>
          </div>

          {/* Arrow */}
          <div className="flex items-center justify-center">
            <div className="text-2xl text-muted-foreground">→</div>
          </div>

          {/* Step 3: Product Request */}
          <div
            onClick={() => setActiveStep("product_request")}
            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
              activeStep === "product_request"
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/50"
            }`}
          >
            <div className="text-sm font-semibold text-center">3. Product Request</div>
            <div className="text-xs text-muted-foreground text-center mt-2">Quote accepted</div>
            <div className="mt-3 pt-3 border-t text-xs text-center">
              {journey?.product_request ? (
                <span className="text-green-600 font-semibold">✓ Created</span>
              ) : (
                <span className="text-muted-foreground">Pending</span>
              )}
            </div>
          </div>

          {/* Arrow */}
          <div className="flex items-center justify-center">
            <div className="text-2xl text-muted-foreground">→</div>
          </div>

          {/* Step 4: Fulfillment */}
          <div
            onClick={() => setActiveStep("fulfillment")}
            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
              activeStep === "fulfillment"
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/50"
            }`}
          >
            <div className="text-sm font-semibold text-center">4. Fulfillment</div>
            <div className="text-xs text-muted-foreground text-center mt-2">Subscription / Sale</div>
            <div className="mt-3 pt-3 border-t text-xs text-center">
              {journey?.subscription || journey?.direct_sale ? (
                <span className="text-green-600 font-semibold">✓ Completed</span>
              ) : (
                <span className="text-muted-foreground">Pending</span>
              )}
            </div>
          </div>
        </div>
      </ERPSectionShell>

      {/* TEST FORM */}
      <ERPSectionShell title="Test Lead Workflow" description="Enter customer details to test automatic conversion">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="text-sm font-medium">Phone Number *</label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => handleFormChange("phone", e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg bg-background"
              placeholder="9000090000"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Customer Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleFormChange("name", e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg bg-background"
              placeholder="Amrita Roy"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleFormChange("email", e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg bg-background"
              placeholder="customer@example.com"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Product Name</label>
            <input
              type="text"
              value={formData.product_name}
              onChange={(e) => handleFormChange("product_name", e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg bg-background"
              placeholder="Sofa Set"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Amount</label>
            <input
              type="number"
              value={formData.amount}
              onChange={(e) => handleFormChange("amount", e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg bg-background"
              placeholder="50000"
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/50 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={fetchJourney}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
          >
            {loading ? "Loading..." : "Check Journey"}
          </button>
          <button
            onClick={processOnlineEnquiry}
            disabled={loading}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition disabled:opacity-50"
          >
            {loading ? "Processing..." : "Process Online Enquiry"}
          </button>
          <button
            onClick={processDirectSale}
            disabled={loading}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition disabled:opacity-50"
          >
            {loading ? "Processing..." : "Process Direct Sale"}
          </button>
        </div>
      </ERPSectionShell>

      {/* JOURNEY DISPLAY */}
      {journey && (
        <ERPSectionShell title="Lead Journey Details" description="Complete conversion pipeline">
          <div className="space-y-4">
            {/* Lead Info */}
            <div className="rounded-lg border border-border bg-gradient-to-br from-blue-500/5 to-blue-500/10 p-4">
              <div className="font-semibold mb-3">Lead Information</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Name</div>
                  <div className="font-medium">{journey.name}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Phone</div>
                  <div className="font-medium">{journey.phone}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Email</div>
                  <div className="font-medium">{journey.email || "N/A"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className="mt-1">
                    <StatusBadge status={journey.status} />
                  </div>
                </div>
              </div>
            </div>

            {/* Customer Info */}
            {journey.customer && (
              <div className="rounded-lg border border-border bg-gradient-to-br from-green-500/5 to-green-500/10 p-4">
                <div className="font-semibold mb-3">✓ Customer Registered</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Customer ID</div>
                    <div className="font-medium">{journey.customer.id}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Name</div>
                    <div className="font-medium">{journey.customer.name}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Online Request */}
            {journey.online_request && (
              <div className="rounded-lg border border-border bg-gradient-to-br from-amber-500/5 to-amber-500/10 p-4">
                <div className="font-semibold mb-3">✓ Online Enquiry Processed</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Request #</div>
                    <div className="font-medium">{journey.online_request.request_number}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Status</div>
                    <div className="mt-1">
                      <StatusBadge status={journey.online_request.status} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Product Request */}
            {journey.product_request && (
              <div className="rounded-lg border border-border bg-gradient-to-br from-purple-500/5 to-purple-500/10 p-4">
                <div className="font-semibold mb-3">✓ Product Request Created</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Type</div>
                    <div className="font-medium">{journey.product_request.type}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Status</div>
                    <div className="mt-1">
                      <StatusBadge status={journey.product_request.status} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Fulfillment */}
            {(journey.subscription || journey.direct_sale) && (
              <div className="rounded-lg border border-border bg-gradient-to-br from-emerald-500/5 to-emerald-500/10 p-4">
                <div className="font-semibold mb-3">✓ Fulfillment Completed</div>
                <div className="grid grid-cols-2 gap-4">
                  {journey.subscription && (
                    <>
                      <div>
                        <div className="text-xs text-muted-foreground">Subscription</div>
                        <div className="font-medium">{journey.subscription.plan_type}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Status</div>
                        <div className="mt-1">
                          <StatusBadge status={journey.subscription.status} />
                        </div>
                      </div>
                    </>
                  )}
                  {journey.direct_sale && (
                    <>
                      <div>
                        <div className="text-xs text-muted-foreground">Direct Sale</div>
                        <div className="font-medium">₹{journey.direct_sale.amount}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Status</div>
                        <div className="mt-1">
                          <StatusBadge status={journey.direct_sale.status} />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </ERPSectionShell>
      )}

      {/* WORKFLOW EXPLANATION */}
      <ERPSectionShell title="How It Works" description="Automated lead-to-customer conversion flow">
        <div className="space-y-4">
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4">
            <div className="font-semibold text-blue-900 dark:text-blue-200 mb-2">Step 1: Lead Creation</div>
            <p className="text-sm text-blue-800 dark:text-blue-300">
              When a customer shows interest (online form, phone call, etc.), a lead is created with their phone, name, and email.
            </p>
          </div>

          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4">
            <div className="font-semibold text-amber-900 dark:text-amber-200 mb-2">Step 2: Online Enquiry</div>
            <p className="text-sm text-amber-800 dark:text-amber-300 mb-2">
              When the same customer submits an online enquiry, the system automatically:
            </p>
            <ul className="list-disc list-inside text-sm text-amber-800 dark:text-amber-300">
              <li>Checks if they exist as a customer (by phone/email)</li>
              <li>Creates a new customer if they don't exist</li>
              <li>Links the lead to the customer</li>
              <li>Creates an OnlineRequest record</li>
              <li>Updates the lead status to "CONTACTED"</li>
            </ul>
          </div>

          <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-4">
            <div className="font-semibold text-purple-900 dark:text-purple-200 mb-2">Step 3: Product Request</div>
            <p className="text-sm text-purple-800 dark:text-purple-300">
              When a product quote is accepted, a ProductRequest is created and automatically linked to the lead.
              The lead status progresses to "QUALIFIED" → "PROPOSAL_SENT" based on workflow stage.
            </p>
          </div>

          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-4">
            <div className="font-semibold text-emerald-900 dark:text-emerald-200 mb-2">Step 4: Fulfillment</div>
            <p className="text-sm text-emerald-800 dark:text-emerald-300">
              When the customer receives their subscription or direct sale is completed, the lead is marked as "CONVERTED" and
              linked to the fulfillment record (Subscription or DirectSale).
            </p>
          </div>
        </div>
      </ERPSectionShell>

      {/* EXAMPLE WORKFLOW */}
      <ERPSectionShell title="Example: Amrita Roy's Journey" description="Real workflow example">
        <div className="space-y-3">
          <div className="flex gap-4 pb-4 border-b border-border">
            <div className="text-3xl">1️⃣</div>
            <div>
              <div className="font-semibold">Lead Created</div>
              <div className="text-sm text-muted-foreground">Amrita submits online enquiry form with phone 9000090000</div>
            </div>
          </div>

          <div className="flex gap-4 pb-4 border-b border-border">
            <div className="text-3xl">2️⃣</div>
            <div>
              <div className="font-semibold">Automatic Customer Registration</div>
              <div className="text-sm text-muted-foreground">System creates Customer account linked to lead by phone</div>
            </div>
          </div>

          <div className="flex gap-4 pb-4 border-b border-border">
            <div className="text-3xl">3️⃣</div>
            <div>
              <div className="font-semibold">Online Enquiry Processed</div>
              <div className="text-sm text-muted-foreground">OnlineRequest created (OSI-001), lead status → CONTACTED</div>
            </div>
          </div>

          <div className="flex gap-4 pb-4 border-b border-border">
            <div className="text-3xl">4️⃣</div>
            <div>
              <div className="font-semibold">Quote & Product Request</div>
              <div className="text-sm text-muted-foreground">Admin sends quote, Amrita accepts → ProductRequest created</div>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="text-3xl">5️⃣</div>
            <div>
              <div className="font-semibold">Fulfillment & Lead Conversion</div>
              <div className="text-sm text-muted-foreground">Sofa delivered, subscription/sale completed → Lead marked CONVERTED</div>
            </div>
          </div>
        </div>
      </ERPSectionShell>
    </ERPPageShell>
  );
}
