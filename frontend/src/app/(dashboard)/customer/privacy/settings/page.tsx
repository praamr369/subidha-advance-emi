"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type Consent = { id: number; consent_type: string; is_active: boolean; granted_at: string; withdrawn_at: string | null };

const CONSENT_LABELS: Record<string, { label: string; description: string; mandatory: boolean }> = {
  MARKETING: { label: "Marketing Communications", description: "Promotional offers, new products, special deals via SMS/email/WhatsApp", mandatory: false },
  ANALYTICS: { label: "Usage Analytics", description: "How you use the app to improve our service", mandatory: false },
  PERSONALIZATION: { label: "Personalized Recommendations", description: "Product suggestions based on your subscription history", mandatory: false },
  ESSENTIAL: { label: "Essential Service Data", description: "Required to operate your subscription and process payments", mandatory: true },
};

export default function PrivacySettingsPage() {
  const [consents, setConsents] = useState<Consent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/v1/privacy/consents/")
      .then((d) => setConsents(Array.isArray(d) ? d as Consent[] : ((d as { results?: Consent[] })?.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleConsent = async (consent: Consent) => {
    if (CONSENT_LABELS[consent.consent_type]?.mandatory) return;
    setSaving(consent.consent_type);
    try {
      if (consent.is_active) {
        await apiFetch("/api/v1/privacy/consent/withdraw/", {
          method: "POST",
          body: JSON.stringify({ consent_id: consent.id }),
        });
      } else {
        await apiFetch("/api/v1/privacy/consent/grant/", {
          method: "POST",
          body: JSON.stringify({ consent_type: consent.consent_type }),
        });
      }
      setConsents((prev) =>
        prev.map((c) => c.id === consent.id ? { ...c, is_active: !c.is_active } : c)
      );
    } catch {
      // silent — user can retry
    } finally {
      setSaving(null);
    }
  };

  return (
    <ERPPageShell
      title="Privacy Settings"
      subtitle="Manage your data consent and privacy preferences — DPDP 2023 compliant"
      breadcrumbs={[
        { label: "Home", href: "/customer/dashboard" },
        { label: "Privacy", href: "/customer/privacy/dashboard" },
        { label: "Settings" },
      ]}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        <WorkspaceSection title="Your Data Consents">
          {loading && <div className="py-6 text-center text-gray-500">Loading...</div>}
          {!loading && (
            <div className="space-y-4">
              {Object.entries(CONSENT_LABELS).map(([type, meta]) => {
                const consent = consents.find((c) => c.consent_type === type);
                const isActive = consent?.is_active ?? false;
                return (
                  <div key={type} className="flex items-start justify-between p-4 border rounded-lg">
                    <div className="flex-1 pr-4">
                      <div className="font-medium text-sm flex items-center gap-2">
                        {meta.label}
                        {meta.mandatory && (
                          <span className="text-xs text-gray-500 border border-gray-300 rounded px-1">Required</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{meta.description}</div>
                      {consent?.granted_at && (
                        <div className="text-xs text-gray-400 mt-1">
                          Granted: {new Date(consent.granted_at).toLocaleDateString("en-IN")}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => consent && toggleConsent(consent)}
                      disabled={meta.mandatory || saving === type}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${
                        isActive ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-600"
                      } ${meta.mandatory ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${isActive ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </WorkspaceSection>

        <WorkspaceSection title="Your Data Rights">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: "Access My Data", href: "/customer/privacy/data-access", icon: "📋" },
              { label: "Export My Data", href: "/customer/privacy/export", icon: "📥" },
              { label: "Privacy Dashboard", href: "/customer/privacy/dashboard", icon: "🔒" },
              { label: "File a Grievance", href: "/customer/privacy/grievance", icon: "📝" },
            ].map((link) => (
              <a key={link.href} href={link.href} className="flex items-center gap-2 p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                <span>{link.icon}</span>
                <span>{link.label}</span>
              </a>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">Under DPDP 2023, you have rights to access, correct, erase, and port your data.</p>
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
