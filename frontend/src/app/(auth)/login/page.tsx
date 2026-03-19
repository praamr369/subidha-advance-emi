"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

import { APP_NAME } from "@/lib/constants";
import { getDashboardRouteForRole } from "@/lib/auth/redirect";
import { ROUTES } from "@/lib/routes";
import { useAuth } from "@/providers/AuthProvider";
import { loginRequest } from "@/services/auth.service";

function toMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Login failed.";
}

export default function LoginPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { login, isAuthenticated, role } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      const resolvedRole = response.role ?? response.user?.role ?? null;

      if (!accessToken || !refreshToken || !resolvedRole) {
        throw new Error("Invalid login response.");
      }

      login({
        id: response.user?.id ?? 0,
        name: response.user?.name ?? response.user?.username ?? username.trim(),
        role: resolvedRole,
        accessToken,
        refreshToken,
      });

      const target = nextUrl || getDashboardRouteForRole(resolvedRole);

      router.replace(target);
      router.refresh();
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-12">
        <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-foreground">Login</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to continue to {APP_NAME}.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="mb-2 block text-sm font-medium text-foreground">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring"
                placeholder="Enter username"
                disabled={submitting}
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-foreground">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 pr-12 text-sm outline-none transition focus:border-ring"
                  placeholder="Enter password"
                  disabled={submitting}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  disabled={submitting}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error ? (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href={ROUTES.public.register} className="font-medium text-foreground underline">
              Register
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}