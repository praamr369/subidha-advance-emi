"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { createInternalUser, type InternalUserRole } from "@/services/internal-users";

function toMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Unable to create managed user.";
}

function roleHelp(role: InternalUserRole): string {
  switch (role) {
    case "ADMIN":
      return "Full internal operational control. Use sparingly.";
    case "CASHIER":
      return "Daily counter and payment collection workflow.";
    case "PARTNER":
      return "Managed partner account created under admin control.";
    default:
      return "";
  }
}

function PreviewRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground text-right">{value}</dd>
    </div>
  );
}

export default function AdminInternalUserCreatePage() {
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<InternalUserRole>("CASHIER");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [commissionRate, setCommissionRate] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const previewName = useMemo(() => {
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || username || "—";
  }, [firstName, lastName, username]);

  useEffect(() => {
    if (role !== "PARTNER") {
      setCommissionRate("");
    }
  }, [role]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();

    if (password !== confirmPassword) {
      setError("Password and confirm password must match.");
      return;
    }

    if (role === "ADMIN") {
      const confirmed = window.confirm(
        "Create an internal ADMIN account? This role has the highest application-level access."
      );
      if (!confirmed) return;
    }

    if (role === "PARTNER") {
      if (!trimmedEmail) {
        setError("Email is required for managed partner access and password reset.");
        return;
      }

      const trimmedRate = commissionRate.trim();
      if (!trimmedRate) {
        setError("Partner commission percentage is required.");
        return;
      }

      const parsedRate = Number(trimmedRate);
      if (Number.isNaN(parsedRate) || parsedRate < 0 || parsedRate > 100) {
        setError("Commission percentage must be between 0.00 and 100.00.");
        return;
      }

      const confirmed = window.confirm(
        "Create a managed PARTNER account internally? This should be your controlled onboarding path."
      );
      if (!confirmed) return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);

      const payload = {
        username: username.trim(),
        password,
        role,
        phone: phone.trim(),
        email: trimmedEmail,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        is_active: isActive,
      };

      const response = await createInternalUser(
        role === "PARTNER"
          ? {
              ...payload,
              commission_rate: commissionRate.trim(),
            }
          : payload
      );

      setSuccess(
        `${response.role} account created successfully for ${response.username}.`
      );

      setUsername("");
      setRole("CASHIER");
      setPhone("");
      setEmail("");
      setFirstName("");
      setLastName("");
      setCommissionRate("");
      setPassword("");
      setConfirmPassword("");
      setIsActive(true);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ERPPageShell
      eyebrow="Settings · Users"
      title="Create Managed User"
      subtitle="Create internal ADMIN, CASHIER, and PARTNER accounts from a single controlled admin workflow."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Settings", href: ROUTES.admin.settings },
        { label: "Managed Users", href: ROUTES.admin.settingsUsers },
        { label: "Create" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <div className="flex flex-wrap gap-2">
        <Link
          href={ROUTES.admin.settingsUsers}
          className="inline-flex items-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
        >
          Managed User List
        </Link>
        <Link
          href={ROUTES.admin.settings}
          className="inline-flex items-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
        >
          Back to Settings
        </Link>
      </div>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm"
        >
          <div>
            <h2 className="text-lg font-semibold text-foreground">Identity and access</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This workflow is internal-only and should be the operational source for managed partner creation instead of public auth registration.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium text-foreground">
                Username
              </label>
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                placeholder="Managed username"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="role" className="text-sm font-medium text-foreground">
                Role
              </label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as InternalUserRole)}
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
              >
                <option value="CASHIER">Cashier</option>
                <option value="ADMIN">Admin</option>
                <option value="PARTNER">Partner</option>
              </select>
              <p className="text-xs text-muted-foreground">{roleHelp(role)}</p>
            </div>
          </div>

          {role === "PARTNER" ? (
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="commissionRate"
                  className="text-sm font-medium text-foreground"
                >
                  Partner Commission Percentage
                </label>
                <input
                  id="commissionRate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                  placeholder="e.g. 5.00"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Applied only to future partner commission calculations.
                </p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                Commission settings are auditable. Updates only affect new payments.
              </div>
            </div>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="phone" className="text-sm font-medium text-foreground">
                Phone
              </label>
              <input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                placeholder="Phone number"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                {role === "PARTNER" ? "Email" : "Email"}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                placeholder="Email"
                required={role === "PARTNER"}
              />
              <p className="text-xs text-muted-foreground">
                {role === "PARTNER"
                  ? "Managed partner accounts must have email before password reset can be used."
                  : "Optional for internal-only admin and cashier accounts."}
              </p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="firstName" className="text-sm font-medium text-foreground">
                First name
              </label>
              <input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                placeholder="First name"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="lastName" className="text-sm font-medium text-foreground">
                Last name
              </label>
              <input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                placeholder="Last name"
              />
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                placeholder="Create password"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                placeholder="Re-enter password"
                required
              />
            </div>
          </div>

          <label className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Create account as active
          </label>

          {role === "PARTNER" ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              This partner account will be fully admin-managed. Email is mandatory so OTP reset remains available without exposing plaintext passwords.
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {success}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Creating user..." : "Create managed user"}
          </button>
        </form>

        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Live preview
            </h3>

            <dl className="mt-4 space-y-3">
              <PreviewRow label="Display name" value={previewName} />
              <PreviewRow label="Role" value={role} />
              {role === "PARTNER" ? (
                <PreviewRow
                  label="Commission %"
                  value={commissionRate.trim() ? `${commissionRate.trim()}%` : "—"}
                />
              ) : null}
              <PreviewRow label="Phone" value={phone || "—"} />
              <PreviewRow label="Email" value={email || "—"} />
              <PreviewRow label="Initial status" value={isActive ? "Active" : "Inactive"} />
            </dl>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-amber-800">
              Control note
            </h3>
            <p className="mt-2 text-sm leading-6 text-amber-800">
              This screen creates application-managed accounts only. It should be your primary path for partner onboarding once public partner registration is removed from auth.
            </p>
          </div>
        </aside>
      </section>
    </ERPPageShell>
  );
}
