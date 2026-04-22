// frontend/src/domains/customers/pages/AdminCustomerCreatePage.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Mail,
  Phone,
  Shield,
  User,
  UserCheck,
  UserPlus,
  XCircle,
  AlertCircle,
} from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import FormActions from "@/components/ui/FormActions";
import PortalPage from "@/components/ui/PortalPage";
import { DetailItem as DetailRow, WorkspaceSection as SectionCard } from "@/components/ui/workspace";
import OtpDeliveryReadinessCard from "@/domains/customers/components/OtpDeliveryReadinessCard";
import {
  buildForgotPasswordHref,
  resolvePasswordResetEmail,
} from "@/lib/auth/password-reset";
import { apiFetch } from "@/lib/api";

type AdminCustomerCreateVariant = "page" | "drawer";

type KycStatus = "PENDING" | "APPROVED" | "REJECTED";

type CreatedCustomerResponse = {
  id: number;
  user?: number | null;
  user_username?: string;
  name?: string;
  phone?: string;
  email?: string;
  kyc_status?: string;
  created_at?: string;
};

type ValidationErrors = Partial<Record<
  "name" | "phone" | "username" | "password" | "email" | "kyc_status",
  string
>>;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to create customer.";
}

function normalizeApiMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Failed to create customer.";
  }

  const raw = error.message.trim();
  if (!raw) return "Failed to create customer.";

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail;
    }

    const firstValue = Object.values(parsed)[0];
    if (Array.isArray(firstValue) && firstValue.length > 0) {
      return String(firstValue[0]);
    }

    if (typeof firstValue === "string") {
      return firstValue;
    }

    return raw;
  } catch {
    return raw;
  }
}

function parseFieldErrors(error: unknown): ValidationErrors {
  if (!(error instanceof Error)) return {};

  const raw = error.message.trim();
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: ValidationErrors = {};

    const assign = (key: keyof ValidationErrors) => {
      const value = parsed[key];
      if (Array.isArray(value) && value.length > 0) {
        next[key] = String(value[0]);
        return;
      }
      if (typeof value === "string") {
        next[key] = value;
      }
    };

    assign("name");
    assign("phone");
    assign("username");
    assign("password");
    assign("email");
    assign("kyc_status");

    return next;
  } catch {
    return {};
  }
}

function toOptionalString(value: string | null): string {
  return value?.trim() || "";
}

// Password strength checker
function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
  barWidth: string;
} {
  if (!password) {
    return { score: 0, label: "Not set", color: "text-muted-foreground", barWidth: "w-1/4" };
  }

  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) {
    return { score, label: "Weak", color: "text-red-600", barWidth: "w-1/3" };
  }
  if (score <= 4) {
    return { score, label: "Medium", color: "text-amber-600", barWidth: "w-2/3" };
  }
  return { score, label: "Strong", color: "text-emerald-600", barWidth: "w-full" };
}

// Field error display
function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 flex items-center gap-1 text-xs text-destructive">
      <AlertCircle className="h-3 w-3" />
      {message}
    </p>
  );
}

