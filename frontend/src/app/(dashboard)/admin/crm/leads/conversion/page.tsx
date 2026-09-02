"use client";

import { useState, useCallback, useEffect } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import StatusBadge from "@/components/ui/status-badge";
import { ROUTES } from "@/lib/routes";
import { getLeadConversionJourney, processLeadOnlineEnquiry, processLeadDirectSale, LeadConversionJourney } from "@/services/crm";



export default function LeadConversionPage() {
  const [formData, setFormData] = useState({
    phone: "9000090000",
    name: "Amrita Roy",
    email: "amrita@gmail.com",
    product_name: "Sofa Set",
    amount: "50000",
  });

  const [journey, setJourney] = useState<LeadConversionJourney | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"form" | "result">("form");

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const fetchJourney = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await getLeadConversionJourney(formData.phone);
      if (result.data) {
        setJourney(result.data);
        setActiveTab("result");
      } else {
        setError("Lead not found for this phone number");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch lead journey");
    } finally {
      setLoading(false);
    }
  }, [formData.phone]);

  const processOnlineEnquiry = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await processLeadOnlineEnquiry({
        phone: formData.phone,
        name: formData.name,
        email: formData.email,
        product_name: formData.product_name,
        amount: formData.amount,
        request_number: `ONL-${Date.now()}`,
      });

      if (result.status === "success") {
        setSuccess("✓ Lead converted to customer and online enquiry processed successfully!");
        await fetchJourney();
        setActiveTab("result");
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
    setSuccess(null);
    try {
      const result = await processLeadDirectSale({
        phone: formData.phone,
        name: formData.name,
        email: formData.email,
        product_name: formData.product_name,
        amount: formData.amount,
      });

      if (result.status === "success") {
        setSuccess("✓ Lead converted to customer and direct sale recorded successfully!");
        await fetchJourney();
        setActiveTab("result");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process direct sale");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ERPPageShell
      eyebrow="CRM"
      title="Lead to Customer Conversion"
      subtitle="Convert leads to registered customers with automatic mapping"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "CRM", href: "/admin/crm" },
        { label: "Leads", href: "/admin/crm/leads" },
        { label: "Conversion" },
      ]}
    >
      {/* TABS */}
      <div className="flex gap-2 mb-6 border-b border-border">
        <button
          onClick={() => setActiveTab("form")}
          className={`px-4 py-3 font-medium text-sm transition-colors ${
            activeTab === "form"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          📋 Conversion Form
        </button>
        <button
          onClick={() => setActiveTab("result")}
          className={`px-4 py-3 font-medium text-sm transition-colors ${
            activeTab === "result"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          📊 Conversion Journey
        </button>
      </div>

      {/* FORM TAB */}
      {activeTab === "form" && (
        <>
          <ERPSectionShell
            title="Lead Information"
            description="Enter lead details to convert to registered customer"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="text-sm font-medium block mb-2">Phone Number *</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                  placeholder="10-digit mobile number"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-2">Customer Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-2">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                  placeholder="customer@example.com"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-2">Product Name</label>
                <input
                  type="text"
                  value={formData.product_name}
                  onChange={(e) => handleInputChange("product_name", e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                  placeholder="Product name"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium block mb-2">Amount</label>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => handleInputChange("amount", e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                  placeholder="50000"
                />
              </div>
            </div>

            {error && (
              <div className="mb-4 p-4 bg-destructive/10 border border-destructive/50 rounded-lg text-destructive text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm dark:bg-green-950/20 dark:text-green-300">
                {success}
              </div>
            )}

            <div className="flex gap-3 flex-wrap">
              <button
                onClick={fetchJourney}
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 font-medium"
              >
                {loading ? "Loading..." : "🔍 Check Journey"}
              </button>
              <button
                onClick={processOnlineEnquiry}
                disabled={loading}
                className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition disabled:opacity-50 font-medium"
              >
                {loading ? "Processing..." : "📝 Online Enquiry"}
              </button>
              <button
                onClick={processDirectSale}
                disabled={loading}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 font-medium"
              >
                {loading ? "Processing..." : "✓ Direct Sale"}
              </button>
            </div>
          </ERPSectionShell>

          {/* HOW IT WORKS */}
          <ERPSectionShell title="How Lead-to-Customer Conversion Works" description="Step-by-step process">
            <div className="space-y-4">
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-4">
                <div className="font-semibold text-blue-900 dark:text-blue-200 mb-2">🔍 Check Journey</div>
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  Search for existing lead by phone number. Shows current lead status and any linked customer.
                </p>
              </div>

              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-4">
                <div className="font-semibold text-amber-900 dark:text-amber-200 mb-2">📝 Online Enquiry</div>
                <p className="text-sm text-amber-800 dark:text-amber-300 mb-3">
                  Convert lead to customer when they submit an online enquiry:
                </p>
                <ul className="text-sm text-amber-800 dark:text-amber-300 space-y-1 ml-4">
                  <li>✓ Auto-creates customer account if needed</li>
                  <li>✓ Links lead to customer via phone matching</li>
                  <li>✓ Creates OnlineRequest record</li>
                  <li>✓ Updates lead status: NEW → CONTACTED</li>
                </ul>
              </div>

              <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-4">
                <div className="font-semibold text-green-900 dark:text-green-200 mb-2">✓ Direct Sale</div>
                <p className="text-sm text-green-800 dark:text-green-300 mb-3">
                  Convert lead to customer for direct sales:
                </p>
                <ul className="text-sm text-green-800 dark:text-green-300 space-y-1 ml-4">
                  <li>✓ Creates customer account (auto-generated credentials)</li>
                  <li>✓ Issues a numbered direct sale document</li>
                  <li>✓ Updates lead status: NEW → CONVERTED</li>
                  <li>✓ Complete order tracking in customer profile</li>
                </ul>
              </div>
            </div>
          </ERPSectionShell>
        </>
      )}

      {/* RESULT TAB */}
      {activeTab === "result" && (
        <>
          {loading ? (
            <ERPLoadingState label="Loading conversion journey..." />
          ) : journey ? (
            <>
              {/* LEAD INFORMATION */}
              <ERPSectionShell title="Lead Information" description="Original lead record">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground font-medium mb-2">Lead ID</div>
                    <div className="text-2xl font-bold text-primary">{journey.id}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground font-medium mb-2">Status</div>
                    <StatusBadge status={journey.status} />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground font-medium mb-2">Name</div>
                    <div className="font-semibold">{journey.name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground font-medium mb-2">Phone</div>
                    <div className="font-mono">{journey.phone}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground font-medium mb-2">Email</div>
                    <div className="font-mono text-sm">{journey.email || "N/A"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground font-medium mb-2">Source</div>
                    <div>{journey.source}</div>
                  </div>
                </div>
              </ERPSectionShell>

              {/* CUSTOMER MAPPING */}
              {journey.customer ? (
                <ERPSectionShell title="✓ Registered Customer" description="Successfully mapped to customer account">
                  <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <div className="text-xs text-muted-foreground font-medium mb-2">Customer ID</div>
                        <div className="text-3xl font-bold text-green-600 dark:text-green-400">#{journey.customer.id}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground font-medium mb-2">KYC Status</div>
                        <StatusBadge status={journey.customer.kyc_status} />
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground font-medium mb-2">Customer Name</div>
                        <div className="font-semibold text-lg">{journey.customer.name}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground font-medium mb-2">Email</div>
                        <div className="font-mono text-sm">{journey.customer.email}</div>
                      </div>
                    </div>
                  </div>
                </ERPSectionShell>
              ) : (
                <ERPSectionShell title="⚠️ No Customer Mapped" description="Lead not yet converted">
                  <div className="text-center py-8 text-muted-foreground">
                    <p>This lead hasn't been converted to a customer yet.</p>
                  </div>
                </ERPSectionShell>
              )}

              {/* JOURNEY PIPELINE */}
              {journey.customer && (
                <ERPSectionShell title="Lead-to-Customer Journey" description="Complete conversion pipeline">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div
                      className={`p-4 rounded-lg border-2 ${
                        journey.online_request
                          ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                          : "border-gray-300 bg-gray-50 dark:bg-gray-900/20"
                      }`}
                    >
                      <div className="text-2xl mb-2">{journey.online_request ? "✓" : "○"}</div>
                      <div className="font-semibold text-sm">Online Enquiry</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {journey.online_request ? `#${journey.online_request.request_number}` : "Pending"}
                      </div>
                    </div>

                    <div
                      className={`p-4 rounded-lg border-2 ${
                        journey.product_request
                          ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                          : "border-gray-300 bg-gray-50 dark:bg-gray-900/20"
                      }`}
                    >
                      <div className="text-2xl mb-2">{journey.product_request ? "✓" : "○"}</div>
                      <div className="font-semibold text-sm">Product Request</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {journey.product_request ? "Created" : "Pending"}
                      </div>
                    </div>

                    <div
                      className={`p-4 rounded-lg border-2 ${
                        journey.subscription
                          ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                          : "border-gray-300 bg-gray-50 dark:bg-gray-900/20"
                      }`}
                    >
                      <div className="text-2xl mb-2">{journey.subscription ? "✓" : "○"}</div>
                      <div className="font-semibold text-sm">Subscription</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {journey.subscription ? "Active" : "Pending"}
                      </div>
                    </div>

                    <div
                      className={`p-4 rounded-lg border-2 ${
                        journey.direct_sale
                          ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                          : "border-gray-300 bg-gray-50 dark:bg-gray-900/20"
                      }`}
                    >
                      <div className="text-2xl mb-2">{journey.direct_sale ? "✓" : "○"}</div>
                      <div className="font-semibold text-sm">Direct Sale</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {journey.direct_sale ? "Completed" : "Pending"}
                      </div>
                    </div>
                  </div>
                </ERPSectionShell>
              )}

              {/* NEXT STEPS */}
              <ERPSectionShell title="Next Steps" description="What to do after conversion">
                <div className="space-y-3">
                  <a
                    href={`/admin/crm/leads/${journey.id}`}
                    className="block p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-950/30 transition"
                  >
                    <div className="font-semibold text-blue-900 dark:text-blue-200">📄 View Lead Details</div>
                    <div className="text-sm text-blue-800 dark:text-blue-300 mt-1">See full CRM lead profile and follow-up tasks</div>
                  </a>
                  {journey.customer && (
                    <a
                      href={`/admin/customers/${journey.customer.id}`}
                      className="block p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-950/30 transition"
                    >
                      <div className="font-semibold text-green-900 dark:text-green-200">👤 View Customer Profile</div>
                      <div className="text-sm text-green-800 dark:text-green-300 mt-1">Access customer workbench with all requests and orders</div>
                    </a>
                  )}
                </div>
              </ERPSectionShell>
            </>
          ) : (
            <div className="rounded-lg border border-border bg-muted/50 p-8 text-center text-muted-foreground">
              <p>No journey data. Fill the form and click a conversion button to see results.</p>
            </div>
          )}
        </>
      )}
    </ERPPageShell>
  );
}
