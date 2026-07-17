"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, ExternalLink, Info } from "lucide-react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { InternalComplianceProofs } from "@/components/admin/settings/compliance-policies/InternalComplianceProofs";
import { PublicPolicyGovernance } from "@/components/admin/settings/compliance-policies/PublicPolicyGovernance";
import { getBusinessProfile, type BusinessProfile } from "@/services/business-setup";
import { getBrandDirectProfile, type BrandDirectProfile } from "@/services/brand-data";

function SummaryField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-muted-foreground/60">—</p>
    </div>
  );
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground break-all">{value}</p>
    </div>
  );
}

export default function CompliancePoliciesPage() {
  const [activeTab, setActiveTab] = useState<"internal" | "public">("internal");
  const [bp, setBp] = useState<BusinessProfile | null>(null);
  const [brand, setBrand] = useState<BrandDirectProfile | null>(null);

  useEffect(() => {
    void Promise.all([
      getBusinessProfile().catch(() => null),
      getBrandDirectProfile().catch(() => null),
    ]).then(([profile, brandData]) => {
      setBp(profile);
      setBrand(brandData);
    });
  }, []);

  const displayName = brand?.display_name || bp?.trade_name || bp?.legal_name || "";
  const websiteUrl = bp?.website_url || brand?.social_links?.website_url || "";

  return (
    <ERPPageShell
      eyebrow="Settings · Legal & Compliance"
      title="Compliance & Policy Governance"
      subtitle="Manage internal legal proofs, identity documents, and public-facing policies."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Settings", href: ROUTES.admin.settings },
        { label: "Compliance & Policies" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <section className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Building2 className="h-4 w-4" />
            Business Legal Identity — Reference Panel
          </div>
          <Link
            href="/admin/settings/business-setup/profile"
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            Edit in Business Setup <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Auto-loaded from your saved Business Setup and Brand data. Use these identifiers as reference when uploading compliance documents and filling policies.
        </p>

        {bp ? (
          <>
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Identity & Statutory</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <SummaryField label="Legal Name" value={bp.legal_name} />
              <SummaryField label="Trade / Brand Name" value={displayName || bp.trade_name} />
              <SummaryField label="Business Type" value={bp.business_type?.replace(/_/g, " ")} />
              <SummaryField label="Year of Est." value={bp.year_of_establishment ? String(bp.year_of_establishment) : null} />
              <SummaryField label="GSTIN" value={bp.gstin} />
              <SummaryField label="PAN Number" value={bp.pan_number} />
              <SummaryField label="TAN Number" value={bp.tan_number} />
              <SummaryField label="CIN Number" value={bp.cin_number} />
              <SummaryField label="Udyam / MSME" value={bp.udyam_number} />
              <SummaryField label="Trade License" value={bp.trade_license_number} />
              <SummaryField label="Shop Act No." value={bp.shop_act_number} />
              <SummaryField label="Business Code" value={bp.business_code} />
            </div>

            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Authorized Signatory</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <SummaryField label="Signatory Name" value={bp.authorized_signatory_name} />
              <SummaryField label="Designation" value={bp.authorized_signatory_designation} />
            </div>

            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Banking & Payments</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <SummaryField label="Bank Name" value={bp.bank_name} />
              <SummaryField label="IFSC Code" value={bp.bank_ifsc_code} />
              <SummaryField label="Branch" value={bp.bank_branch} />
              <SummaryField label="UPI ID" value={bp.upi_id} />
            </div>

            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Contact & Brand</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <SummaryField label="Primary Email" value={bp.primary_email} />
              <SummaryField label="Primary Phone" value={bp.primary_phone} />
              <SummaryField label="Website URL" value={websiteUrl} />
              <SummaryField label="Address" value={[bp.city, bp.state, bp.postal_code].filter(Boolean).join(", ")} />
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4" />
            Business profile not configured yet.{" "}
            <Link href="/admin/settings/business-setup/profile" className="font-semibold text-primary hover:underline">
              Set up Business Profile →
            </Link>
          </div>
        )}
      </section>

      <div className="flex border-b border-border mb-6">
        <button
          onClick={() => setActiveTab("internal")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "internal"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Internal Compliance Proofs
        </button>
        <button
          onClick={() => setActiveTab("public")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "public"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Public Policy Governance
        </button>
      </div>

      <div className="min-h-[400px]">
        {activeTab === "internal" ? <InternalComplianceProofs /> : <PublicPolicyGovernance />}
      </div>
    </ERPPageShell>
  );
}
