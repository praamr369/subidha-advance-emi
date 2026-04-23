"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";

import { AuthLayoutShell } from "@/components/auth";
import ActionButton from "@/components/ui/ActionButton";
import { buildResetPasswordHref } from "@/lib/auth/password-reset";
import { APP_NAME } from "@/lib/constants";
import { requestPasswordReset } from "@/services/auth.service";

function toMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to send reset instructions.";
}

export default function ForgotPasswordPage() {
  const searchParams = useSearchParams();
  const initialIdentifier = useMemo(
    () => (searchParams.get("identifier") || "").trim(),
    [searchParams]
  );
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `Forgot Password | ${APP_NAME}`;
  }, []);

  useEffect(() => {
    if (initialIdentifier) {
      setIdentifier(initialIdentifier);
    }
  }, [initialIdentifier]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      await requestPasswordReset({ identifier: identifier.trim() });
      setSuccess(true);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayoutShell
      formTitle="Forgot password"
      formSubtitle="Request a reset OTP for your account using the registered identifier."
      panelTitle="Recover access without breaking session safety"
      panelDescription="Password reset requests stay tied to the registered account identity and continue using the live auth workflow."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="identifier" className="mb-2 block text-sm font-medium text-slate-800">
            Email, username, or phone
          </label>
          <input
            id="identifier"
            type="text"
            autoComplete="off"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-400/20"
            placeholder="Enter email, username, or phone"
            disabled={submitting}
            required
          />
          <p className="mt-2 text-xs text-slate-500">
            OTP is delivered to the registered account email.
          </p>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <div>
              If an eligible account exists, a reset code has been requested.
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildResetPasswordHref(identifier)}
                className="inline-flex items-center justify-center rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100"
              >
                Continue with OTP
              </Link>
              <button
                type="button"
                onClick={() => setSuccess(false)}
                className="inline-flex items-center justify-center rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100"
              >
                Use another identifier
              </button>
            </div>
          </div>
        )}

        <ActionButton
          type="submit"
          disabled={submitting}
          variant="primary"
          size="lg"
          fullWidth
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            "Send reset code"
          )}
        </ActionButton>

        <div className="workspace-filter-bar flex items-start gap-3 p-4">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-[var(--surface-card-elevated)] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <p className="min-w-0 text-sm leading-6 text-muted-foreground">
            Reset requests follow the existing OTP flow and do not change the login or role-routing contract.
          </p>
        </div>
      </form>

      <div className="mt-6 text-center text-sm text-slate-600">
        <Link href="/login" className="inline-flex items-center gap-1 font-medium text-slate-900 hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </Link>
      </div>
    </AuthLayoutShell>
  );
}