// Input with icon and optional show/hide
function InputField({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  icon,
  error,
  required = false,
  disabled = false,
  showPasswordToggle = false,
  showPassword,
  onTogglePassword,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  icon?: React.ReactNode;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  showPasswordToggle?: boolean;
  showPassword?: boolean;
  onTogglePassword?: () => void;
}) {
  const inputType = showPasswordToggle && showPassword ? "text" : type;

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </label>
      <div className="relative">
        {icon && (
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </div>
        )}
        <input
          id={id}
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={[
            "h-12 w-full rounded-xl border bg-background px-4 text-sm text-foreground outline-none transition",
            icon ? "pl-10" : "",
            showPasswordToggle ? "pr-12" : "pr-4",
            error
              ? "border-destructive focus:border-destructive focus:ring-destructive/20"
              : "border-input focus:border-ring focus:ring-2 focus:ring-ring/20",
          ].join(" ")}
        />
        {showPasswordToggle && onTogglePassword && (
          <button
            type="button"
            onClick={onTogglePassword}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      <FieldError message={error} />
    </div>
  );
}

export default function AdminCustomerCreatePage({
  variant = "page",
  queryString,
  onCreated,
}: {
  variant?: AdminCustomerCreateVariant;
  queryString?: string;
  onCreated?: (customerId: number) => void;
} = {}) {
  const runtimeSearchParams = useSearchParams();
  const searchParams = useMemo(() => {
    const raw = (queryString ?? "").trim();
    if (raw) return new URLSearchParams(raw.replace(/^\?/, ""));
    return runtimeSearchParams;
  }, [queryString, runtimeSearchParams]);
  const searchParamKey = searchParams.toString();

  const leadId = toOptionalString(searchParams.get("lead"));
  const leadProductId = toOptionalString(searchParams.get("product"));
  const leadProductName =
    toOptionalString(searchParams.get("product_name")) ||
    toOptionalString(searchParams.get("interested_product"));
  const leadNotes = toOptionalString(searchParams.get("notes"));
  const canonicalSelfHref = useMemo(() => {
    const raw = (queryString ?? "").trim();
    if (!raw) return "/admin/customers/create";
    return raw.startsWith("?") ? `/admin/customers/create${raw}` : `/admin/customers/create?${raw}`;
  }, [queryString]);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [kycStatus, setKycStatus] = useState<KycStatus>("PENDING");
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ValidationErrors>({});
  const [success, setSuccess] = useState<CreatedCustomerResponse | null>(null);

  const trimmedName = name.trim();
  const trimmedPhone = phone.trim();
  const trimmedCity = city.trim();
  const trimmedEmail = email.trim();
  const trimmedUsername = username.trim();

  const passwordStrength = useMemo(
    () => getPasswordStrength(password),
    [password]
  );

  const canSubmit = useMemo(() => {
    return (
      trimmedName.length > 0 &&
      trimmedPhone.length > 0 &&
      trimmedEmail.length > 0 &&
      trimmedUsername.length > 0 &&
      password.trim().length >= 8 &&
      kycStatus.length > 0
    );
  }, [trimmedEmail, trimmedName, trimmedPhone, trimmedUsername, password, kycStatus]);

  useEffect(() => {
    const nextName = toOptionalString(searchParams.get("name"));
    const nextPhone = toOptionalString(searchParams.get("phone"));
    const nextCity = toOptionalString(searchParams.get("city"));

    if (nextName) setName(nextName);
    if (nextPhone) setPhone(nextPhone);
    if (nextCity) setCity(nextCity);
  }, [searchParamKey, searchParams]);

  const nextSubscriptionHref = useMemo(() => {
    if (!success) return "/admin/subscriptions/create";

    const params = new URLSearchParams();
    params.set("customer", String(success.id));
    if (/^\d+$/.test(leadProductId)) {
      params.set("product", leadProductId);
    }
    if (leadId) params.set("lead", leadId);
    if (leadProductName) params.set("lead_product_name", leadProductName);
    if (leadNotes) params.set("lead_notes", leadNotes);

    const query = params.toString();
    return query ? `/admin/subscriptions/create?${query}` : "/admin/subscriptions/create";
  }, [success, leadId, leadNotes, leadProductId, leadProductName]);

  const returnToLeadHref = useMemo(() => {
    if (!success || !leadId) return null;

    const params = new URLSearchParams();
    params.set("converted_customer", String(success.id));
    return `/admin/leads/${leadId}?${params.toString()}`;
  }, [leadId, success]);

  const accessResetIdentifier = useMemo(
    () =>
      resolvePasswordResetEmail({
        email: success?.email || trimmedEmail,
      }),
    [success?.email, trimmedEmail]
  );

  const accessResetHref = useMemo(
    () => buildForgotPasswordHref(accessResetIdentifier),
    [accessResetIdentifier]
  );
  const isDrawer = variant === "drawer";

  function resetForm() {
    setName("");
    setPhone("");
    setCity("");
    setEmail("");
    setUsername("");
    setPassword("");
    setKycStatus("PENDING");
    setShowPassword(false);
    setError(null);
    setFieldErrors({});
    setSuccess(null);
  }

  function validate(): ValidationErrors {
    const next: ValidationErrors = {};

    if (!trimmedName) {
      next.name = "Full name is required.";
    }

    if (!trimmedPhone) {
      next.phone = "Phone number is required.";
    }

    if (!trimmedUsername) {
      next.username = "Username is required.";
    }

    if (!password.trim()) {
      next.password = "Password is required.";
    } else if (password.trim().length < 8) {
      next.password = "Password must be at least 8 characters.";
    }

    if (!trimmedEmail) {
      next.email = "Email is required for customer access and password reset.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      next.email = "Enter a valid email address.";
    }

    if (!kycStatus) {
      next.kyc_status = "KYC status is required.";
    }

    return next;
  }

  async function handleSubmit() {
    setError(null);
    setSuccess(null);

    const nextFieldErrors = validate();
    setFieldErrors(nextFieldErrors);

    if (Object.keys(nextFieldErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    setLoadingLabel("Creating customer profile and login...");

    try {
      const payload = await apiFetch<CreatedCustomerResponse>("/admin/customers/", {
        method: "POST",
        body: JSON.stringify({
          name: trimmedName,
          phone: trimmedPhone,
          city: trimmedCity,
          email: trimmedEmail || "",
          username: trimmedUsername,
          password: password.trim(),
          kyc_status: kycStatus,
        }),
      });

      setSuccess(payload);
      onCreated?.(payload.id);
      setFieldErrors({});
    } catch (err) {
      setFieldErrors(parseFieldErrors(err));
      setError(normalizeApiMessage(err) || toErrorMessage(err));
    } finally {
      setSubmitting(false);
      setLoadingLabel(null);
    }
  }

  return (
    <PortalPage
      title={variant === "drawer" ? "Customer onboarding" : "Create Customer"}
      subtitle="Create a customer profile and customer login for downstream subscription and collection workflows."
      breadcrumbs={
        variant === "drawer"
          ? []
          : [
              { label: "Admin", href: "/admin" },
              { label: "Customers", href: "/admin/customers" },
              { label: "Create" },
            ]
      }
      actions={
        variant === "drawer"
          ? [
              { href: canonicalSelfHref, label: "Open full page", variant: "secondary" },
              { href: "/admin/customers", label: "Customer Register", variant: "ghost" },
            ]
          : [
              {
                href: "/admin/customers",
                label: "Back to Register",
                variant: "secondary",
              },
              ...(leadId
                ? [
                    {
                      href: `/admin/leads/${leadId}`,
                      label: "Back to Lead",
                      variant: "secondary" as const,
                    },
                  ]
                : []),
              {
                href: "/admin/subscriptions/create",
                label: "Create Subscription",
                variant: "secondary",
              },
            ]
      }
      stats={
        variant === "drawer"
          ? []
          : [
              {
                label: "KYC Status",
                value: kycStatus,
                tone: kycStatus === "APPROVED" ? "success" : kycStatus === "REJECTED" ? "danger" : "warning",
              },
              {
                label: "Login Provisioning",
                value: "Required",
              },
              {
                label: "Phone Entered",
                value: trimmedPhone || "—",
              },
              {
                label: "Username Entered",
                value: trimmedUsername || "—",
              },
            ]
      }
      statusBadge={{
        label: "Customer Onboarding",
        tone: "info",
      }}
      presentation={variant === "drawer" ? "popup" : "page"}
      maxWidth={variant === "drawer" ? "100%" : undefined}
    >
      <div className="space-y-6">
        {leadId ? (
          <SectionCard
            title="Lead Handoff Context"
            description="This customer create form was opened from the admin lead triage workflow. The lead contact fields were prefilled for operator review."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <DetailRow label="Lead Reference" value={`Lead #${leadId}`} />
              <DetailRow label="Lead Name" value={trimmedName || "—"} />
              <DetailRow label="Lead Phone" value={trimmedPhone || "—"} />
              <DetailRow
                label="Interested Product"
                value={leadProductName || "No product context"}
              />
            </div>

            {leadNotes ? (
              <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Lead Notes
                </div>
                <div className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                  {leadNotes}
                </div>
              </div>
            ) : null}
          </SectionCard>
        ) : null}

        {!isDrawer ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Profile Completion</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">
                      {trimmedName && trimmedPhone ? "Ready" : "Incomplete"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-primary/10 p-2 text-primary">
                    <UserCheck className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {trimmedName && trimmedPhone
                    ? "All required fields filled"
                    : "Name and phone are required"}
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Password Strength</p>
                    <p className={`mt-2 text-2xl font-semibold ${passwordStrength.color}`}>
                      {passwordStrength.label}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted p-2 text-muted-foreground">
                    <Shield className="h-5 w-5" />
                  </div>
                </div>
                {password ? (
                  <div className="mt-3">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${passwordStrength.barWidth} ${
                          passwordStrength.score <= 2
                            ? "bg-red-500"
                            : passwordStrength.score <= 4
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                        }`}
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Login Status</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">
                      {trimmedUsername && password ? "Ready" : "Incomplete"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted p-2 text-muted-foreground">
                    <User className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {trimmedUsername && password
                    ? "Username and password set"
                    : "Username and password required"}
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Form Status</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">
                      {canSubmit ? "Valid" : "Invalid"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted p-2 text-muted-foreground">
                    {canSubmit ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {canSubmit
                    ? "All required fields are filled correctly"
                    : "Complete all required fields"}
                </p>
              </div>
            </div>

            <SectionCard
              title="Onboarding Overview"
              description="In the current admin workflow, customer creation also provisions the customer login. This matches the backend contract for admin customer creation."
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Profile Requirement
                  </div>
                  <div className="mt-2 text-sm font-medium text-foreground">Name + Phone</div>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Login Requirement
                  </div>
                  <div className="mt-2 text-sm font-medium text-foreground">Username + Password</div>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Default KYC Path
                  </div>
                  <div className="mt-2 text-sm font-medium text-foreground">Start as PENDING</div>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Next Step
                  </div>
                  <div className="mt-2 text-sm font-medium text-foreground">Create Subscription</div>
                </div>
              </div>
            </SectionCard>
          </>
        ) : null}

        <SectionCard
          title="Customer Profile"
          description="Enter the operational customer details that will be used in contract and payment workflows."
        >
          <div className="grid gap-6 md:grid-cols-2">
            <InputField
              id="customer-name"
              label="Full Name"
              value={name}
              onChange={setName}
              placeholder="Enter customer full name"
              icon={<User className="h-4 w-4" />}
              error={fieldErrors.name}
              required
              disabled={submitting}
            />

            <InputField
              id="customer-phone"
              label="Phone Number"
              value={phone}
              onChange={setPhone}
              placeholder="Enter phone number"
              icon={<Phone className="h-4 w-4" />}
              error={fieldErrors.phone}
              required
              disabled={submitting}
            />

            <InputField
              id="customer-email"
              label="Email"
              value={email}
              onChange={setEmail}
              placeholder="Enter email address"
              icon={<Mail className="h-4 w-4" />}
              error={fieldErrors.email}
              required
              disabled={submitting}
            />

            <InputField
              id="customer-city"
              label="City / Area (Optional)"
              value={city}
              onChange={setCity}
              placeholder="Enter branch follow-up area"
              icon={<UserCheck className="h-4 w-4" />}
              disabled={submitting}
            />

            <div className="space-y-2">
              <label htmlFor="kyc-status" className="block text-sm font-medium text-foreground">
                KYC Status
                <span className="ml-1 text-destructive">*</span>
              </label>
              <select
                id="kyc-status"
                value={kycStatus}
                onChange={(e) => setKycStatus(e.target.value as KycStatus)}
                disabled={submitting}
                className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="PENDING">Pending Verification</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
              <FieldError message={fieldErrors.kyc_status} />
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Customer Login"
          description="The backend requires a customer login to be created from this admin workflow unless you attach an existing customer user. This page follows the new-login path."
        >
          <div className="grid gap-6 md:grid-cols-2">
            <InputField
              id="customer-username"
              label="Username"
              value={username}
              onChange={setUsername}
              placeholder="Choose a username"
              icon={<User className="h-4 w-4" />}
              error={fieldErrors.username}
              required
              disabled={submitting}
            />

            <InputField
              id="customer-password"
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="Minimum 8 characters"
              icon={<Shield className="h-4 w-4" />}
              error={fieldErrors.password}
              required
              disabled={submitting}
              showPasswordToggle
              showPassword={showPassword}
              onTogglePassword={() => setShowPassword(!showPassword)}
            />
          </div>

          <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Username
                </div>
                <div className="mt-1 text-sm font-medium text-foreground">
                  {trimmedUsername || "—"}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Password Length
                </div>
                <div className="mt-1 text-sm font-medium text-foreground">
                  {password ? `${password.length} chars` : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Provisioning Readiness
                </div>
                <div className="mt-1 text-sm font-medium text-foreground">
                  {canSubmit ? "Ready" : "Incomplete"}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <div className="font-medium">Access handoff guidance</div>
            <div className="mt-1 text-blue-800">
              Manual create sets the initial password now, but ongoing customer handoff should use email-delivered OTP reset. Do not store plaintext passwords in shared notes or source files.
            </div>
          </div>

          <OtpDeliveryReadinessCard operatorContext="create" className="mt-4" />
        </SectionCard>

        {loadingLabel && <LoadingBlock label={loadingLabel} />}

        {error && (
          <ErrorState
            title="Unable to create customer"
            description={error}
            onRetry={canSubmit ? handleSubmit : undefined}
          />
        )}

        {success && (
          <SectionCard
            title="Customer Created Successfully"
            description="The customer profile and customer login were created successfully."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <DetailRow label="Customer ID" value={`#${success.id}`} />
              <DetailRow label="Name" value={success.name || trimmedName} />
              <DetailRow label="Phone" value={success.phone || trimmedPhone} />
              <DetailRow
                label="Customer Username"
                value={success.user_username || trimmedUsername}
              />
            </div>

            <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              <div className="font-medium">Customer access handoff</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <DetailRow
                  label="Login Username"
                  value={success.user_username || trimmedUsername || "—"}
                />
                <DetailRow
                  label="Reset Identifier"
                  value={accessResetIdentifier || "Add email before password reset"}
                />
                <DetailRow label="Preferred Flow" value="OTP reset for ongoing access" />
                <DetailRow label="Portal Entry" value="/login" />
              </div>
              <div className="mt-3 text-blue-800">
                Use the OTP reset flow if the customer did not receive the initial password securely or needs to choose a new password immediately. The reset code is delivered to the registered email address only.
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/admin/customers/${success.id}`}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-95"
              >
                <UserPlus className="h-4 w-4" />
                Open Customer
              </Link>

              <Link
                href={nextSubscriptionHref}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Create Subscription
              </Link>

              {accessResetIdentifier ? (
                <Link
                  href={accessResetHref}
                  className="inline-flex items-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-900 transition hover:bg-blue-100"
                >
                  Start OTP Reset
                </Link>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900">
                  Add email before password reset
                </div>
              )}

              {returnToLeadHref ? (
                <Link
                  href={returnToLeadHref}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  Return to Lead
                </Link>
              ) : null}

              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Create Another
              </button>
            </div>
          </SectionCard>
        )}

        {!success && (
          <SectionCard
            title="Create Customer"
            description="Submit only after verifying the profile fields and customer login fields."
          >
            <FormActions
              align="between"
              submitLabel="Create Customer"
              submitLoadingLabel="Creating Customer..."
              onSubmitClick={handleSubmit}
              submitting={submitting}
              submitDisabled={!canSubmit}
              sticky={variant === "drawer"}
              cancel={{ label: "Cancel", href: "/admin/customers" }}
              extraActions={
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={submitting}
                  className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Reset Form
                </button>
              }
            />
          </SectionCard>
        )}

        {!isDrawer && !success && !error && !loadingLabel && !canSubmit && (
          <SectionCard
            title="Form Readiness"
            description="Complete all required inputs before creating the customer."
          >
            <EmptyState
              title="Required fields missing"
              description="Name, phone, username, password, and KYC status are required for this admin customer creation workflow."
            />
          </SectionCard>
        )}
      </div>
    </PortalPage>
  );
}
