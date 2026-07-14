"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import FormActions from "@/components/ui/FormActions";
import PageHeader from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/operations";
import { WorkspaceNotice } from "@/components/ui/role-workspace";
import { invalidateAfterBusinessSetupMutation } from "@/lib/operational-query-invalidation";
import { ApiError } from "@/lib/api";

import {
  getBusinessProfile,
  saveBusinessProfile,
  type BusinessProfile,
} from "@/services/business-setup";

import {
  getAdminPublicBusinessProfile,
  saveAdminPublicBusinessProfile,
  type PublicBusinessProfile,
} from "@/services/public-site";

import {
  getBrandDirectProfile,
  saveBrandDirectProfile,
  type BrandDirectProfile,
} from "@/services/brand-data";

type UnifiedProfile = {
  // Formal Identity (BusinessProfile)
  legal_name: string;
  trade_name: string;
  business_code: string;
  gstin: string;
  pan_number: string;
  logo_url: string;

  // Brand Identity (Public / Brand)
  display_name: string;
  tagline: string;
  hero_title: string;
  hero_subtitle: string;
  public_logo_url: string;

  // Contact (BusinessProfile)
  primary_email: string;
  primary_phone: string;
  alternate_phone: string;

  // Contact (Public / Brand)
  support_email: string;
  support_phone: string;
  whatsapp_phone: string;

  // Social Links
  website_url: string;
  whatsapp_link: string;
  facebook_url: string;
  instagram_url: string;
  youtube_url: string;
  justdial_url: string;

  // Formal Address (BusinessProfile)
  address_line_1: string;
  address_line_2: string;
  landmark: string;
  city: string;
  district: string;
  state: string;
  postal_code: string;
  country: string;

  // Public Address & Location (Public / Brand)
  address_text: string;
  map_url: string;
  business_hours: string;

  // Document Settings (BusinessProfile)
  invoice_prefix: string;
  receipt_prefix: string;
  default_currency_code: string;
  timezone_name: string;

  // Status
  is_active: boolean;
};

const initialForm: UnifiedProfile = {
  legal_name: "", trade_name: "", business_code: "", gstin: "", pan_number: "", logo_url: "",
  display_name: "", tagline: "", hero_title: "", hero_subtitle: "", public_logo_url: "",
  primary_email: "", primary_phone: "", alternate_phone: "",
  support_email: "", support_phone: "", whatsapp_phone: "",
  website_url: "", whatsapp_link: "", facebook_url: "", instagram_url: "", youtube_url: "", justdial_url: "",
  address_line_1: "", address_line_2: "", landmark: "", city: "", district: "", state: "", postal_code: "", country: "India",
  address_text: "", map_url: "", business_hours: "",
  invoice_prefix: "", receipt_prefix: "", default_currency_code: "INR", timezone_name: "Asia/Kolkata",
  is_active: true,
};

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const parts = Object.entries(error.fieldErrors).flatMap(([key, messages]) =>
      messages.map((msg) => (key === "non_field_errors" ? msg : `${key}: ${msg}`))
    );
    if (parts.length > 0) return parts.join(" ");
    return error.readableMessage || error.message;
  }
  return error instanceof Error ? error.message : "Failed to save profile.";
}

