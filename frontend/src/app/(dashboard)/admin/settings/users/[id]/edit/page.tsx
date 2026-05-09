"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import FormActions from "@/components/ui/FormActions";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/status-badge";
import { WorkspaceNotice } from "@/components/ui/role-workspace";
import {
  getInternalUser,
  updateInternalUser,
  type InternalUserRecord,
  type InternalUserRole,
} from "@/services/internal-users";

function toMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unable to update managed user.";
  }

  const raw = error.message.trim();
  if (!raw) {
    return "Unable to update managed user.";
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail;
    }

    for (const [field, value] of Object.entries(parsed)) {
      if (Array.isArray(value) && value.length > 0) {
        return `${field}: ${String(value[0])}`;
      }
      if (typeof value === "string" && value.trim()) {
        return `${field}: ${value}`;
      }
    }

    return raw;
  } catch {
    return raw;
  }
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

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN");
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
      <dd className="text-right text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function commissionValue(user: InternalUserRecord | null): string {
  if (!user || user.role !== "PARTNER") {
    return "0.00%";
  }
  return `${user.commission_rate || "0.00"}%`;
}

export default function AdminInternalUserEditPage() {
  const params = useParams<{ id: string }>();
  const userId = params?.id;

  const [user, setUser] = useState<InternalUserRecord | null>(null);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<InternalUserRole>("CASHIER");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [commissionRate, setCommissionRate] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hydrateForm = useCallback((record: InternalUserRecord) => {
    setUser(record);
    setUsername(record.username);
    setRole(record.role);
    setPhone(record.phone || "");
    setEmail(record.email || "");
    setFirstName(record.first_name || "");
    setLastName(record.last_name || "");
    setCommissionRate(record.role === "PARTNER" ? record.commission_rate || "" : "");
    setIsActive(record.is_active);
  }, []);

  const loadUser = useCallback(async () => {
    if (!userId) {
      setError("Missing managed user id.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const payload = await getInternalUser(userId);
      hydrateForm(payload);
      setError(null);
    } catch (err) {
      setError(toMessage(err));
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [hydrateForm, userId]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (role !== "PARTNER") {
      setCommissionRate("");
    }
  }, [role]);

  const previewName = useMemo(() => {
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || username || "—";
  }, [firstName, lastName, username]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) return;

    const trimmedEmail = email.trim();

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
    }

    if (role === "ADMIN" && user.role !== "ADMIN") {
      const confirmed = window.confirm(
        "Promote this managed account to ADMIN? This role has the highest application-level access."
      );
      if (!confirmed) return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);

      const payload =
        role === "PARTNER"
          ? {
              phone: phone.trim(),
              email: trimmedEmail,
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              role,
              is_active: isActive,
              commission_rate: commissionRate.trim(),
            }
          : {
              phone: phone.trim(),
              email: trimmedEmail,
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              role,
              is_active: isActive,
            };

      const updated = await updateInternalUser(user.id, payload);
      hydrateForm(updated);
      setSuccess(`${updated.username} updated successfully.`);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <LoadingBlock label="Loading managed user..." />;
  }

  if (error && !user) {
    return (
      <ErrorState
        title="Unable to load managed user"
        description={error}
        onRetry={() => void loadUser()}
      />
    );
  }

  if (!user) {
    return (
      <ErrorState
        title="Managed user not found"
        description="The requested managed user could not be loaded."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit Managed User: ${user.full_name || user.username}`}
        description="Update managed user identity, role posture, activation state, and partner commission settings without leaving the admin access workflow."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/settings/users/${user.id}`}
              className="inline-flex items-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
            >
              View Detail
            </Link>
            <Link
              href="/admin/settings/users"
              className="inline-flex items-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
            >
              Managed User List
            </Link>
          </div>
        }
      />

      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <WorkspaceNotice tone="warning" title="Role and access safety">
        Promote to ADMIN only when required. Partner role changes can affect future commission ownership visibility and should be applied with explicit approval.
      </WorkspaceNotice>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm"
        >
          <div>
            <h2 className="text-lg font-semibold text-foreground">Identity and access</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Username is immutable here. Use this page for role-safe profile and commission updates only.
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
                readOnly
                className="h-11 w-full rounded-xl border border-input bg-muted px-3 text-sm text-muted-foreground outline-none"
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
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                placeholder="Email address"
                required={role === "PARTNER"}
              />
              <p className="text-xs text-muted-foreground">
                {role === "PARTNER"
                  ? "Managed partner accounts must keep a valid email for password reset."
                  : "Optional for internal-only admin and cashier accounts."}
              </p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="firstName" className="text-sm font-medium text-foreground">
                First Name
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
                Last Name
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
                  Changes are audited and only affect future commission calculations.
                </p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                Managed partner creation and commission updates remain internal-only controls. Email stays mandatory so public reset never depends on phone or manual password sharing.
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3">
            <div>
              <div className="text-sm font-medium text-foreground">Account is active</div>
              <div className="text-xs text-muted-foreground">
                Inactive users cannot log in until reactivated.
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                id="is-active"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
              />
              {isActive ? "Active" : "Inactive"}
            </label>
          </div>

          <FormActions
            submitLabel="Save Changes"
            submitLoadingLabel="Saving..."
            submitting={submitting}
            cancel={{
              label: "Reset Form",
              onClick: () => hydrateForm(user),
              disabled: submitting,
            }}
          />
        </form>

        <aside className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Current Snapshot</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Review the managed account posture before saving.
            </p>
          </div>

          <dl className="space-y-3">
            <PreviewRow label="Display Name" value={previewName} />
            <PreviewRow label="Role" value={role} />
            <div className="flex items-start justify-between gap-3">
              <dt className="text-sm text-muted-foreground">Status</dt>
              <dd className="text-right text-sm font-medium text-foreground">
              <StatusBadge status={isActive ? "ACTIVE" : "ARCHIVED"} hideIcon />
              </dd>
            </div>
            <PreviewRow
              label="Commission"
              value={role === "PARTNER" ? `${commissionRate || "0.00"}%` : "0.00%"}
            />
            <PreviewRow label="Current Username" value={user.username} />
            <PreviewRow label="Last Login" value={formatDateTime(user.last_login)} />
            <PreviewRow label="Staff Flag" value={user.is_staff ? "True" : "False"} />
            <PreviewRow label="Stored Commission" value={commissionValue(user)} />
          </dl>
        </aside>
      </section>
    </div>
  );
}
