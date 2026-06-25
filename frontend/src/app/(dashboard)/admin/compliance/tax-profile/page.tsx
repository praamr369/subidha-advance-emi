"use client";

import { useEffect, useMemo, useState } from "react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { activateComplianceTaxProfile, getComplianceTaxProfile } from "@/services/compliance";
import type { BusinessTaxMode } from "@/types/compliance";

export default function AdminComplianceTaxProfilePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<BusinessTaxMode>("GST_UNREGISTERED");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [gstin, setGstin] = useState("");
  const [activeMode, setActiveMode] = useState<BusinessTaxMode>("GST_UNREGISTERED");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const payload = await getComplianceTaxProfile();
      setActiveMode(payload.active.mode);
      setMode(payload.active.mode);
      setEffectiveFrom(payload.active.effective_from || "");
      setGstin(payload.active.gstin || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tax profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const requiresGstin = useMemo(() => mode === "GST_REGULAR" || mode === "GST_COMPOSITION", [mode]);

  return (
    <ERPPageShell
      eyebrow="Compliance"
      title="Compliance Tax Profile"
      subtitle="Current stage should remain GST Unregistered while keeping GST activation controls ready."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Compliance" },
        { label: "Tax Profile" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <WorkspaceSection title="Current Tax Mode" description={`Active mode: ${activeMode}`}>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <form
            className="grid gap-3 md:grid-cols-2"
            onSubmit={async (event) => {
              event.preventDefault();
              setNotice(null);
              setError(null);
              try {
                await activateComplianceTaxProfile({
                  mode,
                  effective_from: effectiveFrom || undefined,
                  gstin: gstin || undefined,
                });
                setNotice("Tax profile activated.");
                await load();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Activation failed.");
              }
            }}
          >
            <label className="grid gap-2 text-sm">
              <span>Mode</span>
              <select className="h-10 rounded border border-border bg-background px-3" value={mode} onChange={(e) => setMode(e.target.value as BusinessTaxMode)}>
                <option value="GST_UNREGISTERED">GST Unregistered</option>
                <option value="GST_REGULAR">GST Regular</option>
                <option value="GST_COMPOSITION">GST Composition</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              <span>Effective From</span>
              <input className="h-10 rounded border border-border bg-background px-3" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </label>
            <label className="grid gap-2 text-sm md:col-span-2">
              <span>GSTIN</span>
              <input
                className="h-10 rounded border border-border bg-background px-3"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                disabled={!requiresGstin}
              />
            </label>
            <div className="md:col-span-2">
              <button className="h-10 rounded bg-primary px-4 text-sm font-semibold text-primary-foreground" type="submit">
                Activate Tax Mode
              </button>
            </div>
          </form>
        )}
      </WorkspaceSection>
    </ERPPageShell>
  );
}
