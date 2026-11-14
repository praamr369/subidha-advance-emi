"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  XCircle,
  Zap,
} from "lucide-react";

import { FormSection } from "@/components/ui/operations";
import {
  getPaymentGatewaySettings,
  savePaymentGatewaySettings,
  testPaymentGatewayConnection,
  type PaymentGatewaySettings,
} from "@/services/business-setup";

export default function PaymentGatewayCard() {
  const [settings, setSettings] = useState<PaymentGatewaySettings | null>(null);
  const [merchantId, setMerchantId] = useState("");
  const [saltKey, setSaltKey] = useState("");
  const [saltIndex, setSaltIndex] = useState(1);
  const [environment, setEnvironment] = useState<"UAT" | "PROD">("UAT");
  const [isEnabled, setIsEnabled] = useState(false);
  const [autopayEnabled, setAutopayEnabled] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const data = await getPaymentGatewaySettings();
      setSettings(data);
      setMerchantId(data.merchant_id || "");
      setSaltIndex(data.salt_index || 1);
      setEnvironment(data.environment || "UAT");
      setIsEnabled(Boolean(data.is_enabled));
      setAutopayEnabled(Boolean(data.autopay_enabled));
    } catch {
      // defaults
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      const updated = await savePaymentGatewaySettings({
        merchant_id: merchantId.trim(),
        salt_key: saltKey.trim() || undefined,
        salt_index: saltIndex,
        environment,
        is_enabled: isEnabled,
        autopay_enabled: autopayEnabled,
      });
      setSettings(updated);
      setSaltKey(""); // Clear local input once encrypted at rest
      setFeedback({ tone: "success", text: "PhonePe gateway settings saved successfully." });
    } catch (err) {
      setFeedback({
        tone: "error",
        text: err instanceof Error ? err.message : "Failed to save gateway settings.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setFeedback(null);
    try {
      // Auto-save changes first if modified
      if (saltKey.trim() || merchantId !== settings?.merchant_id) {
        await savePaymentGatewaySettings({
          merchant_id: merchantId.trim(),
          salt_key: saltKey.trim() || undefined,
          salt_index: saltIndex,
          environment,
          is_enabled: isEnabled,
          autopay_enabled: autopayEnabled,
        });
      }

      const res = await testPaymentGatewayConnection();
      await loadSettings();
      setFeedback({
        tone: res.success ? "success" : "error",
        text: res.message,
      });
    } catch (err) {
      setFeedback({
        tone: "error",
        text: err instanceof Error ? err.message : "Connection test failed.",
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <FormSection
      title="PhonePe Payment Gateway & UPI AutoPay"
      description="Configure PhonePe PG credentials to enable 1-click online payment and automated recurring UPI AutoPay mandates for customer EMIs."
    >
      <div className="mt-2 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Loading gateway settings…
          </div>
        ) : (
          <>
            {/* Status & Diagnostic Banner */}
            {settings?.last_test_at ? (
              <div
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs ${
                  settings.last_test_success
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                    : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300"
                }`}
              >
                {settings.last_test_success ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                )}
                <div className="min-w-0 flex-1">
                  <span className="font-semibold">
                    {settings.last_test_success ? "Gateway Connected" : "Connection Attention Required"}
                  </span>
                  <p className="mt-0.5 text-[11px] leading-relaxed">
                    {settings.last_test_message || "Verified against PhonePe server."}
                  </p>
                </div>
              </div>
            ) : null}

            {feedback ? (
              <div
                className={`rounded-xl border p-3 text-xs ${
                  feedback.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                    : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
                }`}
              >
                {feedback.text}
              </div>
            ) : null}

            {/* Inputs Grid */}
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-medium text-foreground">
                PhonePe Merchant ID (MID)
                <input
                  type="text"
                  value={merchantId}
                  onChange={(e) => setMerchantId(e.target.value)}
                  placeholder="e.g. PGTESTPAYUAT or M3T05GQKO"
                  disabled={saving || testing}
                  className="h-9 rounded-xl border border-input bg-background px-3 font-mono text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
                <span className="text-[10px] text-muted-foreground">
                  Supplied in your PhonePe Merchant dashboard.
                </span>
              </label>

              <label className="grid gap-1.5 text-xs font-medium text-foreground">
                Environment
                <select
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value as "UAT" | "PROD")}
                  disabled={saving || testing}
                  className="h-9 rounded-xl border border-input bg-background px-3 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                >
                  <option value="UAT">UAT (Sandbox / Testing)</option>
                  <option value="PROD">PROD (Production / Live Real Money)</option>
                </select>
                <span className="text-[10px] text-muted-foreground">
                  Use UAT for testing before going live.
                </span>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-medium text-foreground">
                PhonePe Salt Key / Secret Key
                <input
                  type="password"
                  value={saltKey}
                  onChange={(e) => setSaltKey(e.target.value)}
                  placeholder={
                    settings?.has_salt_key
                      ? "•••••••••••••••• (Encrypted at rest)"
                      : "Enter 36-char Salt Key"
                  }
                  disabled={saving || testing}
                  className="h-9 rounded-xl border border-input bg-background px-3 font-mono text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
                <span className="text-[10px] text-muted-foreground">
                  {settings?.has_salt_key
                    ? "Encrypted with AES-256. Leave empty to keep existing key."
                    : "API Secret Key provided by PhonePe."}
                </span>
              </label>

              <label className="grid gap-1.5 text-xs font-medium text-foreground">
                Salt Index
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={saltIndex}
                  onChange={(e) => setSaltIndex(Number(e.target.value) || 1)}
                  disabled={saving || testing}
                  className="h-9 rounded-xl border border-input bg-background px-3 font-mono text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
                <span className="text-[10px] text-muted-foreground">
                  Key index on PhonePe (usually 1).
                </span>
              </label>
            </div>

            {/* Feature Toggles */}
            <div className="space-y-2.5 rounded-xl border border-border/80 bg-muted/20 p-3">
              <label className="flex items-center gap-2.5 text-xs font-medium text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => setIsEnabled(e.target.checked)}
                  disabled={saving || testing}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                />
                <span>Enable PhonePe Payment Gateway for online collections</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs font-medium text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={autopayEnabled}
                  onChange={(e) => setAutopayEnabled(e.target.checked)}
                  disabled={saving || testing}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                />
                <span>
                  Enable Recurring UPI AutoPay / e-Mandate (customers authorize monthly auto-debit)
                </span>
              </label>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || saving || !merchantId.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground shadow-sm transition hover:bg-muted disabled:opacity-50"
              >
                {testing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <Zap className="h-3.5 w-3.5 text-amber-600" />
                )}
                Test Connection
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving || testing}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" />
                )}
                Save Gateway Settings
              </button>
            </div>
          </>
        )}
      </div>
    </FormSection>
  );
}
