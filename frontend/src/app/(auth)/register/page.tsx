"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Eye,
  EyeOff,
  ShieldCheck,
  UserRound,
  Phone,
  Mail,
  Lock,
  CheckCircle2,
  ArrowRight,
  BadgeCheck,
  KeyRound,
  UserPlus,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { API_BASE_URL } from "@/lib/constants";

type RegisterResponse = {
  access?: string;
  refresh?: string;
  user?: {
    id?: number;
    username?: string;
    role?: string;
  };
  detail?: string;
};

function toMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Registration failed.";

  const raw = error.message.trim();
  if (!raw) return "Registration failed.";

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail;
    }

    const firstValue = Object.values(parsed)[0];
    if (Array.isArray(firstValue) && typeof firstValue[0] === "string") {
      return firstValue[0];
    }
    if (typeof firstValue === "string") return firstValue;
  } catch {
    //
  }

  return raw;
}

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, "").trim();
}

function getPasswordChecks(password: string) {
  return {
    minLength: password.length >= 8,
    hasLetter: /[A-Za-z]/.test(password),
    hasNumber: /\d/.test(password),
  };
}

function passwordStrengthLabel(password: string): {
  label: string;
  className: string;
  barClassName: string;
} {
  const checks = getPasswordChecks(password);
  const score =
    Number(checks.minLength) +
    Number(checks.hasLetter) +
    Number(checks.hasNumber);

  if (!password) {
    return {
      label: "Not set",
      className: "text-muted-foreground",
      barClassName: "w-1/4 bg-muted",
    };
  }

  if (score <= 1) {
    return {
      label: "Weak",
      className: "text-red-600",
      barClassName: "w-1/3 bg-red-500",
    };
  }

  if (score === 2) {
    return {
      label: "Medium",
      className: "text-amber-600",
      barClassName: "w-2/3 bg-amber-500",
    };
  }

  return {
    label: "Strong",
    className: "text-emerald-600",
    barClassName: "w-full bg-emerald-500",
  };
}

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function FieldHint({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs break-words",
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-border bg-background text-muted-foreground"
      )}
    >
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
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
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white">
        {icon}
      </div>
      <div className="text-sm font-semibold text-white">{title}</div>
      <p className="mt-1 text-sm leading-6 text-slate-300">{description}</p>
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Register | SUBIDHA CORE";
  }, []);

  const passwordChecks = useMemo(() => getPasswordChecks(password), [password]);
  const passwordStrength = useMemo(
    () => passwordStrengthLabel(password),
    [password]
  );

  const isPasswordConfirmed =
    confirmPassword.length > 0 &&
    password.length > 0 &&
    password === confirmPassword;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedUsername = username.trim();
    const trimmedPhone = normalizePhone(phone);
    const trimmedEmail = email.trim();
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();

    if (!trimmedUsername) {
      setError("Username is required.");
      return;
    }

    if (!trimmedPhone) {
      setError("Phone is required.");
      return;
    }

    if (!trimmedEmail) {
      setError("Email is required for customer access and password reset.");
      return;
    }

    if (!password) {
      setError("Password is required.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError("Password should include at least one letter and one number.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Password and confirm password must match.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccessMessage(null);

      const response = await fetch(
        `${API_BASE_URL.replace(/\/api\/v1\/?$/, "")}/api/v1/auth/register/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: trimmedUsername,
            password,
            role: "CUSTOMER",
            phone: trimmedPhone,
            email: trimmedEmail,
            first_name: trimmedFirstName,
            last_name: trimmedLastName,
          }),
        }
      );

      const contentType = response.headers.get("content-type") || "";
      const payload: RegisterResponse | string = contentType.includes(
        "application/json"
      )
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        throw new Error(
          typeof payload === "string" ? payload : JSON.stringify(payload)
        );
      }

      setSuccessMessage(
        "Customer account created successfully. Redirecting to sign in..."
      );

      window.setTimeout(() => {
        router.replace("/login");
      }, 1000);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell grid w-full overflow-hidden bg-background/95 backdrop-blur xl:grid-cols-[1fr_1fr]">
      {/* Left Panel - Desktop Only */}
      <section className="relative hidden overflow-hidden xl:block">
        <div className="absolute inset-0 bg-slate-950" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.2),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(160,110,72,0.18),_transparent_36%)]" />
        <div className="relative z-10 flex h-full w-full flex-col justify-between overflow-y-auto p-8 2xl:p-12">
          <div className="space-y-8">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              SUBIDHA CORE
            </div>

            <div className="max-w-xl space-y-5">
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-white 2xl:text-4xl">
                  Customer registration built for a production workflow
                </h1>
                <p className="text-base leading-7 text-slate-300">
                  Create a customer account to access subscription tracking,
                  payment visibility, EMI history, and future account
                  services in a structured and secure way.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FeatureCard
                  icon={<UserPlus className="h-5 w-5" />}
                  title="Customer-only public access"
                  description="Admin, cashier, and partner identities remain internally controlled."
                />
                <FeatureCard
                  icon={<KeyRound className="h-5 w-5" />}
                  title="Secure credential setup"
                  description="Password validation and confirmation are enforced before registration."
                />
                <FeatureCard
                  icon={<BadgeCheck className="h-5 w-5" />}
                  title="Operationally clean onboarding"
                  description="Only essential profile data is collected during initial account creation."
                />
                <FeatureCard
                  icon={<ShieldCheck className="h-5 w-5" />}
                  title="Future-ready access"
                  description="Supports later expansion into broader customer-facing service modules."
                />
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-400">
                Access type
              </div>
              <div className="mt-2 text-sm font-semibold text-white">
                Customer account
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-400">
                Workflow
              </div>
              <div className="mt-2 text-sm font-semibold text-white">
                Self registration
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-400">
                Security
              </div>
              <div className="mt-2 text-sm font-semibold text-white">
                Password protected
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Right Panel - Form (Always Visible) */}
      <section className="flex min-h-full items-center">
        <div className="mx-auto flex w-full max-w-2xl flex-col px-4 py-6 sm:px-6 md:px-8 lg:px-10 xl:px-12 xl:py-10">
          <div className="mb-6 xl:hidden">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Customer Registration
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Create your customer account
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Register to view subscriptions, payment history, EMI tracking,
              and future customer services.
            </p>
          </div>

          <div className="mb-8 hidden xl:block">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Customer Registration
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
              Create your customer account
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Public registration is limited to customers. Partner, admin,
              and cashier accounts remain managed internally by authorized
              staff.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Identity Details */}
            <div className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6">
              <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-card-foreground">
                    Identity details
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Used for login and basic customer profile setup.
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                  Step 1 of 2
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <label
                    htmlFor="username"
                    className="text-sm font-medium text-foreground"
                  >
                    Username
                  </label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="username"
                      name="username"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Choose a username"
                      className="h-12 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
                      required
                      disabled={submitting}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="phone"
                    className="text-sm font-medium text-foreground"
                  >
                    Phone
                  </label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="phone"
                      name="phone"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Enter phone number"
                      className="h-12 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
                      required
                      disabled={submitting}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="email"
                    className="text-sm font-medium text-foreground"
                  >
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter email"
                      className="h-12 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
                      required
                      disabled={submitting}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="firstName"
                    className="text-sm font-medium text-foreground"
                  >
                    First name
                  </label>
                  <input
                    id="firstName"
                    name="firstName"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    className="h-12 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
                    disabled={submitting}
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="lastName"
                    className="text-sm font-medium text-foreground"
                  >
                    Last name
                  </label>
                  <input
                    id="lastName"
                    name="lastName"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    className="h-12 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
                    disabled={submitting}
                  />
                </div>
              </div>
            </div>

            {/* Password Setup */}
            <div className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6">
              <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-card-foreground">
                    Password setup
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Create a secure password for account access.
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                  Step 2 of 2
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="password"
                    className="text-sm font-medium text-foreground"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a password"
                      className="h-12 w-full rounded-xl border border-input bg-background pl-10 pr-11 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
                      required
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      disabled={submitting}
                      className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2 disabled:opacity-50"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  <div className="workspace-filter-bar space-y-2 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Password strength
                      </span>
                      <span
                        className={`text-xs font-medium ${passwordStrength.className}`}
                      >
                        {passwordStrength.label}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          passwordStrength.barClassName
                        )}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="confirmPassword"
                    className="text-sm font-medium text-foreground"
                  >
                    Confirm password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="h-12 w-full rounded-xl border border-input bg-background pl-10 pr-11 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
                      required
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      disabled={submitting}
                      className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2 disabled:opacity-50"
                      aria-label={
                        showConfirmPassword
                          ? "Hide confirm password"
                          : "Show confirm password"
                      }
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  <div className="workspace-filter-bar p-3">
                    <div className="text-xs text-muted-foreground">
                      Account type
                    </div>
                    <div className="mt-1 text-sm font-medium text-foreground">
                      Customer
                    </div>
                    <div className="mt-3 text-xs leading-5 text-muted-foreground">
                      Internal roles such as admin, cashier, and partner are
                      not created from this page.
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <FieldHint
                  ok={passwordChecks.minLength}
                  text="At least 8 characters"
                />
                <FieldHint
                  ok={passwordChecks.hasLetter}
                  text="Contains a letter"
                />
                <FieldHint
                  ok={passwordChecks.hasNumber}
                  text="Contains a number"
                />
                <FieldHint
                  ok={isPasswordConfirmed}
                  text="Passwords match"
                />
              </div>
            </div>

            {/* Actions & Summary */}
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  Public self-registration is limited to{" "}
                  <span className="font-semibold">customer accounts</span>.
                  Partner, admin, and cashier accounts are created
                  internally by authorized staff.
                </div>

                {error ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                {successMessage ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {successMessage}
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 pt-1 sm:flex-row">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span>
                      {submitting
                        ? "Creating account..."
                        : "Create customer account"}
                    </span>
                    {!submitting ? <ArrowRight className="h-4 w-4" /> : null}
                  </button>

                  <Link
                    href="/login"
                    className="inline-flex h-12 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
                  >
                    Back to sign in
                  </Link>
                </div>
              </div>

              <aside className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Registration summary
                </h3>

                <dl className="mt-4 space-y-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Account type
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-foreground break-words">
                      Customer
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Username
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-foreground break-words">
                      {username.trim() || "—"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-muted-foreground">Phone</dt>
                    <dd className="mt-1 text-sm font-medium text-foreground break-words">
                      {phone.trim() || "—"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-muted-foreground">Email</dt>
                    <dd className="mt-1 text-sm font-medium text-foreground break-words">
                      {email.trim() || "—"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Display name
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-foreground break-words">
                      {[firstName.trim(), lastName.trim()]
                        .filter(Boolean)
                        .join(" ") || "—"}
                    </dd>
                  </div>
                </dl>

                <div className="mt-6 border-t border-border pt-5">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Before you submit
                  </h4>
                  <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
                    <li>Use a unique username you can remember.</li>
                    <li>Use your working phone number for account linkage.</li>
                    <li>Keep your password private.</li>
                    <li>Partner access is not created from this page.</li>
                  </ul>
                </div>
              </aside>
            </div>
          </form>

          <div className="mt-8 border-t border-border pt-5 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="rounded font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
