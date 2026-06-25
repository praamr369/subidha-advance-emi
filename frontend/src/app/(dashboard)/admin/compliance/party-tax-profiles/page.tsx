"use client";

import { useEffect, useState } from "react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { createPartyTaxProfile, listPartyTaxProfiles } from "@/services/compliance";
import type { PartyTaxProfile } from "@/types/compliance";

export default function AdminCompliancePartyTaxProfilesPage() {
  const [rows, setRows] = useState<PartyTaxProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    party_type: "CUSTOMER" as PartyTaxProfile["party_type"],
    party_id: "",
    tax_type: "UNREGISTERED" as PartyTaxProfile["tax_type"],
    legal_name: "",
    gstin: "",
    pan: "",
    state_code: "",
    state_name: "",
  });

  async function load() {
    const payload = await listPartyTaxProfiles();
    setRows(payload.results);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const payload = await listPartyTaxProfiles();
        if (!active) return;
        setRows(payload.results);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load party tax profiles.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <ERPPageShell
      title="Party Tax Readiness"
      subtitle="Customer/supplier/partner/vendor tax master readiness for future GST transition."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Compliance" },
        { label: "Party Tax Profiles" },
      ]}
    >
      <WorkspaceSection title="Profiles" description="Tax identity readiness without changing current non-GST postings.">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
        <form
          className="mb-4 grid gap-2 rounded border border-border p-3 md:grid-cols-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setNotice(null);
            setSaving(true);
            try {
              await createPartyTaxProfile({
                party_type: form.party_type,
                party_id: Number(form.party_id),
                tax_type: form.tax_type,
                legal_name: form.legal_name,
                gstin: form.gstin,
                pan: form.pan,
                state_code: form.state_code,
                state_name: form.state_name,
                is_active: true,
                notes: "",
              });
              await load();
              setNotice("Party tax readiness profile created.");
              setForm((current) => ({
                ...current,
                party_id: "",
                legal_name: "",
                gstin: "",
                pan: "",
                state_code: "",
                state_name: "",
              }));
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to create party tax profile.");
            } finally {
              setSaving(false);
            }
          }}
        >
          <select
            className="h-10 rounded border border-border bg-background px-3 text-sm"
            value={form.party_type}
            onChange={(event) => setForm((current) => ({ ...current, party_type: event.target.value as PartyTaxProfile["party_type"] }))}
          >
            <option value="CUSTOMER">Customer</option>
            <option value="SUPPLIER">Supplier</option>
            <option value="PARTNER">Partner</option>
            <option value="VENDOR">Vendor</option>
          </select>
          <input
            className="h-10 rounded border border-border bg-background px-3 text-sm"
            type="number"
            min={1}
            placeholder="Party ID"
            value={form.party_id}
            onChange={(event) => setForm((current) => ({ ...current, party_id: event.target.value }))}
            required
          />
          <select
            className="h-10 rounded border border-border bg-background px-3 text-sm"
            value={form.tax_type}
            onChange={(event) => setForm((current) => ({ ...current, tax_type: event.target.value as PartyTaxProfile["tax_type"] }))}
          >
            <option value="UNREGISTERED">Unregistered</option>
            <option value="REGISTERED">Registered</option>
            <option value="COMPOSITION">Composition</option>
          </select>
          <input
            className="h-10 rounded border border-border bg-background px-3 text-sm"
            placeholder="Legal name"
            value={form.legal_name}
            onChange={(event) => setForm((current) => ({ ...current, legal_name: event.target.value }))}
          />
          <input
            className="h-10 rounded border border-border bg-background px-3 text-sm"
            placeholder="GSTIN"
            value={form.gstin}
            onChange={(event) => setForm((current) => ({ ...current, gstin: event.target.value.toUpperCase() }))}
          />
          <input
            className="h-10 rounded border border-border bg-background px-3 text-sm"
            placeholder="PAN"
            value={form.pan}
            onChange={(event) => setForm((current) => ({ ...current, pan: event.target.value.toUpperCase() }))}
          />
          <input
            className="h-10 rounded border border-border bg-background px-3 text-sm"
            placeholder="State code"
            value={form.state_code}
            onChange={(event) => setForm((current) => ({ ...current, state_code: event.target.value.toUpperCase() }))}
          />
          <input
            className="h-10 rounded border border-border bg-background px-3 text-sm"
            placeholder="State name"
            value={form.state_name}
            onChange={(event) => setForm((current) => ({ ...current, state_name: event.target.value }))}
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
              <p className="font-medium">{row.party_type} #{row.party_id} - {row.legal_name || "Unnamed"}</p>
              <p>Tax type: {row.tax_type}</p>
              <p>GSTIN: {row.gstin || "-"}</p>
              <p>PAN: {row.pan || "-"}</p>
            </div>
          ))}
          {!rows.length ? <p className="text-muted-foreground">No party tax profiles found.</p> : null}
        </div>
      </WorkspaceSection>
    </ERPPageShell>
  );
}
