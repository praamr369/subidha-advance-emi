// frontend/src/app/(auth)/login/page.tsx
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
import { AuthLayoutShell } from "@/components/auth";
import ActionButton from "@/components/ui/ActionButton";
import { APP_NAME } from "@/lib/constants";
import { ROUTES } from "@/lib/routes";
import { getDashboardRouteForRole } from "@/lib/auth/redirect";
import { useAuth } from "@/providers/AuthProvider";
import { loginRequest } from "@/services/auth.service";

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
export default function LoginPage() {
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

  const nextUrl = useMemo(() => {
    const next = searchParams.get("next");
    if (!next) return null;
    if (!next.startsWith("/")) return null;
    return next;
  }, [searchParams]);

  useEffect(() => {
    document.title = `Login | ${APP_NAME}`;
  }, [pathname]);

  useEffect(() => {
    if (!isAuthenticated || !role) return;
    const target = getDashboardRouteForRole(role);
    if (isExternalUrl(target) && typeof window !== "undefined") {
      window.location.assign(target);
      return;
    }
    router.replace(target);
  }, [isAuthenticated, role, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setSubmitting(true);
      setError(null);

      const response = await loginRequest({
        identifier: identifier.trim(),
        password,
      });

      const accessToken = response.access;
      const refreshToken = response.refresh;
      const resolvedRole =
        response.role ??
        response.user?.role ??
        response.user_role ??
        null;

      if (!accessToken || !refreshToken || !resolvedRole) {
        throw new Error("Invalid login response.");
      }

      login({
        id: response.user?.id ?? 0,
        name:
          response.user?.name ??
          response.user?.username ??
          identifier.trim(),
        role: resolvedRole,
        accessToken,
        refreshToken,
      });

      const normalizedRole = (resolvedRole || "").trim().toUpperCase();
      const target =
        normalizedRole === "ADMIN"
          ? getDashboardRouteForRole(resolvedRole)
          : nextUrl || getDashboardRouteForRole(resolvedRole);

      if (typeof window !== "undefined") {
        window.location.assign(target);
        return;
      }

      router.replace(target);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayoutShell
      formTitle={t("auth.login.formTitle")}
      formSubtitle={t("auth.login.formSubtitle")}
      panelTitle={t("auth.login.panelTitle")}
      panelDescription={t("auth.login.panelDescription")}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="identifier" className="text-sm font-medium text-foreground">
            {t("auth.login.identifierLabel")}
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
              placeholder={t("auth.login.identifierPlaceholder")}
              className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
              required
              disabled={submitting}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              {t("auth.login.passwordLabel")}
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              {t("auth.login.forgotPassword")}
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
              placeholder={t("auth.login.passwordPlaceholder")}
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
            {t("auth.login.keepSignedIn")}
          </label>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="public-action-primary h-12 w-full justify-center disabled:opacity-50"
        >
          {submitting ? t("auth.login.authenticating") : t("auth.login.signIn")}
          {!submitting && <ArrowRight className="h-4 w-4 ml-2" />}
        </button>

        <div className="rounded-2xl border border-border bg-card space-y-3 p-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-card text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">{t("auth.login.authorizedOnly")}</div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {t("auth.login.authorizedDescription")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <BadgeCheck className="h-3.5 w-3.5" />
            {t("auth.login.loginRouting")}
          </div>
        </div>

        <div className="text-center text-sm text-muted-foreground">
          {t("auth.login.noAccount")}{" "}
          <Link
            href={ROUTES.public.register}
            className="rounded font-semibold text-foreground transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40 focus-visible:ring-offset-2"
          >
            {t("auth.login.createAccount")}
          </Link>
        </div>
      </form>
    </AuthLayoutShell>
  );
}
