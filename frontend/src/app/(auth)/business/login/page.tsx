// frontend/src/app/(auth)/business/login/page.tsx
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
  Building2,
  BadgeCheck,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useI18n } from "@/components/i18n/I18nProvider";
import { AuthLayoutShell } from "@/components/auth";
import ActionButton from "@/components/ui/ActionButton";
import { APP_NAME } from "@/lib/constants";
import { ROUTES } from "@/lib/routes";
import { getDashboardRouteForRole } from "@/lib/auth/redirect";
import { useAuth } from "@/providers/AuthProvider";
import { loginRequest, type LoginResponse } from "@/services/auth.service";

const ALLOWED_BUSINESS_ROLES = ["ADMIN", "PARTNER", "VENDOR", "STAFF", "CASHIER"] as const;

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

function BusinessLoginContent() {
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
  const [detectedCustomer, setDetectedCustomer] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");

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
    document.title = `Business Sign In | ${APP_NAME}`;
  }, [pathname]);

  // If already authenticated, redirect to appropriate workspace
  useEffect(() => {
    if (!isAuthenticated || !role) return;
    const normalizedRole = (role || "").trim().toUpperCase();
    if (normalizedRole === "CUSTOMER") {
      router.replace(ROUTES.customer.dashboard);
      return;
    }

    const isCustomerNext = nextUrl?.startsWith("/customer");
    const target = nextUrl && !isCustomerNext ? nextUrl : getDashboardRouteForRole(role);
    if (isExternalUrl(target) && typeof window !== "undefined") {
      window.location.assign(target);
      return;
    }
    router.replace(target);
  }, [isAuthenticated, role, router, nextUrl]);

  function handleAuthSuccess(
    response: LoginResponse,
    fallbackName?: string
  ) {
    const accessToken = response.access;
    const refreshToken = response.refresh;
    const resolvedRole =
      response.role ??
      response.user?.role ??
      response.user_role ??
      null;

    if (!accessToken || !refreshToken || !resolvedRole) {
      throw new Error("Invalid authentication response.");
    }

    const normalizedRole = (resolvedRole || "").trim().toUpperCase();

    // Strict boundary: Customer accounts are NOT permitted in business portal
    if (normalizedRole === "CUSTOMER" || !ALLOWED_BUSINESS_ROLES.includes(normalizedRole as any)) {
      setDetectedCustomer(true);
      setError(null);
      setSubmitting(false);
      return;
    }

    setDetectedCustomer(false);
    login({
      id: response.user?.id ?? 0,
      name:
        response.user?.name ??
        response.user?.username ??
        fallbackName ??
        "Staff",
      role: resolvedRole,
      accessToken,
      refreshToken,
    });

    // Offline profile cache for offline POS operations (Admin)
    if (normalizedRole === "ADMIN" && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          "subidha_offline_admin_profile",
          JSON.stringify({
            id: response.user?.id ?? 0,
            name: response.user?.name ?? fallbackName ?? "Admin",
            role: resolvedRole,
            accessToken,
            refreshToken,
            identifier: (fallbackName || "").trim().toLowerCase(),
            savedAt: new Date().toISOString(),
          })
        );
      } catch {
        // Ignore storage quota
      }
    }

    const isCustomerNext = nextUrl?.startsWith("/customer");
    const target =
      nextUrl && !isCustomerNext
        ? nextUrl
        : getDashboardRouteForRole(resolvedRole);

    if (typeof window !== "undefined") {
      window.location.assign(target);
      return;
    }

    router.replace(target);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mfaRequired && mfaCode.trim().length !== 6) {
      setError("Please enter the complete 6-digit verification code from your authenticator app.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setDetectedCustomer(false);

      const response = await loginRequest({
        identifier: identifier.trim(),
        password,
        mfa_code: mfaRequired ? mfaCode : undefined,
      });

      handleAuthSuccess(response, identifier.trim());
    } catch (err) {
      // Offline fallback handling for Admin POS counter
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
      formTitle="Business Operations Sign In"
      formSubtitle="Control room & operations login for Admin, Partners, Vendors, and Staff."
      panelTitle="SUBIDHA CORE ERP & Operations"
      panelDescription="Authorized management console for daily store operations, inventory, cashiering, partner commissions, and SFEMI contracts."
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
                    Two-Factor Authentication (MFA)
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Account: <span className="font-mono font-medium text-foreground">{identifier}</span>
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                Open <strong>Google Authenticator</strong> on your phone and enter the current 6-digit security code.
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
              <label htmlFor="identifier" className="text-sm font-medium text-foreground">
                Staff ID, Username, Email, or Phone
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="identifier"
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Enter staff ID, username, email, or phone"
                  className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
                  required
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-foreground">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-11 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
                  required
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40 focus-visible:ring-offset-2"
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

            <div className="flex items-center gap-2">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
              />
              <label htmlFor="remember-me" className="text-sm text-muted-foreground">
                Keep me signed in on this workstation
              </label>
            </div>
          </>
        )}

        {detectedCustomer ? (
          <div className="rounded-2xl border border-blue-300 bg-blue-50 p-4 text-sm text-blue-900 space-y-2">
            <div className="font-semibold flex items-center gap-2">
              <User className="h-4 w-4 text-blue-600" />
              Customer Account Detected
            </div>
            <p className="text-xs leading-relaxed text-blue-800">
              This portal is strictly for Business and Staff operations. To manage your SFEMI subscriptions, payments, and orders, please sign in via the Customer Portal.
            </p>
            <div className="pt-1">
              <Link
                href={ROUTES.public.login + (nextUrl ? `?next=${encodeURIComponent(nextUrl)}` : "")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-800 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-900 transition"
              >
                Go to Customer Sign In
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
          disabled={submitting || (mfaRequired && mfaCode.length < 6)}
          className="public-action-primary h-12 w-full justify-center disabled:opacity-50"
        >
          {submitting
            ? mfaRequired
              ? "Verifying Code..."
              : "Authenticating..."
            : mfaRequired
            ? "Verify OTP & Sign In"
            : "Sign In to Operations"}
          {!submitting && <ArrowRight className="h-4 w-4 ml-2" />}
        </ActionButton>

        <div className="rounded-2xl border border-border bg-card space-y-3 p-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-card text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
              <Building2 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">Operations Access Only</div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Authorized Admin, Partner, Vendor, and Staff accounts only. All access attempts are recorded in the security audit log.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <BadgeCheck className="h-3.5 w-3.5" />
            Direct role routing to Admin, Partner, Vendor, or Staff workspace.
          </div>
        </div>

        <div className="pt-3 border-t border-border/60 text-center text-xs text-muted-foreground">
          Looking for customer services?{" "}
          <Link
            href={ROUTES.public.login + (nextUrl ? `?next=${encodeURIComponent(nextUrl)}` : "")}
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary transition"
          >
            Sign in as Customer
          </Link>
        </div>
      </form>
    </AuthLayoutShell>
  );
}

export default function BusinessLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="animate-pulse">Loading operations sign in...</div>
        </div>
      }
    >
      <BusinessLoginContent />
    </Suspense>
  );
}