export default function UnifiedBusinessProfilePage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<UnifiedProfile>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  async function loadProfiles() {
    try {
      setLoading(true);
      setMessage(null);

      const [bp, pub, brand] = await Promise.all([
        getBusinessProfile().catch(() => null),
        getAdminPublicBusinessProfile().catch(() => null),
        getBrandDirectProfile().catch(() => null),
      ]);

      setForm({
        ...initialForm,
        // Map BP
        legal_name: bp?.legal_name || "",
        trade_name: bp?.trade_name || "",
        business_code: bp?.business_code || "",
        gstin: bp?.gstin || "",
        pan_number: bp?.pan_number || "",
        logo_url: bp?.logo_url || "",
        primary_email: bp?.primary_email || "",
        primary_phone: bp?.primary_phone || "",
        alternate_phone: bp?.alternate_phone || "",
        website_url: bp?.website_url || brand?.social_links?.website_url || pub?.facebook_url /* fallback */ || "",
        address_line_1: bp?.address_line_1 || "",
        address_line_2: bp?.address_line_2 || "",
        landmark: bp?.landmark || "",
        city: bp?.city || "",
        district: bp?.district || "",
        state: bp?.state || "",
        postal_code: bp?.postal_code || "",
        country: bp?.country || "India",
        invoice_prefix: bp?.invoice_prefix || "",
        receipt_prefix: bp?.receipt_prefix || "",
        default_currency_code: bp?.default_currency_code || "INR",
        timezone_name: bp?.timezone_name || "Asia/Kolkata",
        is_active: bp?.is_active ?? pub?.is_active ?? true,

        // Map Public & Brand (Brand takes precedence for display strings if pub is empty)
        display_name: pub?.display_name || brand?.display_name || "",
        tagline: pub?.tagline || brand?.tagline || "",
        hero_title: pub?.hero_title || "",
        hero_subtitle: pub?.hero_subtitle || brand?.hero_subtitle || "",
        public_logo_url: pub?.public_logo_url || brand?.public_logo_url || "",
        support_email: pub?.support_email || brand?.support_email || "",
        support_phone: pub?.support_phone || brand?.support_phone || "",
        whatsapp_phone: pub?.whatsapp_phone || brand?.whatsapp_phone || "",
        whatsapp_link: pub?.whatsapp_link || brand?.social_links?.whatsapp_url || "",
        facebook_url: pub?.facebook_url || brand?.social_links?.facebook_url || "",
        instagram_url: pub?.instagram_url || brand?.social_links?.instagram_url || "",
        youtube_url: pub?.youtube_url || brand?.social_links?.youtube_url || "",
        justdial_url: brand?.social_links?.justdial_url || "",
        address_text: pub?.address_text || brand?.address_text || "",
        map_url: pub?.map_url || brand?.map_url || "",
        business_hours: pub?.business_hours || brand?.business_hours || "",
      });
    } catch (error) {
      setMessage({ text: toErrorMessage(error), type: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfiles();
  }, []);

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value, type } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? (event.target as HTMLInputElement).checked : value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      // 1. Business Profile Payload
      const bpPayload: Partial<BusinessProfile> = {
        legal_name: form.legal_name,
        trade_name: form.trade_name,
        business_code: form.business_code,
        primary_email: form.primary_email,
        primary_phone: form.primary_phone,
        alternate_phone: form.alternate_phone,
        website_url: form.website_url,
        address_line_1: form.address_line_1,
        address_line_2: form.address_line_2,
        landmark: form.landmark,
        city: form.city,
        district: form.district,
        state: form.state,
        postal_code: form.postal_code,
        country: form.country,
        gstin: form.gstin,
        pan_number: form.pan_number,
        invoice_prefix: form.invoice_prefix,
        receipt_prefix: form.receipt_prefix,
        default_currency_code: form.default_currency_code,
        timezone_name: form.timezone_name,
        logo_url: form.logo_url,
        is_active: form.is_active,
      };

      // 2. Public Profile Payload
      const pubPayload: Partial<PublicBusinessProfile> = {
        display_name: form.display_name,
        tagline: form.tagline,
        hero_title: form.hero_title,
        hero_subtitle: form.hero_subtitle,
        support_phone: form.support_phone,
        support_email: form.support_email,
        whatsapp_phone: form.whatsapp_phone,
        whatsapp_link: form.whatsapp_link,
        facebook_url: form.facebook_url,
        instagram_url: form.instagram_url,
        youtube_url: form.youtube_url,
        address_text: form.address_text,
        map_url: form.map_url,
        business_hours: form.business_hours,
        public_logo_url: form.public_logo_url,
        is_active: form.is_active,
      };

      // 3. Brand Data Payload
      const brandPayload: Partial<BrandDirectProfile & BrandDirectProfile["social_links"]> = {
        display_name: form.display_name,
        tagline: form.tagline,
        hero_subtitle: form.hero_subtitle,
        support_phone: form.support_phone,
        whatsapp_phone: form.whatsapp_phone,
        support_email: form.support_email,
        address_text: form.address_text,
        business_hours: form.business_hours,
        map_url: form.map_url,
        public_logo_url: form.public_logo_url,
        facebook_url: form.facebook_url,
        instagram_url: form.instagram_url,
        youtube_url: form.youtube_url,
        justdial_url: form.justdial_url,
        website_url: form.website_url,
        whatsapp_url: form.whatsapp_link, // Mapped field
      };

      await Promise.all([
        saveBusinessProfile(bpPayload),
        saveAdminPublicBusinessProfile(pubPayload).catch((e) => { console.warn("Public Profile API missing/error", e); return null; }),
        saveBrandDirectProfile(brandPayload).catch((e) => { console.warn("Brand Data API missing/error", e); return null; }),
      ]);

      setMessage({ text: "Unified business and brand profile saved successfully.", type: "success" });
      await invalidateAfterBusinessSetupMutation(queryClient);
    } catch (error) {
      setMessage({ text: toErrorMessage(error), type: "error" });
    } finally {
      setSaving(false);
    }
  }

  function InputField({ label, name, placeholder, multiline = false, hint, type = "text" }: { label: string; name: keyof UnifiedProfile; placeholder?: string; multiline?: boolean; hint?: string; type?: string }) {
    const cls = "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm";
    return (
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
        {multiline ? (
          <textarea name={name} value={String(form[name])} onChange={handleChange} placeholder={placeholder} disabled={loading || saving} className={`${cls} min-h-[80px] resize-none`} rows={3} />
        ) : (
          <input type={type} name={name} value={String(form[name])} onChange={handleChange} placeholder={placeholder} disabled={loading || saving} className={cls} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business & Brand Setup"
        description="Unified workbench for your formal business identity, public site copy, and brand social data."
      />
      <BusinessSetupLinks />

      {loading ? <LoadingBlock label="Loading unified profile..." /> : null}

      {message ? (
        <div className={`rounded-xl border p-4 text-sm shadow-sm ${message.type === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
          {message.text}
        </div>
      ) : null}

      {!loading && (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
          <section className="grid gap-5 lg:grid-cols-2">
            <FormSection title="Legal Identity" description="Statutory identifiers, legal name, and formal setup for operational documents (Invoices, Receipts).">
              <div className="text-base font-semibold text-foreground">Formal Registration</div>
              <div className="mt-4 grid gap-4">
                <InputField label="Legal Name" name="legal_name" placeholder="E.g., Subidha Furniture Private Limited" />
                <InputField label="Trade Name" name="trade_name" placeholder="Trade name" />
                <InputField label="Business Code" name="business_code" placeholder="Internal business code" />
                <InputField label="GSTIN" name="gstin" placeholder="GSTIN" />
                <InputField label="PAN Number" name="pan_number" placeholder="PAN number" />
              </div>
            </FormSection>

            <FormSection title="Brand & Public Display" description="Public-facing business name, tagline, and copy shown on your website and receipts.">
              <div className="text-base font-semibold text-foreground">Brand Assets</div>
              <div className="mt-4 grid gap-4">
                <InputField label="Display Name (Brand Name)" name="display_name" placeholder="E.g., Subidha Furniture" />
                <InputField label="Tagline" name="tagline" placeholder="Quality furniture for every home" />
                <InputField label="Hero Title" name="hero_title" placeholder="Welcome to Subidha" hint="Used on the public site homepage" />
                <InputField label="Short Description / Hero Subtitle" name="hero_subtitle" placeholder="Brief description shown on homepage or receipts." multiline />
                <InputField label="Document Logo URL" name="logo_url" placeholder="https://... (For invoices)" hint="Logo used on formal documents" />
                <InputField label="Public Logo URL" name="public_logo_url" placeholder="https://... (For website)" hint="Direct link to your logo image (PNG/SVG)" />
              </div>
            </FormSection>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <FormSection title="Contact & Social Presence" description="Primary operational contacts and public social links.">
              <div className="text-base font-semibold text-foreground">Phones & Emails</div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <InputField label="Primary Email (Ops)" name="primary_email" type="email" />
                <InputField label="Support Email (Public)" name="support_email" type="email" />
                <InputField label="Primary Phone (Ops)" name="primary_phone" type="tel" />
                <InputField label="Support Phone (Public)" name="support_phone" type="tel" />
                <InputField label="WhatsApp Phone" name="whatsapp_phone" type="tel" hint="10 digit number" />
                <InputField label="Alternate Phone" name="alternate_phone" type="tel" />
              </div>

              <div className="mt-6 text-base font-semibold text-foreground">Social Links</div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <InputField label="Website URL" name="website_url" />
                <InputField label="WhatsApp Link" name="whatsapp_link" hint="https://wa.me/..." />
                <InputField label="Facebook URL" name="facebook_url" />
                <InputField label="Instagram URL" name="instagram_url" />
                <InputField label="YouTube URL" name="youtube_url" />
                <InputField label="Justdial URL" name="justdial_url" />
              </div>
            </FormSection>

            <FormSection title="Address & Location" description="Formal billing address and public business hours.">
              <div className="text-base font-semibold text-foreground">Formal Address (Billing)</div>
              <div className="mt-4 grid gap-4">
                <InputField label="Address Line 1" name="address_line_1" />
                <InputField label="Address Line 2" name="address_line_2" />
                <div className="grid gap-4 md:grid-cols-2">
                  <InputField label="City" name="city" />
                  <InputField label="District" name="district" />
                  <InputField label="State" name="state" />
                  <InputField label="Postal Code" name="postal_code" />
                </div>
              </div>

              <div className="mt-6 text-base font-semibold text-foreground">Public Location Info</div>
              <div className="mt-4 grid gap-4">
                <InputField label="Public Address Text" name="address_text" multiline hint="Readable address for the website" />
                <InputField label="Business Hours" name="business_hours" multiline placeholder="Mon–Sat: 10am–8pm" />
                <InputField label="Google Maps URL" name="map_url" hint="Paste the Share link from Google Maps" />
              </div>
            </FormSection>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <FormSection title="Document settings" description="Invoice and receipt numbering defaults and profile-level operational configuration.">
              <div className="text-base font-semibold text-foreground">Configuration</div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <InputField label="Invoice prefix" name="invoice_prefix" />
                <InputField label="Receipt prefix" name="receipt_prefix" />
                <InputField label="Currency code" name="default_currency_code" />
                <InputField label="Timezone name" name="timezone_name" />
              </div>
              <div className="mt-4">
                <label className="flex items-center gap-3 rounded-xl border border-input bg-background px-3 py-2 text-sm">
                  <input type="checkbox" name="is_active" checked={Boolean(form.is_active)} onChange={handleChange} disabled={loading || saving} />
                  Active business profile
                </label>
              </div>
            </FormSection>
          </section>

          <WorkspaceNotice tone="warning" title="Sensitive setup area">
            Changing GSTIN, PAN, and document prefix values can affect downstream legal/compliance workflows. Confirm values before saving.
          </WorkspaceNotice>

          <FormActions
            submitLabel="Save Unified Business Profile"
            submitLoadingLabel="Saving..."
            submitting={saving}
            submitDisabled={loading || saving}
            cancel={{
              label: "Back to setup",
              href: "/admin/settings/business-setup",
            }}
          />
        </form>
      )}
    </div>
  );
}
