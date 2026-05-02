"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import { invalidateAfterBusinessSetupMutation } from "@/lib/operational-query-invalidation";
import {
  getBusinessProfile,
  saveBusinessProfile,
  type BusinessProfile,
} from "@/services/business-setup";
import { ApiError } from "@/lib/api";

const initialForm: BusinessProfile = {
  legal_name: "",
  trade_name: "",
  business_code: "",
  primary_email: "",
  primary_phone: "",
  alternate_phone: "",
  website_url: "",
  address_line_1: "",
  address_line_2: "",
  landmark: "",
  city: "",
  district: "",
  state: "",
  postal_code: "",
  country: "India",
  gstin: "",
  pan_number: "",
  invoice_prefix: "",
  receipt_prefix: "",
  default_currency_code: "INR",
  timezone_name: "Asia/Kolkata",
  logo_url: "",
  is_active: true,
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to save business profile.";
}

export default function BusinessProfilePage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BusinessProfile>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  async function loadProfile() {
    try {
      setLoading(true);
      const profile = await getBusinessProfile();
      setForm(profile ? { ...initialForm, ...profile } : initialForm);
      setMessage(null);
      setUnauthorized(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUnauthorized(true);
        setMessage("Your session is not authorized. Please sign in again.");
      } else {
        setUnauthorized(false);
      setMessage(toErrorMessage(error));
      }
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
      const saved = await saveBusinessProfile(form);
      setForm({ ...initialForm, ...saved });
      setMessage("Business profile saved.");
      setUnauthorized(false);
      await invalidateAfterBusinessSetupMutation(queryClient);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUnauthorized(true);
        setMessage("Your session is not authorized. Please sign in again.");
      } else {
        setUnauthorized(false);
      setMessage(toErrorMessage(error));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business profile"
        description="Manage business identity, contact, address, and document defaults."
      />
      <BusinessSetupLinks />

      {message ? (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">{message}</div>
            {unauthorized ? (
              <Link
                href="/login?next=/admin/settings/business-setup/profile"
                className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground transition hover:bg-muted"
              >
                Go to login
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-base font-semibold text-foreground">Identity</div>
            <div className="mt-4 grid gap-4">
              <input name="legal_name" value={form.legal_name} onChange={handleChange} placeholder="Legal name" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={loading || unauthorized} />
              <input name="trade_name" value={form.trade_name || ""} onChange={handleChange} placeholder="Trade name" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={loading || unauthorized} />
              <input name="business_code" value={form.business_code || ""} onChange={handleChange} placeholder="Business code" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={loading || unauthorized} />
              <input name="gstin" value={form.gstin || ""} onChange={handleChange} placeholder="GSTIN" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={loading || unauthorized} />
              <input name="pan_number" value={form.pan_number || ""} onChange={handleChange} placeholder="PAN number" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={loading || unauthorized} />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-base font-semibold text-foreground">Contact</div>
            <div className="mt-4 grid gap-4">
              <input name="primary_email" value={form.primary_email || ""} onChange={handleChange} placeholder="Primary email" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={loading || unauthorized} />
              <input name="primary_phone" value={form.primary_phone || ""} onChange={handleChange} placeholder="Primary phone" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={loading || unauthorized} />
              <input name="alternate_phone" value={form.alternate_phone || ""} onChange={handleChange} placeholder="Alternate phone" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={loading || unauthorized} />
              <input name="website_url" value={form.website_url || ""} onChange={handleChange} placeholder="Website URL" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={loading || unauthorized} />
              <input name="logo_url" value={form.logo_url || ""} onChange={handleChange} placeholder="Logo URL" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={loading || unauthorized} />
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-base font-semibold text-foreground">Address</div>
            <div className="mt-4 grid gap-4">
              <input name="address_line_1" value={form.address_line_1 || ""} onChange={handleChange} placeholder="Address line 1" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={loading || unauthorized} />
              <input name="address_line_2" value={form.address_line_2 || ""} onChange={handleChange} placeholder="Address line 2" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={loading || unauthorized} />
              <input name="landmark" value={form.landmark || ""} onChange={handleChange} placeholder="Landmark" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={loading || unauthorized} />
              <div className="grid gap-4 md:grid-cols-2">
                <input name="city" value={form.city || ""} onChange={handleChange} placeholder="City" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={loading || unauthorized} />
                <input name="district" value={form.district || ""} onChange={handleChange} placeholder="District" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={loading || unauthorized} />
                <input name="state" value={form.state || ""} onChange={handleChange} placeholder="State" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={loading || unauthorized} />
                <input name="postal_code" value={form.postal_code || ""} onChange={handleChange} placeholder="Postal code" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={loading || unauthorized} />
              </div>
              <input name="country" value={form.country || "India"} onChange={handleChange} placeholder="Country" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={loading || unauthorized} />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-base font-semibold text-foreground">Document settings</div>
            <div className="mt-4 grid gap-4">
              <input name="invoice_prefix" value={form.invoice_prefix || ""} onChange={handleChange} placeholder="Invoice prefix" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={loading || unauthorized} />
              <input name="receipt_prefix" value={form.receipt_prefix || ""} onChange={handleChange} placeholder="Receipt prefix" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={loading || unauthorized} />
              <input name="default_currency_code" value={form.default_currency_code || "INR"} onChange={handleChange} placeholder="Currency code" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={loading || unauthorized} />
              <input name="timezone_name" value={form.timezone_name || "Asia/Kolkata"} onChange={handleChange} placeholder="Timezone name" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={loading || unauthorized} />
              <label className="flex items-center gap-3 rounded-xl border border-input bg-background px-3 py-2 text-sm">
                <input type="checkbox" name="is_active" checked={Boolean(form.is_active)} onChange={handleChange} disabled={loading || unauthorized} />
                Active business profile
              </label>
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || loading || unauthorized}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save business profile"}
          </button>
        </div>
      </form>
    </div>
  );
}
