"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type MSMEInfo = {
  udyam_number: string | null;
  enterprise_name: string;
  enterprise_type: "MICRO" | "SMALL" | "MEDIUM" | null;
  registered_at: string | null;
  valid_until: string | null;
  turnover_cr: number | null;
  investment_lakh: number | null;
  certificate_url: string | null;
  nic_code: string | null;
};

const ENTERPRISE_LIMITS = [
  { type: "MICRO", investment: "Up to ₹1 crore", turnover: "Up to ₹5 crore" },
  { type: "SMALL", investment: "Up to ₹10 crore", turnover: "Up to ₹50 crore" },
  { type: "MEDIUM", investment: "Up to ₹50 crore", turnover: "Up to ₹250 crore" },
];

export default function MSMEPage() {
  const [info, setInfo] = useState<MSMEInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Partial<MSMEInfo>>({});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const msmeSchema = z.object({
    udyam_number: z.string().optional().nullable().refine(
      (v) => !v || /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/.test(v),
      "Udyam number must follow the format UDYAM-XX-00-0000000."
    ),
    enterprise_type: z.enum(["MICRO", "SMALL", "MEDIUM"]).nullable().optional(),
    enterprise_name: z.string().optional().default(""),
    nic_code: z.string().optional().nullable(),
  });

  useEffect(() => {
    apiFetch("/api/v1/business/msme/")
      .then((d) => { const info = d as MSMEInfo; setInfo(info); setForm(info); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [saving]);

  const handleSave = async () => {
    const result = msmeSchema.safeParse(form);
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!errs[key]) errs[key] = issue.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await apiFetch("/api/v1/business/msme/", {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      setEditing(false);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  return (
    <ERPPageShell
      title="Udyam / MSME Registration"
      subtitle="MSME certificate and Udyam registration details"
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Settings", href: "/admin/settings" },
        { label: "Business Setup", href: "/admin/settings/business-setup" },
        { label: "MSME" },
      ]}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        <WorkspaceSection title="MSME Classification">
          <div className="grid grid-cols-3 gap-3">
            {ENTERPRISE_LIMITS.map((e) => (
              <div key={e.type} className={`p-3 rounded-lg border text-center ${info?.enterprise_type === e.type ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : ""}`}>
                <div className="font-bold text-sm">{e.type}</div>
                <div className="text-xs text-gray-500 mt-1">Investment: {e.investment}</div>
                <div className="text-xs text-gray-500">Turnover: {e.turnover}</div>
              </div>
            ))}
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="Registration Details">
          {loading && <div className="py-6 text-center text-gray-500">Loading...</div>}

          {!loading && !editing && info && (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-gray-500">Udyam Number</dt>
                  <dd className="font-mono font-semibold mt-1">{info.udyam_number || "Not registered"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Enterprise Type</dt>
                  <dd className="font-semibold mt-1">{info.enterprise_type || "—"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Enterprise Name</dt>
                  <dd className="font-semibold mt-1">{info.enterprise_name || "—"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">NIC Code</dt>
                  <dd className="font-semibold mt-1">{info.nic_code || "—"}</dd>
                </div>
                {info.registered_at && (
                  <div>
                    <dt className="text-gray-500">Registered On</dt>
                    <dd className="font-semibold mt-1">{new Date(info.registered_at).toLocaleDateString("en-IN")}</dd>
                  </div>
                )}
                {info.turnover_cr && (
                  <div>
                    <dt className="text-gray-500">Turnover</dt>
                    <dd className="font-semibold mt-1">₹{info.turnover_cr} crore</dd>
                  </div>
                )}
              </dl>
              {info.certificate_url && (
                <a href={info.certificate_url} target="_blank" rel="noreferrer"
                  className="inline-block text-sm text-blue-600 underline">
                  View Udyam Certificate →
                </a>
              )}
              <button onClick={() => setEditing(true)}
                className="w-full py-2 border rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                Edit Details
              </button>
            </div>
          )}

          {!loading && editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label htmlFor="f-udyam-number" className="block text-sm font-medium mb-1">Udyam Number</label>
                  <input id="f-udyam-number" type="text" className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600 font-mono"
                    value={form.udyam_number || ""}
                    onChange={(e) => setForm({ ...form, udyam_number: e.target.value })}
                    placeholder="UDYAM-XX-00-0000000" />
                  {errors.udyam_number ? <p className="text-sm text-destructive mt-1">{errors.udyam_number}</p> : null}
                </div>
                <div>
                  <label htmlFor="f-enterprise-type" className="block text-sm font-medium mb-1">Enterprise Type</label>
                  <select id="f-enterprise-type" className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600"
                    value={form.enterprise_type || ""}
                    onChange={(e) => setForm({ ...form, enterprise_type: e.target.value as MSMEInfo["enterprise_type"] })}>
                    <option value="">Select...</option>
                    <option value="MICRO">Micro</option>
                    <option value="SMALL">Small</option>
                    <option value="MEDIUM">Medium</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="f-nic-code" className="block text-sm font-medium mb-1">NIC Code</label>
                  <input id="f-nic-code" type="text" className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600"
                    value={form.nic_code || ""}
                    onChange={(e) => setForm({ ...form, nic_code: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setEditing(false)} className="flex-1 py-2 border rounded-lg text-sm">Cancel</button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          )}
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
