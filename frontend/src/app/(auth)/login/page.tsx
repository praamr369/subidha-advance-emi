// frontend/src/app/(auth)/login/page.tsx
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Eye,
  EyeOff,
  ShieldCheck,
  Building2,
  Lock,
  User,
  ArrowRight,
  
  BarChart3,
  Users,
  TrendingUp,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition hover:border-white/20">
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white">
        {icon}
      </div>
      <div className="text-sm font-semibold text-white">{title}</div>
      <p className="mt-1 text-sm leading-6 text-slate-300">{description}</p>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { login, isAuthenticated, role } = useAuth();

  const [username, setUsername] = useState("");
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
    router.replace(getDashboardRouteForRole(role));
  }, [isAuthenticated, role, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setSubmitting(true);
      setError(null);

      const response = await loginRequest({
        username: username.trim(),
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
          username.trim(),
        role: resolvedRole,
        accessToken,
        refreshToken,
      });

      const target = nextUrl || getDashboardRouteForRole(resolvedRole);

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
    <div className="grid w-full overflow-hidden rounded-[28px] border border-border/60 bg-background/95 shadow-2xl backdrop-blur xl:grid-cols-[1fr_1fr]">
      {/* Left Panel - Desktop Only */}
      <section className="relative hidden overflow-hidden xl:block">
        <div className="absolute inset-0 bg-slate-950" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.28),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.22),_transparent_32%)]" />
        <div className="relative z-10 flex h-full w-full flex-col justify-between overflow-y-auto p-8 2xl:p-12">
          <div className="space-y-8">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
              <Building2 className="h-3.5 w-3.5" />
              Subidha Furniture
            </div>

            <div className="max-w-xl space-y-5">
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-white 2xl:text-4xl">
                  Welcome back to SUBIDHA CORE
                </h1>
                <p className="text-base leading-7 text-slate-300">
                  Access your subscription management dashboard, track EMIs,
                  reconcile payments, and manage customer operations with
                  enterprise-grade security.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FeatureCard
                  icon={<BarChart3 className="h-5 w-5" />}
                  title="Real-time Analytics"
                  description="Monitor subscription health, collection efficiency, and revenue trends at a glance."
                />
                <FeatureCard
                  icon={<Users className="h-5 w-5" />}
                  title="Role-based Access"
                  description="Secure access for admin, cashier, partner, and customer roles with granular permissions."
                />
                <FeatureCard
                  icon={<TrendingUp className="h-5 w-5" />}
                  title="Growth Insights"
                  description="Track EMI performance, customer retention, and expansion opportunities."
                />
                <FeatureCard
                  icon={<ShieldCheck className="h-5 w-5" />}
                  title="Enterprise Security"
                  description="Multi-factor authentication, audit logs, and encrypted data protection."
                />
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-400">
                Uptime
              </div>
              <div className="mt-2 text-sm font-semibold text-white">
                99.99%
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-400">
                Active Users
              </div>
              <div className="mt-2 text-sm font-semibold text-white">
                10,000+
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-400">
                Supported
              </div>
              <div className="mt-2 text-sm font-semibold text-white">
                24/7
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Right Panel - Form */}
      <section className="flex min-h-full items-center">
        <div className="mx-auto flex w-full max-w-2xl flex-col px-4 py-6 sm:px-6 md:px-8 lg:px-10 xl:px-12 xl:py-10">
          <div className="mb-6 xl:hidden">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              SUBIDHA CORE
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Welcome back
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Sign in to access your dashboard and manage subscriptions.
            </p>
          </div>

          <div className="mb-8 hidden xl:block">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Secure Access
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
              Sign in to your account
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Use your credentials to access the SUBIDHA CORE platform. All
              sessions are encrypted and monitored for security.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6">
              <div className="space-y-5">
                <div className="space-y-2">
                  <label
                    htmlFor="username"
                    className="text-sm font-medium text-foreground"
                  >
                    Username
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter your username"
                      className="h-12 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground"
                      required
                      disabled={submitting}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="password"
                      className="text-sm font-medium text-foreground"
                    >
                      Password
                    </label>
                    <Link
                      href="/forgot-password"
                      className="text-xs text-muted-foreground transition hover:text-foreground"
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
                      className="h-12 w-full rounded-xl border border-input bg-background pl-10 pr-11 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground"
                      required
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center justify-center text-muted-foreground transition hover:text-foreground"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
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
                  <label
                    htmlFor="remember-me"
                    className="text-sm text-muted-foreground"
                  >
                    Keep me signed in
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
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>{submitting ? "Authenticating..." : "Sign in"}</span>
                  {!submitting && <ArrowRight className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link
                href={ROUTES.public.register}
                className="font-medium text-foreground transition hover:underline"
              >
                Create a customer account
              </Link>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}