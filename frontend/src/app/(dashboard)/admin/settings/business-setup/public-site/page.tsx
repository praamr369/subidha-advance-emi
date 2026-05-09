"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import { ApiError } from "@/lib/api";
import {
  getAdminPublicBusinessProfile,
  saveAdminPublicBusinessProfile,
  type PublicBusinessProfile,
} from "@/services/public-site";

const initialForm: PublicBusinessProfile = {
  display_name: "",
  tagline: "",
  hero_title: "",
  hero_subtitle: "",
  support_phone: "",
  support_email: "",
  whatsapp_phone: "",
  whatsapp_link: "",
  facebook_url: "",
  instagram_url: "",
  youtube_url: "",
  address_text: "",
  map_url: "",
  business_hours: "",
  public_logo_url: "",
  is_active: true,
};

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const parts = Object.entries(error.fieldErrors).flatMap(([key, messages]) =>
      messages.map((msg) => (key === "non_field_errors" ? msg : `${key}: ${msg}`))
    );
    if (parts.length > 0) {
      return parts.join(" ");
    }
    return error.readableMessage || error.message;
  }
  return error instanceof Error ? error.message : "Failed to save public site settings.";
}

export default function PublicSiteSettingsPage() {
  const [form, setForm] = useState<PublicBusinessProfile>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadProfile() {
    try {
      setLoading(true);
      const profile = await getAdminPublicBusinessProfile();
      setForm(profile ? { ...initialForm, ...profile } : initialForm);
      setMessage(null);
    } catch (error) {
      setMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value, type } = event.target;
    setForm((current) => ({
      ...current,
      [name]:
        type === "checkbox"
          ? (event.target as HTMLInputElement).checked
          : value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSaving(true);
      const saved = await saveAdminPublicBusinessProfile(form);
      setForm({ ...initialForm, ...saved });
      setMessage("Public site settings saved.");
    } catch (error) {
      setMessage(toErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Public site"
        description="Manage the public-facing business profile: contact details, social links, hero text, and logo references."
      />
      <BusinessSetupLinks />

      {message ? (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">
          {message}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-base font-semibold text-foreground">Public identity</div>
            <p className="mt-1 text-sm text-muted-foreground">
              These fields are safe to show on public pages. Avoid internal-only identifiers.
            </p>
            <div className="mt-4 grid gap-4">
              <input
                name="display_name"
                value={form.display_name || ""}
                onChange={handleChange}
                placeholder="Display name (e.g., Subidha Furniture)"
                className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                disabled={loading || saving}
              />
              <input
                name="tagline"
                value={form.tagline || ""}
                onChange={handleChange}
                placeholder="Tagline (short)"
                className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                disabled={loading || saving}
              />
              <input
                name="hero_title"
                value={form.hero_title || ""}
                onChange={handleChange}
                placeholder="Hero title"
                className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                disabled={loading || saving}
              />
              <textarea
                name="hero_subtitle"
                value={form.hero_subtitle || ""}
                onChange={handleChange}
                placeholder="Hero subtitle (1–3 lines)"
                className="min-h-[96px] rounded-xl border border-input bg-background px-3 py-2 text-sm"
                disabled={loading || saving}
              />
              <input
                name="public_logo_url"
                value={form.public_logo_url || ""}
                onChange={handleChange}
                placeholder="Public logo URL (https://...) optional"
                className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                disabled={loading || saving}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-base font-semibold text-foreground">Contact & social</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Use https links only. WhatsApp phone normalizes to 10 digits for wa.me links.
            </p>
            <div className="mt-4 grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <input
                  name="support_phone"
                  value={form.support_phone || ""}
                  onChange={handleChange}
                  placeholder="Support phone"
                  className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  disabled={loading || saving}
                />
                <input
                  name="support_email"
                  value={form.support_email || ""}
                  onChange={handleChange}
                  placeholder="Support email"
                  className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  disabled={loading || saving}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <input
                  name="whatsapp_phone"
                  value={form.whatsapp_phone || ""}
                  onChange={handleChange}
                  placeholder="WhatsApp phone (10 digits)"
                  className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  disabled={loading || saving}
                />
                <input
                  name="whatsapp_link"
                  value={form.whatsapp_link || ""}
                  onChange={handleChange}
                  placeholder="WhatsApp link (https://wa.me/...) optional"
                  className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  disabled={loading || saving}
                />
              </div>

              <input
                name="facebook_url"
                value={form.facebook_url || ""}
                onChange={handleChange}
                placeholder="Facebook page URL (https://...)"
                className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                disabled={loading || saving}
              />
              <input
                name="instagram_url"
                value={form.instagram_url || ""}
                onChange={handleChange}
                placeholder="Instagram URL (https://...)"
                className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                disabled={loading || saving}
              />
              <input
                name="youtube_url"
                value={form.youtube_url || ""}
                onChange={handleChange}
                placeholder="YouTube channel URL (https://...)"
                className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                disabled={loading || saving}
              />

              <label className="flex items-center gap-3 rounded-xl border border-input bg-background px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  name="is_active"
                  checked={Boolean(form.is_active)}
                  onChange={handleChange}
                />
                Active public profile
              </label>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-base font-semibold text-foreground">Public address</div>
            <div className="mt-4 grid gap-4">
              <textarea
                name="address_text"
                value={form.address_text || ""}
                onChange={handleChange}
                placeholder="Public address text"
                className="min-h-[96px] rounded-xl border border-input bg-background px-3 py-2 text-sm"
                disabled={loading || saving}
              />
              <input
                name="map_url"
                value={form.map_url || ""}
                onChange={handleChange}
                placeholder="Map link (https://...)"
                className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                disabled={loading || saving}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-base font-semibold text-foreground">Business hours</div>
            <div className="mt-4 grid gap-4">
              <textarea
                name="business_hours"
                value={form.business_hours || ""}
                onChange={handleChange}
                placeholder="Public business hours (e.g., Mon–Sat: 10:00–20:00)"
                className="min-h-[96px] rounded-xl border border-input bg-background px-3 py-2 text-sm"
                disabled={loading || saving}
              />
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || loading}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save public site settings"}
          </button>
        </div>
      </form>
    </div>
  );
}

