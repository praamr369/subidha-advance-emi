"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import { shouldBypassNextImageOptimization } from "@/lib/media";
import {
  getDocumentPrintSettings,
  saveDocumentPrintSettings,
  type DocumentPrintSettings,
} from "@/services/business-setup";

const textFields: Array<{ key: keyof DocumentPrintSettings; label: string; type?: "input" | "textarea"; rows?: number }> = [
  { key: "business_name", label: "Business print name" },
  { key: "business_tagline", label: "Tagline" },
  { key: "print_address", label: "Print address", type: "textarea", rows: 4 },
  { key: "print_phone", label: "Print phone" },
  { key: "print_email", label: "Print email" },
  { key: "print_website", label: "Print website" },
  { key: "tax_label", label: "Tax label / identifier" },
  { key: "authorized_signatory_label", label: "Authorized signatory label" },
  { key: "customer_signature_label", label: "Customer signature label" },
  { key: "report_footer_note", label: "Report footer note", type: "textarea", rows: 3 },
];

const termFields: Array<{ key: keyof DocumentPrintSettings; label: string }> = [
  { key: "invoice_terms", label: "Invoice terms" },
  { key: "receipt_terms", label: "Receipt terms" },
  { key: "delivery_challan_terms", label: "Delivery challan terms" },
  { key: "subscription_contract_terms", label: "Subscription contract terms" },
  { key: "rent_lease_contract_terms", label: "Rent / lease contract terms" },
  { key: "purchase_bill_terms", label: "Purchase bill terms" },
  { key: "vendor_voucher_terms", label: "Vendor voucher terms" },
  { key: "account_statement_terms", label: "Account statement terms" },
];

