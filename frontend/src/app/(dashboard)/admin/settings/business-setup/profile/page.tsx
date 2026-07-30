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
import { ApiError, apiFetch } from "@/lib/api";

import {
  getBusinessProfile,
  saveBusinessProfile,
  getDocumentNumberingState,
  type BusinessProfile,
  type DocumentNumberingSequence,
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
  business_type: string;
  year_of_establishment: string;
  gstin: string;
  pan_number: string;
  cin_number: string;
  tan_number: string;
  udyam_number: string;
  trade_license_number: string;
  shop_act_number: string;
  logo_url: string;

  // Authorized signatory
  authorized_signatory_name: string;
  authorized_signatory_designation: string;

  // Banking details
  bank_name: string;
  bank_account_number: string;
  bank_ifsc_code: string;
  bank_branch: string;
  upi_id: string;

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
  default_currency_code: string;
  timezone_name: string;

  // Status
  is_active: boolean;
};

const initialForm: UnifiedProfile = {
  legal_name: "", trade_name: "", business_code: "", business_type: "", year_of_establishment: "",
  gstin: "", pan_number: "", cin_number: "", tan_number: "", udyam_number: "",
  trade_license_number: "", shop_act_number: "", logo_url: "",
  authorized_signatory_name: "", authorized_signatory_designation: "",
  bank_name: "", bank_account_number: "", bank_ifsc_code: "", bank_branch: "", upi_id: "",
  display_name: "", tagline: "", hero_title: "", hero_subtitle: "", public_logo_url: "",
  primary_email: "", primary_phone: "", alternate_phone: "",
  support_email: "", support_phone: "", whatsapp_phone: "",
  website_url: "", whatsapp_link: "", facebook_url: "", instagram_url: "", youtube_url: "", justdial_url: "",
  address_line_1: "", address_line_2: "", landmark: "", city: "", district: "", state: "", postal_code: "", country: "India",
  address_text: "", map_url: "", business_hours: "",
  default_currency_code: "INR", timezone_name: "Asia/Kolkata",
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
  const [docSeqs, setDocSeqs] = useState<DocumentNumberingSequence[]>([]);

  async function loadProfiles() {
    try {
      setLoading(true);
      setMessage(null);

      const [bp, pub, brand, docState] = await Promise.all([
        getBusinessProfile().catch(() => null),
        getAdminPublicBusinessProfile().catch(() => null),
        getBrandDirectProfile().catch(() => null),
        getDocumentNumberingState().catch(() => null),
      ]);

      if (docState?.sequences) {
        setDocSeqs(docState.sequences);
      }

      setForm({
        ...initialForm,
        // Map BP
        legal_name: bp?.legal_name || "",
        trade_name: bp?.trade_name || "",
        business_code: bp?.business_code || "",
        business_type: bp?.business_type || "",
        year_of_establishment: bp?.year_of_establishment ? String(bp.year_of_establishment) : "",
        gstin: bp?.gstin || "",
        pan_number: bp?.pan_number || "",
        cin_number: bp?.cin_number || "",
        tan_number: bp?.tan_number || "",
        udyam_number: bp?.udyam_number || "",
        trade_license_number: bp?.trade_license_number || "",
        shop_act_number: bp?.shop_act_number || "",
        logo_url: bp?.logo_url || "",
        authorized_signatory_name: bp?.authorized_signatory_name || "",
        authorized_signatory_designation: bp?.authorized_signatory_designation || "",
        bank_name: bp?.bank_name || "",
        bank_account_number: bp?.bank_account_number || "",
        bank_ifsc_code: bp?.bank_ifsc_code || "",
        bank_branch: bp?.bank_branch || "",
        upi_id: bp?.upi_id || "",
        primary_email: bp?.primary_email || "",
        primary_phone: bp?.primary_phone || "",
        alternate_phone: bp?.alternate_phone || "",
        website_url: bp?.website_url || brand?.social_links?.website_url || "",
        address_line_1: bp?.address_line_1 || "",
        address_line_2: bp?.address_line_2 || "",
        landmark: bp?.landmark || "",
        city: bp?.city || "",
        district: bp?.district || "",
        state: bp?.state || "",
        postal_code: bp?.postal_code || "",
        country: bp?.country || "India",
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
        business_type: form.business_type || undefined,
        year_of_establishment: form.year_of_establishment ? Number(form.year_of_establishment) : undefined,
        gstin: form.gstin,
        pan_number: form.pan_number,
        cin_number: form.cin_number,
        tan_number: form.tan_number,
        udyam_number: form.udyam_number,
        trade_license_number: form.trade_license_number,
        shop_act_number: form.shop_act_number,
        authorized_signatory_name: form.authorized_signatory_name,
        authorized_signatory_designation: form.authorized_signatory_designation,
        bank_name: form.bank_name,
        bank_account_number: form.bank_account_number,
        bank_ifsc_code: form.bank_ifsc_code,
        bank_branch: form.bank_branch,
        upi_id: form.upi_id,
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

  function LogoUploadButton({ name }: { name: keyof UnifiedProfile }) {
    const [uploading, setUploading] = useState(false);
    
    async function handleFile(e: ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0];
      if (!file) return;
      
      try {
        setUploading(true);
        setMessage(null);
        
        const fd = new FormData();
        fd.append("file", file);
        
        const res = await apiFetch<{ url: string }>("/admin/business-profile/logo/upload/", {
          method: "POST",
          body: fd,
        });
        
        setForm(current => ({ ...current, [name]: res.url }));
        setMessage({ text: "Logo uploaded and set. Save profile to apply changes.", type: "success" });
      } catch (error) {
        setMessage({ text: toErrorMessage(error), type: "error" });
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    }
    
    return (
      <label className={`cursor-pointer text-xs font-semibold text-primary hover:underline ${uploading || saving ? "opacity-50 pointer-events-none" : ""}`}>
        {uploading ? "Uploading..." : "Direct Upload"}
        <input type="file" accept="image/png, image/jpeg, image/svg+xml, image/webp" className="hidden" onChange={(e) => void handleFile(e)} disabled={uploading || saving} />
      </label>
    );
  }

  function BusinessHoursPicker({ name }: { name: keyof UnifiedProfile }) {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const [selectedDays, setSelectedDays] = useState<string[]>([]);
    const [openTime, setOpenTime] = useState("10:00");
    const [closeTime, setCloseTime] = useState("20:00");
    const [isInitialized, setIsInitialized] = useState(false);
    
    const updateForm = (newDays: string[], open: string, close: string) => {
        let daysStr = "";
        if (newDays.length === 7) {
            daysStr = "Everyday";
        } else if (newDays.length === 6 && !newDays.includes("Sun")) {
            daysStr = "Mon-Sat";
        } else {
            daysStr = newDays.join(", ");
        }
        
        const formatTime = (time24: string) => {
            const [h, m] = time24.split(":");
            let hour = parseInt(h, 10) || 0;
            const ampm = hour >= 12 ? "PM" : "AM";
            hour = hour % 12;
            if (hour === 0) hour = 12;
            return `${hour}:${m || "00"} ${ampm}`;
        };
        
        const finalStr = newDays.length > 0 ? `${daysStr}: ${formatTime(open)} - ${formatTime(close)}` : "Closed";
        setForm(curr => ({ ...curr, [name]: finalStr }));
    };

    useEffect(() => {
        if (isInitialized) return;
        const val = form[name] as string;
        if (val === undefined) return; // wait for data to load

        if (!val) {
            const defDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            setSelectedDays(defDays);
            setOpenTime("10:00");
            setCloseTime("20:00");
            updateForm(defDays, "10:00", "20:00");
        } else if (val === "Closed") {
            setSelectedDays([]);
        } else {
            const parts = val.split(": ");
            if (parts.length >= 2) {
                const dayPart = parts[0];
                const timePart = parts.slice(1).join(": ");
                
                let newDays: string[] = [];
                if (dayPart === "Everyday") newDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
                else if (dayPart === "Mon-Sat") newDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                else newDays = dayPart.split(", ").map(d => d.trim()).filter(d => days.includes(d));
                
                if (newDays.length > 0) setSelectedDays(newDays);
                
                const times = timePart.split(" - ");
                if (times.length === 2) {
                    const parseAmPm = (t: string) => {
                        const match = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
                        if (!match) return "10:00";
                        let h = parseInt(match[1]);
                        const m = match[2];
                        const ampm = match[3].toUpperCase();
                        if (ampm === "PM" && h < 12) h += 12;
                        if (ampm === "AM" && h === 12) h = 0;
                        return `${h.toString().padStart(2, '0')}:${m}`;
                    };
                    setOpenTime(parseAmPm(times[0]));
                    setCloseTime(parseAmPm(times[1]));
                }
            }
        }
        setIsInitialized(true);
    }, [form, name, isInitialized]);

    const toggleDay = (d: string) => {
        const newDays = selectedDays.includes(d) ? selectedDays.filter(x => x !== d) : [...selectedDays, d];
        const ordered = days.filter(day => newDays.includes(day));
        setSelectedDays(ordered);
        updateForm(ordered, openTime, closeTime);
    };
    
    const handleOpen = (e: ChangeEvent<HTMLInputElement>) => {
        setOpenTime(e.target.value);
        updateForm(selectedDays, e.target.value, closeTime);
    };
    
    const handleClose = (e: ChangeEvent<HTMLInputElement>) => {
        setCloseTime(e.target.value);
        updateForm(selectedDays, openTime, e.target.value);
    };

    return (
      <div className="space-y-3 rounded-xl border border-input bg-background px-3 py-2 text-sm">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Business Hours</label>
        
        <div className="flex flex-wrap gap-3 mt-1">
          {days.map(d => (
            <label key={d} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={selectedDays.includes(d)} onChange={() => toggleDay(d)} disabled={loading || saving} className="rounded border-input text-primary focus:ring-primary" />
              <span className="text-sm">{d}</span>
            </label>
          ))}
        </div>
        
        <div className="flex items-center gap-6 mt-3 pb-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Open</span>
            <input type="time" value={openTime} onChange={handleOpen} disabled={loading || saving} className="rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Close</span>
            <input type="time" value={closeTime} onChange={handleClose} disabled={loading || saving} className="rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm" />
          </div>
        </div>
        
        <div className="text-[11px] text-muted-foreground mt-2 pt-2 border-t">
          Saved as: <span className="font-medium text-foreground">{form[name]}</span>
        </div>
      </div>
    );
  }

  function InputField({ label, name, placeholder, multiline = false, hint, type = "text", showUpload = false }: { label: string; name: keyof UnifiedProfile; placeholder?: string; multiline?: boolean; hint?: string; type?: string; showUpload?: boolean }) {
    const cls = "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm";
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
          {showUpload && <LogoUploadButton name={name} />}
        </div>
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
            <FormSection title="Legal Identity" description="Statutory identifiers, legal name, and formal registration details printed on invoices and letterheads.">
              <div className="text-base font-semibold text-foreground">Business Name & Type</div>
              <div className="mt-4 grid gap-4">
                <InputField label="Legal Name" name="legal_name" placeholder="E.g., Subidha Furniture Private Limited" hint="Full registered legal name as per MCA / partnership deed / proprietorship." />
                <InputField label="Trade Name / Brand Name" name="trade_name" placeholder="E.g., Subidha Furniture" hint="The name you operate under (may differ from legal name)." />
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Business Type</label>
                  <select name="business_type" value={form.business_type} onChange={(e) => setForm(c => ({ ...c, business_type: e.target.value }))} disabled={loading || saving}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm">
                    <option value="">— Select type —</option>
                    <option value="SOLE_PROPRIETORSHIP">Sole Proprietorship</option>
                    <option value="PARTNERSHIP">Partnership Firm</option>
                    <option value="LLP">Limited Liability Partnership (LLP)</option>
                    <option value="PRIVATE_LIMITED">Private Limited Company</option>
                    <option value="OPC">One Person Company (OPC)</option>
                    <option value="PUBLIC_LIMITED">Public Limited Company</option>
                    <option value="HUF">Hindu Undivided Family (HUF)</option>
                  </select>
                </div>
                <InputField label="Year of Establishment" name="year_of_establishment" type="number" placeholder="E.g., 2015" hint="Year your business was founded. Printed on letterheads." />
              </div>

              <div className="mt-6 text-base font-semibold text-foreground">GST & Income Tax</div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <InputField label="GSTIN" name="gstin" placeholder="E.g., 27AABCU9603R1ZX" hint="15-digit GST Identification Number." />
                <InputField label="PAN Number" name="pan_number" placeholder="E.g., AABCU9603R" hint="10-digit Permanent Account Number." />
                <InputField label="TAN Number" name="tan_number" placeholder="E.g., ABCD12345E" hint="Tax Deduction Account Number — needed if you deduct TDS." />
                <InputField label="CIN Number" name="cin_number" placeholder="E.g., U36100MH2020PTC123456" hint="Company Identification Number (Pvt Ltd / LLP only)." />
              </div>

              <div className="mt-6 text-base font-semibold text-foreground">Other Registrations</div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <InputField label="Udyam / MSME Number" name="udyam_number" placeholder="UDYAM-MH-00-0000000" hint="MSME registration under Udyam scheme. Helps in priority lending and govt tenders." />
                <InputField label="Trade License Number" name="trade_license_number" placeholder="Municipal trade license no." hint="Issued by local municipal authority for your shop or showroom." />
                <InputField label="Shop & Establishment No." name="shop_act_number" placeholder="Shops Act reg. number" hint="State Labour Dept registration (Shops & Establishments Act)." />
                <InputField label="Internal Business Code" name="business_code" placeholder="E.g., SFP-001" hint="Internal reference code used within this system." />
              </div>
            </FormSection>

            <FormSection title="Brand & Public Display" description="Public-facing business name, tagline, and copy shown on your website and receipts.">
              <div className="text-base font-semibold text-foreground">Brand Assets</div>
              <div className="mt-4 grid gap-4">
                <InputField label="Display Name (Brand Name)" name="display_name" placeholder="E.g., Subidha Furniture" />
                <InputField label="Tagline" name="tagline" placeholder="Quality furniture for every home" />
                <InputField label="Hero Title" name="hero_title" placeholder="Welcome to Subidha" hint="Used on the public site homepage" />
                <InputField label="Short Description / Hero Subtitle" name="hero_subtitle" placeholder="Brief description shown on homepage or receipts." multiline />
                <InputField label="Document Logo URL" name="logo_url" placeholder="https://... (For invoices)" hint="Logo used on formal documents" showUpload />
                <InputField label="Public Logo URL" name="public_logo_url" placeholder="https://... (For website)" hint="Direct link to your logo image (PNG/SVG)" showUpload />
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
                <InputField label="Website URL" name="website_url" hint="Auto-loaded from your saved brand data. Saved to both business profile and public site." />
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
                <BusinessHoursPicker name="business_hours" />
                <InputField label="Google Maps URL" name="map_url" hint="Paste the Share link from Google Maps" />
              </div>
            </FormSection>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <FormSection title="Authorized Signatory" description="Name and designation printed at the signature block on invoices, agreements, and legal documents.">
              <div className="mt-2 grid gap-4">
                <InputField label="Signatory Full Name" name="authorized_signatory_name" placeholder="E.g., Ravi Kumar" hint="Full name as it should appear on the signature line." />
                <InputField label="Designation" name="authorized_signatory_designation" placeholder="E.g., Proprietor / Director / Partner" hint="Title shown below the signature on documents." />
              </div>
            </FormSection>

            <FormSection title="Banking Details" description="Printed on B2B invoices for NEFT / RTGS payments and on receipts for UPI QR.">
              <div className="mt-2 grid gap-4">
                <InputField label="Bank Name" name="bank_name" placeholder="E.g., State Bank of India" />
                <div className="grid gap-4 md:grid-cols-2">
                  <InputField label="Account Number" name="bank_account_number" placeholder="Account number" />
                  <InputField label="IFSC Code" name="bank_ifsc_code" placeholder="E.g., SBIN0001234" hint="11-character IFSC code." />
                </div>
                <InputField label="Branch Name" name="bank_branch" placeholder="E.g., Andheri West, Mumbai" />
                <InputField label="UPI ID" name="upi_id" placeholder="E.g., subidha@upi or 9876543210@ybl" hint="Used for QR code on receipts. Most customers pay via UPI." />
              </div>
            </FormSection>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <FormSection title="Document settings" description="Document numbering sequences and operational configuration.">
              <div className="flex items-center justify-between">
                <div className="text-base font-semibold text-foreground">Document Numbering</div>
                <a href="/admin/settings/business-setup/document-numbering" className="text-xs font-semibold text-primary hover:underline">
                  Manage sequences →
                </a>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Prefix and counter are managed in Document Numbering. Shown here as read-only for reference.
              </p>
              {docSeqs.length === 0 ? (
                <div className="mt-3 rounded-xl border border-input bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
                  No document sequences configured yet.{" "}
                  <a href="/admin/settings/business-setup/document-numbering" className="font-semibold text-primary hover:underline">Set up Document Numbering →</a>
                </div>
              ) : (
                <div className="mt-3 overflow-hidden rounded-xl border border-input">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Document type</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Prefix</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Next number</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {docSeqs
                        .map((s) => (
                          <tr key={s.key} className="bg-background hover:bg-muted/30">
                            <td className="px-3 py-2 font-medium text-foreground">{s.name}</td>
                            <td className="px-3 py-2 font-mono text-foreground">{s.prefix || "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{s.next_number_preview ?? s.next_number}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                s.status === "ready" ? "bg-emerald-100 text-emerald-800" :
                                s.status === "needs_setup" ? "bg-amber-100 text-amber-800" :
                                "bg-red-100 text-red-800"
                              }`}>
                                {s.status === "ready" ? "Ready" : s.status === "needs_setup" ? "Needs setup" : s.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-6 text-base font-semibold text-foreground">Locale & Currency</div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <InputField label="Currency Code" name="default_currency_code" hint="ISO 4217 code. Default: INR." />
                <InputField label="Timezone" name="timezone_name" hint="Default: Asia/Kolkata." />
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
