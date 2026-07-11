"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type CookiePrefs = {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
  personalization: boolean;
  updated_at: string | null;
};

const COOKIE_TYPES = [
  {
    key: "essential" as const,
    label: "Essential Cookies",
    description: "Required for login, session management, and core functionality. Cannot be disabled.",
    mandatory: true,
  },
  {
    key: "analytics" as const,
    label: "Analytics Cookies",
    description: "Help us understand how you use the app so we can improve it. No personal data is shared with third parties.",
    mandatory: false,
  },
  {
    key: "marketing" as const,
    label: "Marketing Cookies",
    description: "Used to show you relevant offers and promotions within the app.",
    mandatory: false,
  },
  {
    key: "personalization" as const,
    label: "Personalization Cookies",
    description: "Remember your preferences and provide a tailored experience.",
    mandatory: false,
  },
];

export default function CookiePreferencesPage() {
  const [prefs, setPrefs] = useState<CookiePrefs>({
    essential: true, analytics: false, marketing: false, personalization: false, updated_at: null,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch("/api/v1/privacy/cookie-consent/")
      .then((d) => { if (d) setPrefs(d as CookiePrefs); })
      .catch(() => {
        const stored = localStorage.getItem("cookie_prefs");
        if (stored) setPrefs(JSON.parse(stored));
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/v1/privacy/cookie-consent/", {
        method: "POST",
        body: JSON.stringify(prefs),
      });
    } catch {
      // fallback to localStorage
    }
    localStorage.setItem("cookie_prefs", JSON.stringify(prefs));
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <ERPPageShell
      title="Cookie Preferences"
      subtitle="Control which cookies we use — DPDP 2023 consent provisions apply"
      breadcrumbs={[
        { label: "Home", href: "/customer/dashboard" },
        { label: "Privacy", href: "/customer/privacy/dashboard" },
        { label: "Cookie Preferences" },
      ]}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        <WorkspaceSection title="Cookie Settings">
          {saved && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-700 rounded-lg text-sm mb-4">
              ✅ Cookie preferences saved.
            </div>
          )}
          <div className="space-y-4">
            {COOKIE_TYPES.map((ct) => (
              <div key={ct.key} className="flex items-start justify-between p-4 border rounded-lg">
                <div className="flex-1 pr-4">
                  <div className="font-medium text-sm flex items-center gap-2">
                    {ct.label}
                    {ct.mandatory && <span className="text-xs text-gray-500 border rounded px-1">Always On</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{ct.description}</div>
                </div>
                <button
                  onClick={() => !ct.mandatory && setPrefs({ ...prefs, [ct.key]: !prefs[ct.key] })}
                  disabled={ct.mandatory}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${
                    prefs[ct.key] ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-600"
                  } ${ct.mandatory ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${prefs[ct.key] ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setPrefs({ ...prefs, analytics: true, marketing: true, personalization: true })}
              className="flex-1 py-2 border rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Accept All
            </button>
            <button
              onClick={() => setPrefs({ ...prefs, analytics: false, marketing: false, personalization: false })}
              className="flex-1 py-2 border rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Reject Optional
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Preferences"}
            </button>
          </div>

          {prefs.updated_at && (
            <p className="text-xs text-gray-500 mt-3">
              Last updated: {new Date(prefs.updated_at).toLocaleDateString("en-IN")}
            </p>
          )}
        </WorkspaceSection>

        <WorkspaceSection title="About Our Cookies">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            We use cookies under DPDP 2023 consent provisions. You may withdraw optional cookie consent at any time by updating your preferences here. Essential cookies cannot be disabled as they are required for the service to function.
          </p>
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