function emptySettings(): DocumentPrintSettings {
  return {
    business_name: "",
    business_tagline: "",
    print_address: "",
    print_phone: "",
    print_email: "",
    print_website: "",
    tax_label: "",
    invoice_terms: "",
    receipt_terms: "",
    delivery_challan_terms: "",
    subscription_contract_terms: "",
    rent_lease_contract_terms: "",
    purchase_bill_terms: "",
    vendor_voucher_terms: "",
    account_statement_terms: "",
    report_footer_note: "",
    authorized_signatory_label: "Authorized Signature",
    customer_signature_label: "Customer Signature",
    document_layout_density: "COMFORTABLE",
    show_logo: true,
    show_watermark: true,
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "Failed to save print branding settings.";
}

function termLines(value?: string): string[] {
  return String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export default function PrintBrandingSettingsPage() {
  const [settings, setSettings] = useState<DocumentPrintSettings>(emptySettings());
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [clearLogo, setClearLogo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadSettings() {
    try {
      setLoading(true);
      const payload = await getDocumentPrintSettings();
      setSettings({ ...emptySettings(), ...payload });
      setError(null);
    } catch (loadError) {
      setError(toErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  const receiptTermsPreview = useMemo(() => termLines(settings.receipt_terms), [settings.receipt_terms]);
  const logoPreviewUrl = settings.business_logo_url && !clearLogo ? settings.business_logo_url : null;

  function updateField(key: keyof DocumentPrintSettings, value: string | boolean) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setLogoFile(file);
    if (file) setClearLogo(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const formData = new FormData();
      for (const [key, value] of Object.entries(settings)) {
        if (["id", "business_logo", "business_logo_url", "business_profile"].includes(key)) continue;
        if (value === undefined || value === null) continue;
        formData.append(key, typeof value === "boolean" ? String(value) : String(value));
      }
      if (logoFile) formData.append("business_logo", logoFile);
      if (clearLogo) formData.append("clear_logo", "true");
      const saved = await saveDocumentPrintSettings(formData);
      setSettings({ ...emptySettings(), ...saved });
      setLogoFile(null);
      setClearLogo(false);
      setNotice("Print & PDF branding settings saved.");
    } catch (saveError) {
      setError(toErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Print & PDF Branding"
        description="Control document logo, print identity, document wording, terms, signatures, and footer notes for existing print/PDF documents."
      />
      <BusinessSetupLinks />

      {loading ? <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">Loading print branding settings...</div> : null}
      {error ? <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</div> : null}

      {!loading ? (
        <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="text-base font-semibold text-foreground">Brand identity</div>
              <p className="mt-1 text-sm text-muted-foreground">These fields affect document presentation only. They do not alter accounting, payment, receipt, stock, contract, or audit records.</p>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {textFields.map((field) => (
                  <label key={String(field.key)} className={field.type === "textarea" ? "text-sm text-muted-foreground md:col-span-2" : "text-sm text-muted-foreground"}>
                    {field.label}
                    {field.type === "textarea" ? (
                      <textarea
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                        rows={field.rows || 3}
                        value={String(settings[field.key] || "")}
                        onChange={(event) => updateField(field.key, event.target.value)}
                      />
                    ) : (
                      <input
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                        value={String(settings[field.key] || "")}
                        onChange={(event) => updateField(field.key, event.target.value)}
                      />
                    )}
                  </label>
                ))}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="text-sm text-muted-foreground">
                  Logo upload
                  <input type="file" accept="image/*" onChange={handleLogoChange} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                </label>
                <label className="text-sm text-muted-foreground">
                  Layout density
                  <select
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                    value={settings.document_layout_density || "COMFORTABLE"}
                    onChange={(event) => updateField("document_layout_density", event.target.value)}
                  >
                    <option value="COMFORTABLE">Comfortable</option>
                    <option value="COMPACT">Compact</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" checked={settings.show_logo !== false} onChange={(event) => updateField("show_logo", event.target.checked)} />
                  Show logo on documents
                </label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" checked={settings.show_watermark !== false} onChange={(event) => updateField("show_watermark", event.target.checked)} />
                  Show unsafe-status watermark
                </label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" checked={clearLogo} onChange={(event) => { setClearLogo(event.target.checked); if (event.target.checked) setLogoFile(null); }} />
                  Remove uploaded logo and use fallback
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="text-base font-semibold text-foreground">Document terms</div>
              <p className="mt-1 text-sm text-muted-foreground">Use one clause per line. Existing print routes automatically pick the relevant term group.</p>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {termFields.map((field) => (
                  <label key={String(field.key)} className="text-sm text-muted-foreground">
                    {field.label}
                    <textarea
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                      rows={5}
                      value={String(settings[field.key] || "")}
                      onChange={(event) => updateField(field.key, event.target.value)}
                    />
                  </label>
                ))}
              </div>
            </section>

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save print branding"}
            </button>
          </div>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-[#e6d6bd] bg-[#fffaf0] p-5 text-[#2f2418] shadow-sm">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-[#8a5a22]">Sample document header</div>
              <div className="mt-4 flex gap-3">
                {settings.show_logo !== false ? (
                  <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-[#d9c39c] bg-white text-sm font-black text-[#7b4c1f]">
                    {logoPreviewUrl ? (
                      <Image
                        src={logoPreviewUrl}
                        alt="Document logo preview"
                        fill
                        className="object-contain"
                        sizes="56px"
                        unoptimized={shouldBypassNextImageOptimization(logoPreviewUrl)}
                      />
                    ) : "SF"}
                  </div>
                ) : null}
                <div>
                  <div className="text-lg font-black uppercase tracking-wide">{settings.business_name || "Subidha Furniture"}</div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#8a5a22]">{settings.business_tagline || "Furniture, Advance EMI, Rent & Lease"}</div>
                  <div className="mt-1 whitespace-pre-line text-xs text-[#6f5c46]">{settings.print_address || "Subidha Furniture, Asansol\nWest Bengal, India"}</div>
                  <div className="mt-2 text-xs text-[#6f5c46]">{settings.print_phone || "+91 77972 80952"} · {settings.print_email || "support@subidhafurnitureasansol.com"}</div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="text-sm font-semibold text-foreground">Sample receipt terms</div>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                {(receiptTermsPreview.length ? receiptTermsPreview : ["This receipt only confirms the amount shown as received in the system record."]).map((term) => <li key={term}>{term}</li>)}
              </ol>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="text-sm font-semibold text-foreground">Sample footer</div>
              <p className="mt-2 text-sm text-muted-foreground">{settings.report_footer_note || "Generated by SUBIDHA CORE for audit and business records."}</p>
            </section>
          </aside>
        </form>
      ) : null}
    </div>
  );
}
