"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Copy,
  Check,
  RefreshCw,
  Lock,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  ArrowLeft,
} from "lucide-react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { useAuth } from "@/providers/AuthProvider";
import { apiFetch } from "@/lib/api";
import { ROUTES } from "@/lib/routes";

type MfaSetupResponse = {
  is_verified: boolean;
  secret_key?: string;
  formatted_secret?: string;
  qr_code?: string;
  created_at?: string;
  updated_at?: string;
};

export default function MFASetupPage() {
  const { user } = useAuth();
  const accessToken = user?.accessToken;

  const [loading, setLoading] = useState(true);
  const [isVerified, setIsVerified] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState<string>("");
  const [formattedSecret, setFormattedSecret] = useState<string>("");

  const [mfaCode, setMfaCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Test code states (when already verified)
  const [testCode, setTestCode] = useState("");
  const [testSubmitting, setTestSubmitting] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; message: string } | null>(null);

  // Re-pair / Reset states
  const [showResetForm, setShowResetForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  async function loadMfa() {
    if (!accessToken) return;
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch<MfaSetupResponse>("/api/v1/auth/mfa/setup/");
      setIsVerified(Boolean(data.is_verified));
      setQrCode(data.qr_code || null);
      setSecretKey(data.secret_key || "");
      setFormattedSecret(data.formatted_secret || data.secret_key || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading MFA status.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMfa();
  }, [accessToken]);

  const handleCopySecret = async () => {
    if (!secretKey) return;
    try {
      await navigator.clipboard.writeText(secretKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleVerifyAndActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaCode.trim()) return;

    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      await apiFetch<{ detail: string }>("/api/v1/auth/mfa/setup/", {
        method: "POST",
        body: { mfa_code: mfaCode.trim() },
      });
      setSuccess("Two-Factor Authentication is now active! Your admin account is fully secured.");
      setIsVerified(true);
      setMfaCode("");
      await loadMfa();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed. Check the 6-digit code.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleTestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testCode.trim()) return;

    setTestResult(null);
    setTestSubmitting(true);

    try {
      const res = await apiFetch<{ valid: boolean; detail: string }>("/api/v1/auth/mfa/setup/", {
        method: "POST",
        body: { mfa_code: testCode.trim(), action: "test" },
      });
      setTestResult({ valid: true, message: res.detail || "Verification code is valid! Your phone is synced." });
    } catch (err) {
      setTestResult({
        valid: false,
        message: err instanceof Error ? err.message : "Invalid verification code. Check phone clock.",
      });
    } finally {
      setTestSubmitting(false);
    }
  };

  const handleResetMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) return;

    setResetError(null);
    setResetSubmitting(true);

    try {
      await apiFetch<{ detail: string }>("/api/v1/auth/mfa/setup/", {
        method: "DELETE",
        body: { password: currentPassword },
      });
      setShowResetForm(false);
      setCurrentPassword("");
      setIsVerified(false);
      setTestResult(null);
      setSuccess("MFA device reset. You can now scan a new QR code to pair your phone.");
      await loadMfa();
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Failed to reset MFA. Check your password.");
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <ERPPageShell
      eyebrow="Settings & Governance"
      title="Two-Factor Authentication (MFA / 2FA)"
      subtitle="Protect your Admin access using dynamic 6-digit one-time passwords from Google Authenticator on your mobile phone."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Governance Settings", href: ROUTES.admin.settings },
        { label: "Two-Factor Auth" },
      ]}
      actions={[
        { href: ROUTES.admin.settings, label: "Back to Settings", variant: "secondary" },
      ]}
      statusBadge={
        isVerified
          ? { label: "Active & Enforced", tone: "success" }
          : { label: "Setup Required", tone: "danger" }
      }
    >
      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin text-primary" />
            Loading security profile...
          </div>
        </div>
      ) : isVerified ? (
        /* ACTIVE & VERIFIED VIEW */
        <div className="space-y-6">
          <ERPSectionShell
            title="Two-Factor Protection Status"
            description="Your login is guarded by RFC 6238 Time-based One-Time Passwords (TOTP)."
          >
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-emerald-950 dark:text-emerald-100">
                      Two-Factor Authentication is Active & Enforced
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                      <CheckCircle2 className="h-3.5 w-3.5" /> High Security
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-emerald-900/80 dark:text-emerald-200/80">
                    To log in to this Admin console, both your password and the current 6-digit code
                    generated on your mobile phone are strictly required. Unauthorized login is blocked
                    even if someone knows your password.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="text-xs font-medium text-muted-foreground">Authentication Standard</div>
                <div className="mt-1 font-semibold text-foreground">RFC 6238 TOTP</div>
                <div className="mt-1 text-xs text-muted-foreground">Cryptographic 6-digit OTP</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="text-xs font-medium text-muted-foreground">Phone Authenticator App</div>
                <div className="mt-1 font-semibold text-foreground">Google / Microsoft</div>
                <div className="mt-1 text-xs text-muted-foreground">Or Apple Passwords / Authy</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="text-xs font-medium text-muted-foreground">Code Refresh Rate</div>
                <div className="mt-1 font-semibold text-foreground">Every 30 Seconds</div>
                <div className="mt-1 text-xs text-muted-foreground">Auto-rotates on device</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="text-xs font-medium text-muted-foreground">Network & Gateway Cost</div>
                <div className="mt-1 font-semibold text-emerald-600 dark:text-emerald-400">100% Free / Offline</div>
                <div className="mt-1 text-xs text-muted-foreground">Works without cellular SMS</div>
              </div>
            </div>
          </ERPSectionShell>

          {/* TEST VERIFICATION CODE */}
          <ERPSectionShell
            title="Test Time Synchronization"
            description="Verify that your phone's Authenticator app clock is accurately synchronized with the server."
          >
            <form onSubmit={handleTestCode} className="max-w-xl space-y-4">
              <div className="space-y-2">
                <label htmlFor="testCode" className="text-sm font-medium text-foreground">
                  Current 6-Digit Code from Phone
                </label>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Smartphone className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="testCode"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={testCode}
                      onChange={(e) => setTestCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000 000"
                      className="h-11 w-full rounded-xl border border-border bg-card pl-11 pr-3 font-mono text-base tracking-widest text-foreground outline-none transition focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={testSubmitting || testCode.length < 6}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow transition hover:bg-primary/90 disabled:opacity-50"
                  >
                    {testSubmitting ? "Testing..." : "Test Code"}
                  </button>
                </div>
              </div>

              {testResult ? (
                <div
                  className={`rounded-xl border p-4 text-sm ${
                    testResult.valid
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200"
                      : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {testResult.valid ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                    )}
                    <span className="font-medium">{testResult.message}</span>
                  </div>
                </div>
              ) : null}
            </form>
          </ERPSectionShell>

          {/* RE-PAIR / SWITCH PHONE */}
          <ERPSectionShell
            title="Switch Phone or Re-pair Device"
            description="If you switch to a new phone or need to re-pair Google Authenticator, reset your device here with password authorization."
          >
            {!showResetForm ? (
              <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                <div>
                  <div className="text-sm font-semibold text-foreground">Reconfigure Authenticator</div>
                  <div className="text-xs text-muted-foreground">
                    Resetting clears the current pairing so you can scan a new QR code on your new smartphone.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowResetForm(true)}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                >
                  Re-pair Phone
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetMfa} className="max-w-xl space-y-4 rounded-xl border border-amber-200 bg-amber-50/50 p-5 dark:border-amber-900/40 dark:bg-amber-950/20">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-950 dark:text-amber-100">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Confirm Password to Reset Two-Factor Device
                </div>
                <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
                  Enter your admin login password to authorize un-pairing this device.
                </p>

                <div className="space-y-2">
                  <label htmlFor="currentPassword" className="text-sm font-medium text-foreground">
                    Admin Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="currentPassword"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="h-11 w-full rounded-xl border border-border bg-card pl-11 pr-3 text-sm text-foreground outline-none transition focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35"
                      required
                    />
                  </div>
                </div>

                {resetError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {resetError}
                  </div>
                ) : null}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={resetSubmitting || !currentPassword}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-red-600 px-5 text-sm font-medium text-white shadow transition hover:bg-red-700 disabled:opacity-50"
                  >
                    {resetSubmitting ? "Resetting..." : "Confirm & Reset 2FA"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowResetForm(false);
                      setCurrentPassword("");
                      setResetError(null);
                    }}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </ERPSectionShell>
        </div>
      ) : (
        /* INITIAL SETUP WIZARD (NOT VERIFIED) */
        <div className="space-y-6">
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="flex items-start gap-3.5">
              <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <h3 className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                  Two-Factor Authentication is Recommended for All Admins
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-amber-900/80 dark:text-amber-200/80">
                  Follow the 3 quick steps below to pair your smartphone. Once activated, any login to this admin console will strictly require the 6-digit OTP code generated on your phone.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* STEP 1 */}
            <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    1
                  </span>
                  <h4 className="text-base font-semibold text-foreground">Get Authenticator App</h4>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Install any standard TOTP authenticator app on your smartphone from Google Play or Apple App Store:
                </p>
                <ul className="space-y-2 pt-2 text-xs font-medium text-foreground">
                  <li className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-primary" />
                    <strong>Google Authenticator</strong> (Recommended)
                  </li>
                  <li className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-primary" />
                    <strong>Microsoft Authenticator</strong>
                  </li>
                  <li className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-primary" />
                    <strong>Apple Passwords / Keychain</strong> (iOS/Mac)
                  </li>
                  <li className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-primary" />
                    <strong>Authy / 1Password / Bitwarden</strong>
                  </li>
                </ul>
              </div>
              <div className="mt-6 rounded-xl border border-border/60 bg-muted/40 p-3 text-[11px] text-muted-foreground">
                Tip: Works 100% offline, zero SMS charges, zero cellular network delays.
              </div>
            </div>

            {/* STEP 2 */}
            <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    2
                  </span>
                  <h4 className="text-base font-semibold text-foreground">Scan QR Code</h4>
                </div>
                <p className="text-xs text-muted-foreground">
                  Open your app, tap <strong>Add Account (+)</strong>, and scan this QR code with your camera:
                </p>

                {qrCode ? (
                  <div className="flex justify-center py-2">
                    <div className="rounded-2xl border-2 border-border bg-white p-3 shadow-sm inline-block">
                      <img src={qrCode} alt="MFA QR Code" className="h-44 w-44 object-contain" />
                    </div>
                  </div>
                ) : (
                  <div className="flex h-48 items-center justify-center rounded-xl bg-muted/40 text-xs text-muted-foreground">
                    Generating QR code...
                  </div>
                )}

                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-medium text-muted-foreground">
                    Cannot scan? Enter this key manually:
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-lg border border-border bg-muted/60 px-2.5 py-1.5 font-mono text-xs font-semibold tracking-wider text-foreground">
                      {formattedSecret || secretKey}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopySecret}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Copy Key"
                    >
                      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* STEP 3 */}
            <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
              <form onSubmit={handleVerifyAndActivate} className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                      3
                    </span>
                    <h4 className="text-base font-semibold text-foreground">Verify & Activate</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Enter the dynamic 6-digit code currently shown on your phone screen:
                  </p>

                  <div className="space-y-2 pt-2">
                    <label htmlFor="mfaCode" className="text-sm font-medium text-foreground">
                      6-Digit Security Code
                    </label>
                    <div className="relative">
                      <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        id="mfaCode"
                        name="mfaCode"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        autoComplete="one-time-code"
                        autoFocus
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="000 000"
                        className="h-14 w-full rounded-xl border border-border bg-card pl-11 pr-3 text-center font-mono text-xl tracking-[0.35em] text-foreground outline-none transition placeholder:tracking-normal placeholder:text-muted-foreground focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35"
                        required
                        disabled={submitting}
                      />
                    </div>
                  </div>

                  {error ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                      {error}
                    </div>
                  ) : null}

                  {success ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
                      {success}
                    </div>
                  ) : null}
                </div>

                <button
                  type="submit"
                  disabled={submitting || mfaCode.length < 6}
                  className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow transition hover:bg-primary/90 disabled:opacity-50"
                >
                  {submitting ? "Verifying..." : "Verify & Enable 2FA"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </ERPPageShell>
  );
}
