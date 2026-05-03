"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";

import { AuthLayoutShell } from "@/components/auth";
import ActionButton from "@/components/ui/ActionButton";
import { SixDigitNumericOtp } from "@/components/ui/input-otp";
import { buildForgotPasswordHref } from "@/lib/auth/password-reset";
import { APP_NAME } from "@/lib/constants";
import {
  confirmPasswordReset,
  resendPasswordResetOtp,
} from "@/services/auth.service";

function toMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to reset password.";
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialIdentifier = useMemo(
    () => (searchParams.get("identifier") || "").trim(),
    [searchParams]
  );
  const initialOtp = useMemo(
    () => (searchParams.get("otp") || "").trim(),
    [searchParams]
  );

  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [otp, setOtp] = useState(initialOtp);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `Reset Password | ${APP_NAME}`;
  }, []);

  useEffect(() => {
    if (initialIdentifier) {
      setIdentifier(initialIdentifier);
    }
    if (initialOtp) {
      setOtp(initialOtp);
    }
  }, [initialIdentifier, initialOtp]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!identifier.trim()) {
      setError("Identifier is required.");
      return;
    }

    if (!otp.trim()) {
      setError("Enter the 6-digit OTP.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setResendMessage(null);

    try {
      await confirmPasswordReset({
        identifier: identifier.trim(),
        otp: otp.trim(),
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const otpRelatedError =
    Boolean(error) && /otp|reset code|digit|6-digit/i.test(error ?? "");
  const expiredOrLocked =
    Boolean(error) && /expired|no longer usable/i.test(error ?? "");

  async function handleResendOtp() {
    if (!identifier.trim()) {
      setError("Enter email, username, or phone before resending OTP.");
      return;
    }

    setResending(true);
    setError(null);
    setResendMessage(null);

    try {
      const response = await resendPasswordResetOtp({
        identifier: identifier.trim(),
      });
      setResendMessage(response.detail);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthLayoutShell
      formTitle="Reset password"
      formSubtitle="Enter your account identifier, OTP, and new password."
      panelTitle="Controlled password recovery for approved account holders"
      panelDescription="OTP verification and password change stay inside the existing Subidha CORE auth workflow."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="identifier" className="mb-2 block text-sm font-medium text-slate-800">
            Email, username, or phone
          </label>
          <input
            id="identifier"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-400/20"
            placeholder="Enter email, username, or phone"
            disabled={submitting || success}
            required
          />
        </div>

        <div>
          <label htmlFor="otp" className="mb-2 block text-sm font-medium text-slate-800">
            6-digit OTP
          </label>
          <SixDigitNumericOtp
            id="otp"
            value={otp}
            onChange={setOtp}
            disabled={submitting || success}
            aria-invalid={otpRelatedError || undefined}
            aria-describedby={expiredOrLocked ? "otp-expired-hint" : undefined}
          />
          {expiredOrLocked ? (
            <p
              id="otp-expired-hint"
              className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950"
            >
              This reset code may have expired or the reset session may no longer be active.{" "}
              <Link
                href={buildForgotPasswordHref(identifier)}
                className="font-semibold text-amber-950 underline underline-offset-2"
              >
                Request a new code
              </Link>{" "}
              using the same identifier, then enter the fresh OTP here.
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>The OTP is delivered to the registered account email.</span>
            <button
              type="button"
              onClick={() => void handleResendOtp()}
              disabled={resending || submitting || success}
              aria-busy={resending}
              className="font-medium text-slate-800 transition hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resending ? "Resending..." : "Resend OTP"}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-800">
            New password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-400/20"
              placeholder="Minimum 8 characters"
              disabled={submitting || success}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-900"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="confirm-password" className="mb-2 block text-sm font-medium text-slate-800">
            Confirm password
          </label>
          <div className="relative">
            <input
              id="confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-400/20"
              placeholder="Confirm new password"
              disabled={submitting || success}
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-900"
            >
              {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {resendMessage && !error && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {resendMessage}
          </div>
        )}

        {success && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Password reset successfully! Redirecting to login...
          </div>
        )}

        <ActionButton
          type="submit"
          disabled={submitting || success}
          variant="primary"
          size="lg"
          fullWidth
        >
          {submitting ? "Resetting..." : "Reset password"}
        </ActionButton>

        <div className="workspace-filter-bar flex items-start gap-3 p-4">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-[var(--surface-card-elevated)] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <p className="min-w-0 text-sm leading-6 text-muted-foreground">
            Password reset remains explicit and OTP-backed. No authenticated session is created until the user signs in again.
          </p>
        </div>
      </form>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm text-slate-600">
        <Link
          href={buildForgotPasswordHref(identifier)}
          className="font-medium text-slate-900 hover:underline"
        >
          Back to forgot password
        </Link>
        <span className="text-slate-400">•</span>
        <Link href="/login" className="font-medium text-slate-900 hover:underline">
          Back to login
        </Link>
      </div>
    </AuthLayoutShell>
  );
}
