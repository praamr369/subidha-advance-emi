// frontend/src/app/(auth)/login/page.tsx
"use client";

import { FormEvent, useEffect, useMemo, useState, useRef, Suspense } from "react";
import Link from "next/link";
import {
  Eye,
  EyeOff,
  Lock,
  User,
  ArrowRight,
  ShieldCheck,
  BadgeCheck,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useI18n } from "@/components/i18n/I18nProvider";
import { AuthLayoutShell, GoogleSignInButton, GooglePhoneModal } from "@/components/auth";
import ActionButton from "@/components/ui/ActionButton";
import { APP_NAME } from "@/lib/constants";
import { ROUTES } from "@/lib/routes";
import { getDashboardRouteForRole } from "@/lib/auth/redirect";
import { useAuth } from "@/providers/AuthProvider";
import { loginRequest, googleAuthRequest, type LoginResponse, type GoogleAuthResponse } from "@/services/auth.service";

function toMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Login failed.";
  }

  const raw = error.message.trim();
  if (!raw) return "Login failed.";

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (typeof parsed.detail === "string") return parsed.detail;

    const firstValue = Object.values(parsed)[0];
    if (Array.isArray(firstValue) && typeof firstValue[0] === "string") {
      return firstValue[0];
    }
    if (typeof firstValue === "string") {
      return firstValue;
    }
  } catch {
    //
  }

  return raw;
}

function isExternalUrl(target: string): boolean {
  return /^https?:\/\//i.test(target);
}

function LoginContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { login, isAuthenticated, role } = useAuth();
  const { t } = useI18n();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedBusinessRole, setDetectedBusinessRole] = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [pendingGoogleData, setPendingGoogleData] = useState<{
    idToken: string;
    email?: string;
    name?: string;
  } | null>(null);

  const mfaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mfaRequired) {
      mfaInputRef.current?.focus();
    }
  }, [mfaRequired]);

  const nextUrl = useMemo(() => {
    const next = searchParams.get("next");
    if (!next) return null;
    if (!next.startsWith("/")) return null;
    return next;
  }, [searchParams]);

  useEffect(() => {
    document.title = `Customer Sign In | ${APP_NAME}`;
  }, [pathname]);

  useEffect(() => {
    if (!isAuthenticated || !role) return;
    const normalizedRole = (role || "").trim().toUpperCase();
    if (normalizedRole === "CUSTOMER") {
      const isBusinessNext =
        nextUrl?.startsWith("/admin") ||
        nextUrl?.startsWith("/partner") ||
        nextUrl?.startsWith("/vendor") ||
        nextUrl?.startsWith("/staff") ||
        nextUrl?.startsWith("/cashier") ||
        nextUrl?.startsWith("/business");
      const target = nextUrl && !isBusinessNext ? nextUrl : ROUTES.customer.dashboard;
      if (isExternalUrl(target) && typeof window !== "undefined") {
        window.location.assign(target);
        return;
      }
      router.replace(target);
    } else {
      const target = getDashboardRouteForRole(role);
      if (isExternalUrl(target) && typeof window !== "undefined") {
        window.location.assign(target);
        return;
      }
      router.replace(target);
    }
  }, [isAuthenticated, role, router, nextUrl]);

  function handleAuthSuccess(
    response: LoginResponse | GoogleAuthResponse,
    fallbackName?: string
  ) {
    const accessToken = response.access;
    const refreshToken = response.refresh;
    const resolvedRole =
      response.role ??
      response.user?.role ??
      (response as LoginResponse).user_role ??
      null;

    if (!accessToken || !refreshToken || !resolvedRole) {
      throw new Error("Invalid authentication response.");
    }

    const normalizedRole = (resolvedRole || "").trim().toUpperCase();

    // Strict boundary: Customer login only accepts CUSTOMER accounts
    if (normalizedRole !== "CUSTOMER") {
      setDetectedBusinessRole(normalizedRole);
      setError(null);
      setSubmitting(false);
      setGoogleSubmitting(false);
      return;
    }

    setDetectedBusinessRole(null);
    login({
      id: response.user?.id ?? 0,
      name:
        response.user?.name ??
        response.user?.username ??
        fallbackName ??
        "Customer",
      role: "CUSTOMER",
      accessToken,
      refreshToken,
    });

    const isBusinessNext =
      nextUrl?.startsWith("/admin") ||
      nextUrl?.startsWith("/partner") ||
      nextUrl?.startsWith("/vendor") ||
      nextUrl?.startsWith("/staff") ||
      nextUrl?.startsWith("/cashier") ||
      nextUrl?.startsWith("/business");

    const target = nextUrl && !isBusinessNext ? nextUrl : ROUTES.customer.dashboard;

    if (typeof window !== "undefined") {
      window.location.assign(target);
      return;
    }

    router.replace(target);
  }

  async function handleGoogleSuccess(idToken: string) {
    try {
      setGoogleSubmitting(true);
      setError(null);
      setDetectedBusinessRole(null);
      const response = await googleAuthRequest({ id_token: idToken });
      if (response.requires_phone) {
        setPendingGoogleData({
          idToken,
          email: response.email,
          name: response.name,
        });
        setShowPhoneModal(true);
        return;
      }
      handleAuthSuccess(response, response.name || response.email);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setGoogleSubmitting(false);
    }
  }

  async function handlePhoneSubmit(phone: string) {
    if (!pendingGoogleData?.idToken) return;
    setGoogleSubmitting(true);
    try {
      const response = await googleAuthRequest({
        id_token: pendingGoogleData.idToken,
        phone,
      });
      setShowPhoneModal(false);
      handleAuthSuccess(response, response.name || response.email);
    } catch (err) {
      throw err;
    } finally {
      setGoogleSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mfaRequired && mfaCode.trim().length !== 6) {
      setError("Please enter the complete 6-digit verification code from your phone.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setDetectedBusinessRole(null);

      const response = await loginRequest({
        identifier: identifier.trim(),
        password,
        mfa_code: mfaRequired ? mfaCode : undefined,
      });

      handleAuthSuccess(response, identifier.trim());
    } catch (err) {
      if (typeof window !== "undefined" && (!navigator.onLine || String(err).toLowerCase().includes("fetch"))) {
        const rawOffline = window.localStorage.getItem("subidha_offline_admin_profile");
        if (rawOffline) {
          try {
            const profile = JSON.parse(rawOffline);
            login({
              id: profile.id,
              name: profile.name,
              role: profile.role,
              accessToken: profile.accessToken,
              refreshToken: profile.refreshToken,
            });
            router.replace("/admin");
            return;
          } catch {
            // Ignore parse error
          }
        }
        setError("Network offline. Connect to internet on this device once to initialize offline counter access.");
        setSubmitting(false);
        return;
      }

      const msg = toMessage(err);
      const isMfa =
        (err && typeof err === "object" && (err as { mfa_required?: boolean }).mfa_required) ||
        msg === "MFA code is required." ||
        msg.toLowerCase().includes("mfa code is required");
      if (isMfa && !mfaRequired) {
        setMfaRequired(true);
        setError(null);
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayoutShell
      formTitle="Customer Sign In"
      formSubtitle="Access your Subidha EMI (SFEMI) contracts, payment schedules, and account."
      panelTitle="Subidha Customer Workspace"
      panelDescription="View your active SFEMI subscriptions, track monthly EMI schedules, and manage your account safely in one place."
      badgeLabel="Customer Portal"
      footerBadges={
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-center text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            256-Bit SSL Protection
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BadgeCheck className="h-3.5 w-3.5 text-primary" />
            Verified Customer Access
          </span>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {mfaRequired ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Two-Factor Authentication
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    User: <span className="font-mono font-medium text-foreground">{identifier}</span>
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                Open <strong>Google Authenticator</strong> or your authenticator app on your phone and enter the current 6-digit code.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="mfaCode" className="text-sm font-medium text-foreground">
                6-Digit Security Code
              </label>
              <div className="relative">
                <ShieldCheck className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={mfaInputRef}
                  id="mfaCode"
                  name="mfaCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="one-time-code"
                  autoFocus
                  value={mfaCode}
                  onPaste={(e) => {
                    e.preventDefault();
                    const text = e.clipboardData.getData("text");
                    const cleaned = text.replace(/\D/g, "").slice(0, 6);
                    setMfaCode(cleaned);
                  }}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setMfaCode(val);
                  }}
                  placeholder="000 000"
                  className="h-14 w-full rounded-xl border border-border bg-card pl-11 pr-3 text-center font-mono text-xl tracking-[0.35em] text-foreground outline-none transition placeholder:tracking-normal placeholder:text-muted-foreground focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
                  required
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => {
                  setMfaRequired(false);
                  setMfaCode("");
                  setError(null);
                }}
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition underline underline-offset-4"
              >
                ← Back to Password
              </button>
              <span className="text-[11px] text-muted-foreground">
                Dynamic • Rotates every 30s
              </span>
            </div>
          </div>
        ) : (
          <>
        <div className="space-y-2">
          <label htmlFor="identifier" className="text-xs sm:text-sm font-medium text-foreground">
            {t("auth.login.identifierLabel")}
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="identifier"
              name="identifier"
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={t("auth.login.identifierPlaceholder")}
              className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-base sm:text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
              required
              disabled={submitting}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-xs sm:text-sm font-medium text-foreground">
              {t("auth.login.passwordLabel")}
            </label>
            <Link
              href="/forgot-password"
              className="text-xs sm:text-sm font-medium text-primary hover:underline touch-manipulation"
            >
              {t("auth.login.forgotPassword")}
            </Link>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth.login.passwordPlaceholder")}
              className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-12 text-base sm:text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
              required
              disabled={submitting}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-1 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition hover:text-foreground touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40"
              aria-label={showPassword ? "Hide password" : "Show password"}
              disabled={submitting}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2.5 py-0.5">
          <input
            id="remember-me"
            name="remember-me"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-5 w-5 rounded border-border text-primary focus:ring-primary/20 cursor-pointer"
          />
          <label htmlFor="remember-me" className="text-xs sm:text-sm text-muted-foreground cursor-pointer select-none">
            {t("auth.login.keepSignedIn")}
          </label>
        </div>

          </>
        )}

        {detectedBusinessRole ? (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 space-y-2">
            <div className="font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-600" />
              Business Account Detected ({detectedBusinessRole})
            </div>
            <p className="text-xs leading-relaxed text-amber-800">
              This login page is exclusively for Customers. Business accounts (Admin, Partner, Vendor, Staff, Cashier) must sign in through the Business Operations Portal.
            </p>
            <div className="pt-1">
              <Link
                href={ROUTES.public.businessLogin + (nextUrl ? `?next=${encodeURIComponent(nextUrl)}` : "")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-800 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-900 transition"
              >
                Go to Business Portal Sign In
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <ActionButton
          type="submit"
          disabled={submitting || googleSubmitting || (mfaRequired && mfaCode.length < 6)}
          className="public-action-primary h-12 w-full justify-center disabled:opacity-50"
        >
          {submitting
            ? mfaRequired
              ? "Verifying Code..."
              : t("auth.login.authenticating")
            : mfaRequired
            ? "Verify OTP & Sign In"
            : t("auth.login.signIn")}
          {!submitting && <ArrowRight className="h-4 w-4 ml-2" />}
        </ActionButton>

        {!mfaRequired && (
          <>
            {/* 100% Free Google Sign-In for Customers */}
            <div className="relative flex items-center justify-center my-3">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative bg-card px-3 text-xs uppercase tracking-wider text-muted-foreground">
                or customer sign in with
              </div>
            </div>

            <GoogleSignInButton
              onSuccess={handleGoogleSuccess}
              onError={(msg) => setError(msg)}
              disabled={submitting || googleSubmitting}
              text="signin_with"
            />
          </>
        )}

        <div className="rounded-2xl border border-primary/15 bg-primary/[0.03] space-y-2 p-3.5 sm:p-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-semibold text-foreground">Customer Workspace Protection</div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                View your Subidha EMI (SFEMI) schedules, invoices, and payments in one safe place.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-muted/30 p-3.5 sm:p-4 text-center space-y-2.5">
          <div className="text-xs sm:text-sm text-muted-foreground">
            {t("auth.login.noAccount")}
          </div>
          <Link
            href={ROUTES.public.register}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-primary/30 bg-primary/5 px-4 text-sm font-semibold text-primary transition hover:bg-primary/10 touch-manipulation"
          >
            {t("auth.login.createAccount")}
          </Link>
        </div>

        <div className="pt-2 border-t border-border/60 text-center text-xs text-muted-foreground">
          Partner, vendor, staff, or admin?{" "}
          <Link
            href={ROUTES.public.businessLogin + (nextUrl ? `?next=${encodeURIComponent(nextUrl)}` : "")}
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary transition"
          >
            Sign in to Business Portal
          </Link>
        </div>
      </form>

      <GooglePhoneModal
        isOpen={showPhoneModal}
        name={pendingGoogleData?.name}
        email={pendingGoogleData?.email}
        idToken={pendingGoogleData?.idToken || ""}
        onSubmitPhone={handlePhoneSubmit}
        onClose={() => {
          setShowPhoneModal(false);
          setPendingGoogleData(null);
        }}
        submitting={googleSubmitting}
        error={error}
      />
    </AuthLayoutShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center p-4"><div className="animate-pulse">Loading login...</div></div>}>
      <LoginContent />
    </Suspense>
  );
}
