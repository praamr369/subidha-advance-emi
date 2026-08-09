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
import ActionButton from "@/components/ui/ActionButton";
import AuthBrand from "@/components/auth/AuthBrand";
import { useI18n } from "@/components/i18n/I18nProvider";

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
  const { t } = useI18n();

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
    <div className="auth-shell grid w-full overflow-hidden bg-background xl:grid-cols-[1fr_1fr] min-h-[calc(100vh-4rem)]">
      {/* Left Panel - Desktop Only */}
      <section className="relative hidden overflow-hidden xl:block bg-slate-950 border-r border-border">
        <div className="absolute inset-0 pointer-events-none bg-[url('https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80')] bg-cover bg-center opacity-40 mix-blend-luminosity" />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-slate-950/90 via-slate-950/60 to-slate-900/90" />
        <div className="relative z-10 flex h-full w-full flex-col justify-between overflow-y-auto p-8 2xl:p-12">
          <div className="space-y-8">
            <AuthBrand tone="dark" />
            
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              Customer Registration
            </div>

            <div className="max-w-xl space-y-5">
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-white 2xl:text-4xl">
                  {t("auth.register.pageTitle")}
                </h1>
                <p className="text-base leading-7 text-slate-300">
                  {t("auth.register.pageDescription")}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FeatureCard
                  icon={<UserPlus className="h-5 w-5" />}
                  title={t("auth.register.feature1Title")}
                  description={t("auth.register.feature1Desc")}
                />
                <FeatureCard
                  icon={<KeyRound className="h-5 w-5" />}
                  title={t("auth.register.feature2Title")}
                  description={t("auth.register.feature2Desc")}
                />
                <FeatureCard
                  icon={<BadgeCheck className="h-5 w-5" />}
                  title={t("auth.register.feature3Title")}
                  description={t("auth.register.feature3Desc")}
                />
                <FeatureCard
                  icon={<ShieldCheck className="h-5 w-5" />}
                  title={t("auth.register.feature4Title")}
                  description={t("auth.register.feature4Desc")}
                />
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-400">
                {t("auth.register.accessTypeLabel")}
              </div>
              <div className="mt-2 text-sm font-semibold text-white">
                {t("auth.register.accessTypeValue")}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-400">
                {t("auth.register.workflowLabel")}
              </div>
              <div className="mt-2 text-sm font-semibold text-white">
                {t("auth.register.workflowValue")}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-400">
                {t("auth.register.securityLabel")}
              </div>
              <div className="mt-2 text-sm font-semibold text-white">
                {t("auth.register.securityValue")}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Right Panel - Form */}
      <section className="relative flex flex-col items-center justify-center py-10">
        <div className="relative mx-auto w-full max-w-[34rem] px-6 sm:px-8">
          <div className="xl:hidden mb-8">
            <AuthBrand tone="light" className="dark:hidden" />
            <AuthBrand tone="dark" className="hidden dark:flex" />
          </div>
          <div className="mb-6 xl:hidden">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Customer Registration
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {t("auth.register.mobileFormTitle")}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t("auth.register.mobileFormDesc")}
            </p>
          </div>

          <div className="mb-8 hidden xl:block">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Customer Registration
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
              {t("auth.register.desktopFormTitle")}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              {t("auth.register.desktopFormDesc")}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Identity Details */}
            <div className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6">
              <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-card-foreground">
                    {t("auth.register.identitySectionTitle")}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("auth.register.identitySectionDesc")}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                  {t("auth.register.step1Label")}
                </div>
              </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <label
                      htmlFor="username"
                      className="text-sm font-medium text-foreground"
                    >
                      {t("auth.register.usernameLabel")}
                    </label>
                    <div className="relative">
                      <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        id="username"
                        name="username"
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder={t("auth.register.usernamePlaceholder")}
                        className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
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
                    {t("auth.register.phoneLabel")}
                  </label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="phone"
                      name="phone"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder={t("auth.register.phonePlaceholder")}
                      className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
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
                    {t("auth.register.emailLabel")}
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
                      placeholder={t("auth.register.emailPlaceholder")}
                      className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
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
                    {t("auth.register.firstNameLabel")}
                  </label>
                  <input
                    id="firstName"
                    name="firstName"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder={t("auth.register.firstNamePlaceholder")}
                    className="h-12 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
                    disabled={submitting}
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="lastName"
                    className="text-sm font-medium text-foreground"
                  >
                    {t("auth.register.lastNameLabel")}
                  </label>
                  <input
                    id="lastName"
                    name="lastName"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder={t("auth.register.lastNamePlaceholder")}
                    className="h-12 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
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
                    {t("auth.register.passwordSetupTitle")}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("auth.register.passwordSetupDesc")}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                  {t("auth.register.step2Label")}
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="password"
                    className="text-sm font-medium text-foreground"
                  >
                    {t("auth.register.passwordLabel")}
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
                      placeholder={t("auth.register.passwordPlaceholder")}
                      className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-11 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
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
                        {t("auth.register.passwordStrengthLabel")}
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
                    {t("auth.register.confirmPasswordLabel")}
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
                      placeholder={t("auth.register.confirmPasswordPlaceholder")}
                      className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-11 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
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
                      {t("auth.register.accountTypeLabel")}
                    </div>
                    <div className="mt-1 text-sm font-medium text-foreground">
                      {t("auth.register.accountTypeValue")}
                    </div>
                    <div className="mt-3 text-xs leading-5 text-muted-foreground">
                      {t("auth.register.accountTypeDesc")}
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
                  {t("auth.register.alertText")}
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
                    className="public-action-primary h-12 flex-1 justify-center disabled:opacity-50"
                  >
                    {submitting ? t("auth.register.creatingAccount") : t("auth.register.createAccountBtn")}
                    {!submitting && <ArrowRight className="h-4 w-4 ml-2" />}
                  </button>

                  <Link
                    href="/login"
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
                  >
                    {t("auth.register.backToSignIn")}
                  </Link>
                </div>
              </div>

              <aside className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t("auth.register.summaryTitle")}
                </h3>

                <dl className="mt-4 space-y-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("auth.register.accountTypeLabel")}
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-foreground break-words">
                      {t("auth.register.accountTypeValue")}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("auth.register.usernameLabel")}
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-foreground break-words">
                      {username.trim() || "—"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-muted-foreground">{t("auth.register.phoneLabel")}</dt>
                    <dd className="mt-1 text-sm font-medium text-foreground break-words">
                      {phone.trim() || "—"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-muted-foreground">{t("auth.register.emailLabel")}</dt>
                    <dd className="mt-1 text-sm font-medium text-foreground break-words">
                      {email.trim() || "—"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("auth.register.displayNameLabel")}
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
                    {t("auth.register.beforeSubmitTitle")}
                  </h4>
                  <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
                    <li>{t("auth.register.rule1")}</li>
                    <li>{t("auth.register.rule2")}</li>
                    <li>{t("auth.register.rule3")}</li>
                    <li>{t("auth.register.rule4")}</li>
                  </ul>
                </div>
              </aside>
            </div>
          </form>

          <div className="mt-8 border-t border-border pt-5 text-center text-sm text-muted-foreground">
            {t("auth.register.alreadyHaveAccount")}{" "}
            <Link
              href="/login"
              className="rounded font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35 focus-visible:ring-offset-2"
            >
              {t("auth.login.signIn")}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
