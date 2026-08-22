"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { fetchCustomerCommsPreferences, saveCustomerCommsPreferences } from "@/services/customer-portal";

type CommsPrefs = {
  sms_enabled: boolean;
  email_enabled: boolean;
  whatsapp_enabled: boolean;
  push_enabled: boolean;
  payment_reminders: boolean;
  emi_alerts: boolean;
  lucky_plan_alerts: boolean;
  marketing: boolean;
  service_updates: boolean;
};

const CHANNELS = [
  { key: "sms_enabled" as const, label: "SMS", icon: "💬", description: "Text messages for important alerts" },
  { key: "email_enabled" as const, label: "Email", icon: "📧", description: "Email notifications and receipts" },
  { key: "whatsapp_enabled" as const, label: "WhatsApp", icon: "📱", description: "WhatsApp updates and alerts" },
  { key: "push_enabled" as const, label: "Push Notifications", icon: "🔔", description: "In-app push notifications" },
];

const TOPICS = [
  { key: "payment_reminders" as const, label: "Payment Reminders", mandatory: true, description: "EMI due date reminders — required for service" },
  { key: "emi_alerts" as const, label: "EMI Alerts", mandatory: true, description: "Payment received / missed alerts" },
  { key: "lucky_plan_alerts" as const, label: "Lucky Plan Alerts", mandatory: false, description: "Draw results and waiver notifications" },
  { key: "service_updates" as const, label: "Service Updates", mandatory: false, description: "Warranty claim and service visit updates" },
  { key: "marketing" as const, label: "Marketing & Offers", mandatory: false, description: "Promotions, new products, and special deals" },
];

export default function CommsPreferencesPage() {
  const [prefs, setPrefs] = useState<CommsPrefs>({
    sms_enabled: true, email_enabled: true, whatsapp_enabled: false, push_enabled: true,
    payment_reminders: true, emi_alerts: true, lucky_plan_alerts: true, service_updates: true, marketing: false,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchCustomerCommsPreferences()
      .then((d) => { if (d) setPrefs(d as CommsPrefs); })
      .catch(() => {});
  }, []);

  const toggle = (key: keyof CommsPrefs) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveCustomerCommsPreferences(prefs);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const Toggle = ({ enabled, onClick, disabled }: { enabled: boolean; onClick: () => void; disabled?: boolean }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${
        enabled ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-600"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${enabled ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );

  return (
    <ERPPageShell
      title="Communication Preferences"
      subtitle="Control how and when we contact you"
      breadcrumbs={[
        { label: "Home", href: "/customer/dashboard" },
        { label: "Comms Preferences" },
      ]}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        {saved && (
          <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-700 rounded-lg text-sm">
            ✅ Communication preferences saved.
          </div>
        )}

        <WorkspaceSection title="Notification Channels">
          <div className="space-y-3">
            {CHANNELS.map((ch) => (
              <div key={ch.key} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{ch.icon}</span>
                  <div>
                    <div className="font-medium text-sm">{ch.label}</div>
                    <div className="text-xs text-gray-500">{ch.description}</div>
                  </div>
                </div>
                <Toggle enabled={prefs[ch.key]} onClick={() => toggle(ch.key)} />
              </div>
            ))}
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="Notification Topics">
          <div className="space-y-3">
            {TOPICS.map((topic) => (
              <div key={topic.key} className="flex items-start justify-between p-3 border rounded-lg">
                <div className="flex-1 pr-4">
                  <div className="font-medium text-sm flex items-center gap-2">
                    {topic.label}
                    {topic.mandatory && <span className="text-xs text-gray-400 border rounded px-1">Required</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{topic.description}</div>
                </div>
                <Toggle enabled={prefs[topic.key]} onClick={() => !topic.mandatory && toggle(topic.key)} disabled={topic.mandatory} />
              </div>
            ))}
          </div>
        </WorkspaceSection>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Preferences"}
        </button>
      </div>
    </ERPPageShell>
  );
}
