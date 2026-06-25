"use client";

import { useEffect, useState } from "react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { createProductTaxProfile, listProductTaxProfiles } from "@/services/compliance";
import type { ProductTaxProfile } from "@/types/compliance";

export default function AdminComplianceProductTaxProfilesPage() {
  const [rows, setRows] = useState<ProductTaxProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    product: "",
    hsn_code: "",
    tax_category: "GOODS" as ProductTaxProfile["tax_category"],
    gst_rate: "0.00",
    effective_from: new Date().toISOString().slice(0, 10),
  });

  async function load() {
    const payload = await listProductTaxProfiles();
    setRows(payload.results);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const payload = await listProductTaxProfiles();
        if (!active) return;
        setRows(payload.results);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load product tax profiles.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <ERPPageShell
      eyebrow="Compliance"
      title="Product Tax Readiness"
      subtitle="HSN and GST rate readiness master for future GST registration."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Compliance" },
        { label: "Product Tax Profiles" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <WorkspaceSection title="Profiles" description="Readiness data only while GST Unregistered.">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
        <form
          className="mb-4 grid gap-2 rounded border border-border p-3 md:grid-cols-5"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setNotice(null);
            setSaving(true);
            try {
              await createProductTaxProfile({
                product: Number(form.product),
                hsn_code: form.hsn_code,
                tax_category: form.tax_category,
                gst_rate: form.gst_rate,
                effective_from: form.effective_from,
                effective_to: null,
                is_active: true,
                notes: "",
              });
              await load();
              setNotice("Product tax readiness profile created.");
              setForm((current) => ({ ...current, product: "", hsn_code: "", gst_rate: "0.00" }));
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to create product tax profile.");
            } finally {
              setSaving(false);
            }
          }}
        >
          <input
            className="h-10 rounded border border-border bg-background px-3 text-sm"
            placeholder="Product ID"
            type="number"
            min={1}
            value={form.product}
            onChange={(event) => setForm((current) => ({ ...current, product: event.target.value }))}
            required
          />
          <input
            className="h-10 rounded border border-border bg-background px-3 text-sm"
            placeholder="HSN code"
            value={form.hsn_code}
            onChange={(event) => setForm((current) => ({ ...current, hsn_code: event.target.value.toUpperCase() }))}
          />
          <select
            className="h-10 rounded border border-border bg-background px-3 text-sm"
            value={form.tax_category}
            onChange={(event) => setForm((current) => ({ ...current, tax_category: event.target.value as ProductTaxProfile["tax_category"] }))}
          >
            <option value="GOODS">Goods</option>
            <option value="SERVICE">Service</option>
            <option value="MIXED">Mixed</option>
          </select>
          <input
            className="h-10 rounded border border-border bg-background px-3 text-sm"
            type="number"
            min={0}
            step="0.01"
            value={form.gst_rate}
            onChange={(event) => setForm((current) => ({ ...current, gst_rate: event.target.value }))}
            required
          />
          <button
            type="submit"
            disabled={saving}
            className="h-10 rounded bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Saving..." : "Add Profile"}
          </button>
        </form>
        <div className="space-y-2 text-sm">
          {rows.map((row) => (
            <div key={row.id} className="rounded border border-border p-2">
              <p className="font-medium">{row.product_code || row.product} - {row.product_name || "Product"}</p>
              <p>HSN: {row.hsn_code || "-"}</p>
              <p>Category: {row.tax_category}</p>
              <p>GST rate: {row.gst_rate}</p>
            </div>
          ))}
          {!rows.length ? <p className="text-muted-foreground">No product tax profiles found.</p> : null}
        </div>
      </WorkspaceSection>
    </ERPPageShell>
  );
}
