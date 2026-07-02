"use client";

import { useEffect, useState, type FormEvent } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import {
  getEmailSmtpSettings,
  saveEmailSmtpSettings,
  sendEmailSmtpTest,
  type EmailSMTPSettings,
} from "@/services/business-setup";

function emptySettings(): EmailSMTPSettings {
  return {
    smtp_host: "smtp.gmail.com",
    smtp_port: 587,
    use_tls: true,
    use_ssl: false,
    smtp_username: "",
    from_email: "",
    from_name: "",
    is_enabled: false,
    has_app_password: false,
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "Request failed.";
}

export default function EmailSmtpSettingsPage() {
  const [settings, setSettings] = useState<EmailSMTPSettings>(emptySettings());
  const [appPassword, setAppPassword] = useState("");
  const [testRecipient, setTestRecipient] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadSettings() {
    try {
      setLoading(true);
      const payload = await getEmailSmtpSettings();
      setSettings({ ...emptySettings(), ...payload });
      setError(null);
    } catch (loadError) {
      setError(toErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
    // Prefill the test-send box with the configured "from" address once loaded.
  }, []);

  function updateField<K extends keyof EmailSMTPSettings>(key: K, value: EmailSMTPSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const payload: Partial<EmailSMTPSettings> = {
        smtp_host: settings.smtp_host,
        smtp_port: settings.smtp_port,
        use_tls: settings.use_tls,
        use_ssl: settings.use_ssl,
        smtp_username: settings.smtp_username,
        from_email: settings.from_email,
        from_name: settings.from_name,
        is_enabled: settings.is_enabled,
      };
      if (appPassword.trim()) payload.app_password = appPassword.trim();
      const saved = await saveEmailSmtpSettings(payload);
      setSettings({ ...emptySettings(), ...saved });
      setAppPassword("");
      setNotice("Email SMTP settings saved.");
    } catch (saveError) {
      setError(toErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleSendTest() {
    if (!testRecipient.trim()) {
      setError("Enter a recipient email address for the test send.");
      return;
    }
    setTesting(true);
    setNotice(null);
    setError(null);
    try {
      const saved = await sendEmailSmtpTest(testRecipient.trim());
      setSettings({ ...emptySettings(), ...saved });
      setNotice(`Test email sent to ${testRecipient.trim()}. Check the inbox (and spam folder).`);
    } catch (testError) {
      setError(toErrorMessage(testError));
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email (SMTP / OTP)"
        description="Connect a real Gmail address so the system can send customer/user OTP codes for self-service password reset, and other outbound email."
      />
      <BusinessSetupLinks />

      {loading ? <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Loading email settings...</div> : null}
      {error ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</div> : null}

      {!loading ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <form onSubmit={handleSubmit} className="space-y-6">
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="text-base font-semibold text-foreground">Gmail SMTP login</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Use a Gmail address with 2-Step Verification enabled, then generate a 16-character{" "}
                <strong>App Password</strong> at myaccount.google.com &rarr; Security &rarr; 2-Step Verification &rarr; App
                passwords. Paste that app password below &mdash; not your normal Gmail login password.
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="text-sm text-muted-foreground">
                  Gmail address (SMTP username)
                  <input
                    type="email"
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                    value={settings.smtp_username || ""}
                    onChange={(e) => updateField("smtp_username", e.target.value)}
                    placeholder="yourbusiness@gmail.com"
                    required
                  />
                </label>
                <label className="text-sm text-muted-foreground">
                  App password
                  <input
                    type="password"
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                    value={appPassword}
                    onChange={(e) => setAppPassword(e.target.value)}
                    placeholder={settings.has_app_password ? "Saved -- leave blank to keep it" : "16-character app password"}
                    autoComplete="new-password"
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {settings.has_app_password ? "An app password is currently saved." : "No app password saved yet."}
                  </span>
                </label>
                <label className="text-sm text-muted-foreground">
                  SMTP host
                  <input
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                    value={settings.smtp_host || ""}
                    onChange={(e) => updateField("smtp_host", e.target.value)}
                  />
                </label>
                <label className="text-sm text-muted-foreground">
                  SMTP port
                  <input
                    type="number"
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                    value={settings.smtp_port ?? 587}
                    onChange={(e) => updateField("smtp_port", Number(e.target.value) || 587)}
                  />
                </label>
                <label className="text-sm text-muted-foreground">
                  From name
                  <input
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                    value={settings.from_name || ""}
                    onChange={(e) => updateField("from_name", e.target.value)}
                    placeholder="Subidha Furniture"
                  />
                </label>
                <label className="text-sm text-muted-foreground">
                  From email (defaults to Gmail address if blank)
                  <input
                    type="email"
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                    value={settings.from_email || ""}
                    onChange={(e) => updateField("from_email", e.target.value)}
                    placeholder={settings.smtp_username || "yourbusiness@gmail.com"}
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" checked={settings.use_tls !== false} onChange={(e) => updateField("use_tls", e.target.checked)} />
                  Use TLS (port 587 -- recommended for Gmail)
                </label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" checked={Boolean(settings.use_ssl)} onChange={(e) => updateField("use_ssl", e.target.checked)} />
                  Use SSL (port 465 instead)
                </label>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="text-base font-semibold text-foreground">Enable for live sending</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Send a test email first. Once it succeeds, turn this on so customer/user password-reset OTP emails and other
                outbound mail actually go through this Gmail account instead of the local/dev fallback.
              </p>
              <label className="mt-3 flex items-center gap-2 text-sm font-medium text-foreground">
                <input type="checkbox" checked={Boolean(settings.is_enabled)} onChange={(e) => updateField("is_enabled", e.target.checked)} />
                Use this account for live outbound email
              </label>
            </section>

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save email settings"}
            </button>
          </form>

          <aside className="space-y-4">
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="text-sm font-semibold text-foreground">Send a test email</div>
              <p className="mt-1 text-xs text-muted-foreground">Verify credentials before enabling live sending. Uses whatever is currently saved.</p>
              <input
                type="email"
                className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder="you@example.com"
              />
              <button
                type="button"
                onClick={() => void handleSendTest()}
                disabled={testing}
                className="mt-3 w-full rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-accent disabled:opacity-60"
              >
                {testing ? "Sending..." : "Send test email"}
              </button>

              {settings.last_test_at ? (
                <div
                  className={`mt-3 rounded-lg border p-3 text-xs ${
                    settings.last_test_success ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"
                  }`}
                >
                  <div className="font-semibold">{settings.last_test_success ? "Last test: success" : "Last test: failed"}</div>
                  <div className="mt-1">{settings.last_test_message}</div>
                  <div className="mt-1 opacity-70">{new Date(settings.last_test_at).toLocaleString()}</div>
                </div>
              ) : null}
            </section>

            <section className="rounded-xl border border-amber-300/70 bg-amber-50/90 p-4 text-xs text-amber-900 shadow-sm">
              <div className="font-semibold">Where this is used</div>
              <p className="mt-1">
                Customers and users already have a self-service &quot;forgot password&quot; flow that emails a one-time code
                (OTP). Right now it uses your local/dev fallback mail settings. Enabling this account here makes those OTP
                emails, and any other outbound mail, actually deliver through your real Gmail address.
              </p>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 text-xs text-muted-foreground shadow-sm">
              <div className="text-sm font-semibold text-foreground">Security note</div>
              <p className="mt-1">
                The app password is encrypted at rest and is never shown again after saving -- only whether one is currently
                stored. Use a Gmail <strong>App Password</strong>, never your real Gmail account password.
              </p>
            </section>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
