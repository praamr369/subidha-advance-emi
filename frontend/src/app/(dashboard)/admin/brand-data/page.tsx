"use client";

import { useEffect, useState } from "react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  getBrandDirectProfile,
  saveBrandDirectProfile,
  type BrandDirectProfile,
} from "@/services/brand-data";

type SocialPlatform = {
  key: keyof BrandDirectProfile["social_links"];
  label: string;
  placeholder: string;
  hint: string;
};

const SOCIAL_PLATFORMS: SocialPlatform[] = [
  { key: "facebook_url", label: "Facebook", placeholder: "https://facebook.com/yourpage", hint: "Paste your Facebook page or profile URL" },
  { key: "instagram_url", label: "Instagram", placeholder: "https://instagram.com/yourhandle", hint: "Paste your Instagram profile URL" },
  { key: "youtube_url", label: "YouTube", placeholder: "https://youtube.com/@yourchannel", hint: "Paste your YouTube channel URL" },
  { key: "whatsapp_url", label: "WhatsApp Business", placeholder: "https://wa.me/91XXXXXXXXXX", hint: "WhatsApp business link or wa.me URL" },
  { key: "justdial_url", label: "Justdial", placeholder: "https://www.justdial.com/...", hint: "Your Justdial business listing URL" },
  { key: "website_url", label: "Website", placeholder: "https://yourwebsite.com", hint: "Your public website URL" },
];

type FieldState = Omit<BrandDirectProfile, "social_links"> & BrandDirectProfile["social_links"];

function emptyFields(): FieldState {
  return {
    display_name: "", tagline: "", hero_subtitle: "", support_phone: "",
    whatsapp_phone: "", support_email: "", address_text: "", business_hours: "",
    map_url: "", public_logo_url: "",
    facebook_url: "", instagram_url: "", youtube_url: "",
    whatsapp_url: "", justdial_url: "", website_url: "",
  };
}

function profileToFields(p: BrandDirectProfile): FieldState {
  return {
    display_name: p.display_name,
    tagline: p.tagline,
    hero_subtitle: p.hero_subtitle,
    support_phone: p.support_phone,
    whatsapp_phone: p.whatsapp_phone,
    support_email: p.support_email,
    address_text: p.address_text,
    business_hours: p.business_hours,
    map_url: p.map_url,
    public_logo_url: p.public_logo_url,
    ...p.social_links,
  };
}

function Field({
  label, value, onChange, placeholder, hint, type = "text", multiline = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string; type?: string; multiline?: boolean;
}) {
  const cls = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground";
  return (
    <div>
      <label className="block text-sm font-semibold text-foreground">{label}</label>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      {multiline ? (
        <textarea rows={3} className={cls} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type={type} className={cls} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function SaveBar({ onSave, busy, section }: { onSave: () => void; busy: boolean; section: string }) {
  return (
    <div className="flex items-center justify-end pt-2">
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
      >
        {busy ? `Saving ${section}...` : `Save ${section}`}
      </button>
    </div>
  );
}

export default function AdminBrandDataPage() {
  const [fields, setFields] = useState<FieldState>(emptyFields());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function set(key: keyof FieldState) {
    return (value: string) => setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const profile = await getBrandDirectProfile();
      setFields(profileToFields(profile));
    } catch (err) {
      setError(err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "Failed to load brand profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function save(section: string, keys: Array<keyof FieldState>) {
    setBusy(section);
    setError(null);
    setNotice(null);
    try {
      const payload = Object.fromEntries(keys.map((k) => [k, fields[k]])) as Record<string, string>;
      const updated = await saveBrandDirectProfile(payload);
      setFields(profileToFields(updated));
      setNotice(`${section} saved.`);
    } catch (err) {
      setError(err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "Save failed.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <ERPPageShell eyebrow="Settings" title="Brand & Business Data" breadcrumbs={[{ label: "Admin", href: ROUTES.admin.root }, { label: "Brand Data" }]} statusBadge={{ label: "Admin Only", tone: "info" }}>
        <LoadingBlock label="Loading brand profile..." />
      </ERPPageShell>
    );
  }

  return (
    <ERPPageShell
      eyebrow="Settings"
      title="Brand & Business Data"
      subtitle="Manage your business identity, contact details, and social profiles. Paste any social link directly — no JSON required."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.root }, { label: "Brand Data" }]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <div className="space-y-6">
        {error ? <ErrorState title="Error" description={error} onRetry={() => void load()} /> : null}
        {notice ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div>
        ) : null}

        {/* Social Links — most prominent, matches user's request */}
        <WorkspaceSection
          title="Social & Online Presence"
          description="Paste each profile or page URL directly. Saved immediately to your public business links — no batch or JSON required."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {SOCIAL_PLATFORMS.map((p) => (
              <Field
                key={p.key}
                label={p.label}
                value={fields[p.key]}
                onChange={set(p.key)}
                placeholder={p.placeholder}
                hint={p.hint}
              />
            ))}
          </div>
          <SaveBar
            onSave={() => void save("social links", SOCIAL_PLATFORMS.map((p) => p.key))}
            busy={busy === "social links"}
            section="social links"
          />
        </WorkspaceSection>

        {/* Brand Identity */}
        <WorkspaceSection title="Brand Identity" description="Public-facing business name, tagline, and description shown on your website and receipts.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Business / Brand Name" value={fields.display_name} onChange={set("display_name")} placeholder="Subidha Furniture" />
            <Field label="Tagline" value={fields.tagline} onChange={set("tagline")} placeholder="Quality furniture for every home" />
          </div>
          <div className="mt-4">
            <Field label="Short Description" value={fields.hero_subtitle} onChange={set("hero_subtitle")} placeholder="Brief description shown on homepage or receipts." multiline />
          </div>
          <div className="mt-4">
            <Field label="Logo URL" value={fields.public_logo_url} onChange={set("public_logo_url")} placeholder="https://example.com/logo.png" hint="Direct link to your logo image (PNG or SVG recommended)" />
          </div>
          <SaveBar
            onSave={() => void save("brand identity", ["display_name", "tagline", "hero_subtitle", "public_logo_url"])}
            busy={busy === "brand identity"}
            section="brand identity"
          />
        </WorkspaceSection>

        {/* Contact & Location */}
        <WorkspaceSection title="Contact & Location" description="Phone, WhatsApp, email, address, opening hours, and Google Maps link.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Support Phone" value={fields.support_phone} onChange={set("support_phone")} placeholder="+91 98765 43210" type="tel" />
            <Field label="WhatsApp Number" value={fields.whatsapp_phone} onChange={set("whatsapp_phone")} placeholder="+91 98765 43210" type="tel" hint="Number only — wa.me link goes in Social section" />
            <Field label="Email" value={fields.support_email} onChange={set("support_email")} placeholder="info@yourbusiness.com" type="email" />
            <Field label="Google Maps URL" value={fields.map_url} onChange={set("map_url")} placeholder="https://maps.google.com/?q=..." hint="Paste the Share link from Google Maps" />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Address" value={fields.address_text} onChange={set("address_text")} placeholder="Shop No. 1, Main Road, City" multiline />
            <Field label="Business Hours" value={fields.business_hours} onChange={set("business_hours")} placeholder="Mon–Sat: 10am–8pm, Sun: 11am–6pm" multiline />
          </div>
          <SaveBar
            onSave={() => void save("contact & location", ["support_phone", "whatsapp_phone", "support_email", "address_text", "business_hours", "map_url"])}
            busy={busy === "contact & location"}
            section="contact & location"
          />
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
