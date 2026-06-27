"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";

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

type ImageUploadCardProps = {
  label: string;
  hint: string;
  previewUrl: string | null;
  localFile: File | null;
  cleared: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  onRestore: () => void;
  accept?: string;
  maxLabel?: string;
};

function ImageUploadCard({
  label,
  hint,
  previewUrl,
  localFile,
  cleared,
  fileInputRef,
  onFileChange,
  onClear,
  onRestore,
  accept = "image/jpeg,image/jpg,image/png,image/webp,image/gif",
  maxLabel = "2 MB max",
}: ImageUploadCardProps) {
  const localPreview = localFile ? URL.createObjectURL(localFile) : null;
  const displayUrl = localPreview ?? (cleared ? null : previewUrl);

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="text-sm font-semibold text-foreground">{label}</div>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>

      {displayUrl ? (
        <div className="mt-3 flex items-start gap-4">
          <div className="relative flex h-24 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
            <Image
              src={displayUrl}
              alt={label}
              fill
              className="object-contain p-2"
              sizes="160px"
              unoptimized={shouldBypassNextImageOptimization(displayUrl)}
            />
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              Replace image
            </button>
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/5"
            >
              Remove image
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-6 text-sm text-muted-foreground transition hover:border-ring hover:text-foreground"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586A2 2 0 0111.414 11h1.172a2 2 0 011.414.586L18 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Click to upload · JPG, PNG, WEBP, GIF · {maxLabel}
          </button>
          {cleared && previewUrl ? (
            <button
              type="button"
              onClick={onRestore}
              className="mt-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Restore saved image
            </button>
          ) : null}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
}

export default function PrintBrandingSettingsPage() {
  const [settings, setSettings] = useState<DocumentPrintSettings>(emptySettings());
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [clearLogo, setClearLogo] = useState(false);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [clearSignature, setClearSignature] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);

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
  const signaturePreviewUrl = settings.authorized_signature_url && !clearSignature ? settings.authorized_signature_url : null;

  function updateField(key: keyof DocumentPrintSettings, value: string | boolean) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setLogoFile(file);
    if (file) setClearLogo(false);
    if (logoInputRef.current) logoInputRef.current.value = "";
  }

  function handleSignatureChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSignatureFile(file);
    if (file) setClearSignature(false);
    if (signatureInputRef.current) signatureInputRef.current.value = "";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const formData = new FormData();
      const skipKeys = new Set(["id", "business_logo", "business_logo_url", "authorized_signature", "authorized_signature_url", "business_profile", "clear_logo", "clear_signature"]);
      for (const [key, value] of Object.entries(settings)) {
        if (skipKeys.has(key)) continue;
        if (value === undefined || value === null) continue;
        formData.append(key, typeof value === "boolean" ? String(value) : String(value));
      }
      if (logoFile) formData.append("business_logo", logoFile);
      if (clearLogo) formData.append("clear_logo", "true");
      if (signatureFile) formData.append("authorized_signature", signatureFile);
      if (clearSignature) formData.append("clear_signature", "true");

      const saved = await saveDocumentPrintSettings(formData);
      setSettings({ ...emptySettings(), ...saved });
      setLogoFile(null);
      setClearLogo(false);
      setSignatureFile(null);
      setClearSignature(false);
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
        description="Control document logo, authorized signature, print identity, wording, terms, and footer notes for all print/PDF documents."
      />
      <BusinessSetupLinks />

      {loading ? <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Loading print branding settings...</div> : null}
      {error ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</div> : null}

      {!loading ? (
        <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">

            {/* Branding images */}
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="text-base font-semibold text-foreground">Brand logo & authorized signature</div>
              <p className="mt-1 text-sm text-muted-foreground">Your logo appears in the document header. Your authorized signature image is printed at the bottom of invoices, receipts, and contracts — below the signatory label.</p>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <ImageUploadCard
                  label="Business logo"
                  hint="Appears in the document header next to your business name."
                  previewUrl={logoPreviewUrl}
                  localFile={logoFile}
                  cleared={clearLogo}
                  fileInputRef={logoInputRef}
                  onFileChange={handleLogoChange}
                  onClear={() => { setClearLogo(true); setLogoFile(null); }}
                  onRestore={() => setClearLogo(false)}
                  maxLabel="2 MB max"
                />
                <ImageUploadCard
                  label="Authorized signature"
                  hint="Your ink or digital signature image — printed on documents above the signatory label."
                  previewUrl={signaturePreviewUrl}
                  localFile={signatureFile}
                  cleared={clearSignature}
                  fileInputRef={signatureInputRef}
                  onFileChange={handleSignatureChange}
                  onClear={() => { setClearSignature(true); setSignatureFile(null); }}
                  onRestore={() => setClearSignature(false)}
                  maxLabel="1 MB max"
                />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-sm text-muted-foreground">
                  Authorized signatory label
                  <input
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                    value={String(settings.authorized_signatory_label || "")}
                    onChange={(e) => updateField("authorized_signatory_label", e.target.value)}
                    placeholder="e.g. Authorized Signatory"
                  />
                </label>
                <label className="text-sm text-muted-foreground">
                  Customer signature label
                  <input
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                    value={String(settings.customer_signature_label || "")}
                    onChange={(e) => updateField("customer_signature_label", e.target.value)}
                    placeholder="e.g. Customer Signature"
                  />
                </label>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-sm text-muted-foreground">
                  Layout density
                  <select
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                    value={settings.document_layout_density || "COMFORTABLE"}
                    onChange={(e) => updateField("document_layout_density", e.target.value)}
                  >
                    <option value="COMFORTABLE">Comfortable</option>
                    <option value="COMPACT">Compact</option>
                  </select>
                </label>
                <div className="flex flex-col gap-2 pt-5">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input type="checkbox" checked={settings.show_logo !== false} onChange={(e) => updateField("show_logo", e.target.checked)} />
                    Show logo on documents
                  </label>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input type="checkbox" checked={settings.show_watermark !== false} onChange={(e) => updateField("show_watermark", e.target.checked)} />
                    Show unsafe-status watermark
                  </label>
                </div>
              </div>
            </section>

            {/* Brand identity text fields */}
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="text-base font-semibold text-foreground">Brand identity</div>
              <p className="mt-1 text-sm text-muted-foreground">These fields affect document presentation only — name, address, contact, tagline, and tax label shown on all print/PDF documents.</p>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {textFields.map((field) => (
                  <label key={String(field.key)} className={field.type === "textarea" ? "text-sm text-muted-foreground md:col-span-2" : "text-sm text-muted-foreground"}>
                    {field.label}
                    {field.type === "textarea" ? (
                      <textarea
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                        rows={field.rows || 3}
                        value={String(settings[field.key] || "")}
                        onChange={(e) => updateField(field.key, e.target.value)}
                      />
                    ) : (
                      <input
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                        value={String(settings[field.key] || "")}
                        onChange={(e) => updateField(field.key, e.target.value)}
                      />
                    )}
                  </label>
                ))}
              </div>
            </section>

            {/* Document terms */}
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
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
                      onChange={(e) => updateField(field.key, e.target.value)}
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

          {/* Sidebar preview */}
          <aside className="space-y-4">
            <section className="rounded-xl border border-[#e6d6bd] bg-[#fffaf0] p-5 text-[#2f2418] shadow-sm">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-[#8a5a22]">Sample document header</div>
              <div className="mt-4 flex gap-3">
                {settings.show_logo !== false ? (
                  <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-border bg-card text-sm font-black text-[#7b4c1f]">
                    {logoPreviewUrl || logoFile ? (
                      <Image
                        src={logoFile ? URL.createObjectURL(logoFile) : logoPreviewUrl!}
                        alt="Document logo preview"
                        fill
                        className="object-contain"
                        sizes="56px"
                        unoptimized
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

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="text-sm font-semibold text-foreground">Sample receipt terms</div>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                {(receiptTermsPreview.length ? receiptTermsPreview : ["This receipt only confirms the amount shown as received in the system record."]).map((term) => <li key={term}>{term}</li>)}
              </ol>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="text-sm font-semibold text-foreground">Signature preview</div>
              <div className="mt-3 flex flex-col gap-3">
                {(signatureFile || signaturePreviewUrl) ? (
                  <div className="relative h-16 w-40 overflow-hidden rounded-lg border border-border bg-white">
                    <Image
                      src={signatureFile ? URL.createObjectURL(signatureFile) : signaturePreviewUrl!}
                      alt="Authorized signature preview"
                      fill
                      className="object-contain p-1"
                      sizes="160px"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="flex h-16 w-40 items-center justify-center rounded-lg border border-dashed border-border bg-muted text-xs text-muted-foreground">
                    No signature uploaded
                  </div>
                )}
                <div className="border-t border-border pt-2 text-xs font-semibold text-foreground">
                  {settings.authorized_signatory_label || "Authorized Signature"}
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="text-sm font-semibold text-foreground">Sample footer</div>
              <p className="mt-2 text-sm text-muted-foreground">{settings.report_footer_note || "Generated by SUBIDHA CORE for audit and business records."}</p>
            </section>
          </aside>
        </form>
      ) : null}
    </div>
  );
}
