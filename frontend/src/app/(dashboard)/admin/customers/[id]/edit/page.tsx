"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import {
  DetailPanel,
  FormSection,
  Timeline,
} from "@/components/ui/operations";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api";

type KycStatus = "NOT_PROVIDED" | "PENDING" | "VERIFIED" | "REJECTED";

type CustomerDetail = {
  id: number;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  kyc_status: KycStatus;
  user?: number | null;
  user_username?: string | null;
  user_is_active?: boolean;
  created_at?: string | null;
};

type AuditEntry = {
  id: number;
  action_type: string;
  performed_by_username?: string | null;
  performed_by?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    const raw = error.message.trim();
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
    } catch {
      return raw;
    }
    return raw;
  }
  return "Failed to load customer account.";
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

export default function AdminCustomerEditPage() {
  const params = useParams<{ id: string }>();
  const customerId = params?.id;

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [kycStatus, setKycStatus] = useState<KycStatus>("PENDING");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  function hydrate(record: CustomerDetail) {
    setCustomer(record);
    setName(record.name || "");
    setPhone(record.phone || "");
    setEmail(record.email || "");
    setAddress(record.address || "");
    setCity(record.city || "");
    setKycStatus(record.kyc_status || "PENDING");
  }

  const loadPage = useCallback(async () => {
    if (!customerId) return;

    try {
      setLoading(true);
      const [detail, auditPayload] = await Promise.all([
        apiFetch<Record<string, unknown>>(`/admin/customers/${customerId}/`),
        apiFetch<{ results?: AuditEntry[] } | AuditEntry[]>(
          `/admin/audit-logs/timeline/Customer/${customerId}/`
        ).catch(() => []),
      ]);

      hydrate({
        id: Number(detail.id ?? 0),
        name: String(detail.name ?? ""),
        phone: String(detail.phone ?? ""),
        email: typeof detail.email === "string" ? detail.email : null,
        address: typeof detail.address === "string" ? detail.address : null,
        city: typeof detail.city === "string" ? detail.city : null,
        kyc_status: (detail.kyc_status as KycStatus) || "PENDING",
        user: typeof detail.user === "number" ? detail.user : null,
        user_username:
          typeof detail.user_username === "string" ? detail.user_username : null,
        user_is_active:
          typeof detail.user_is_active === "boolean"
            ? detail.user_is_active
            : false,
        created_at:
          typeof detail.created_at === "string" ? detail.created_at : null,
      });

      if (Array.isArray(auditPayload)) {
        setAuditEntries(auditPayload);
      } else {
        setAuditEntries(auditPayload.results || []);
      }

      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      setCustomer(null);
      setAuditEntries([]);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customerId) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = await apiFetch<Record<string, unknown>>(
        `/admin/customers/${customerId}/`,
        {
          method: "PUT",
          body: JSON.stringify({
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim(),
            address: address.trim(),
            city: city.trim(),
            kyc_status: kycStatus,
          }),
        }
      );

      hydrate({
        id: Number(payload.id ?? 0),
        name: String(payload.name ?? ""),
        phone: String(payload.phone ?? ""),
        email: typeof payload.email === "string" ? payload.email : null,
        address: typeof payload.address === "string" ? payload.address : null,
        city: typeof payload.city === "string" ? payload.city : null,
        kyc_status: (payload.kyc_status as KycStatus) || "PENDING",
        user: typeof payload.user === "number" ? payload.user : null,
        user_username:
          typeof payload.user_username === "string" ? payload.user_username : null,
        user_is_active:
          typeof payload.user_is_active === "boolean"
            ? payload.user_is_active
            : customer?.user_is_active || false,
        created_at:
          typeof payload.created_at === "string" ? payload.created_at : null,
      });
      setSuccess("Customer account updated successfully.");
      void loadPage();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    if (!customerId || !customer) return;
    setToggling(true);
    setError(null);
    setSuccess(null);

    try {
      const nextState = !customer.user_is_active;
      await apiFetch(`/admin/customers/${customerId}/toggle-user-status/`, {
        method: "POST",
        body: JSON.stringify({ is_active: nextState }),
      });
      setCustomer((current) =>
        current ? { ...current, user_is_active: nextState } : current
      );
      setSuccess(
        nextState ? "Customer account activated." : "Customer account deactivated."
      );
      void loadPage();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setToggling(false);
    }
  }

  async function handlePasswordReset() {
    if (!customerId) return;

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    if (newPassword.trim().length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }

    setPasswordError(null);
    setResettingPassword(true);

    try {
      await apiFetch(`/admin/customers/${customerId}/change-user-password/`, {
        method: "POST",
        body: JSON.stringify({ password: newPassword }),
      });
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Customer password changed successfully.");
      void loadPage();
    } catch (err) {
      setPasswordError(toErrorMessage(err));
    } finally {
      setResettingPassword(false);
    }
  }

  if (loading) {
    return <LoadingBlock label="Loading customer account..." />;
  }

  if (error && !customer) {
    return (
      <ErrorState
        title="Unable to load customer account"
        description={error}
        onRetry={loadPage}
      />
    );
  }

  if (!customer) {
    return (
      <ErrorState
        title="Customer not found"
        description="The requested customer could not be loaded."
      />
    );
  }

  return (
    <PortalPage
      title={`Edit Customer: ${customer.name}`}
      subtitle="Update customer profile, access details, and account state from the admin workflow."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Customers", href: "/admin/customers" },
        { label: customer.name, href: `/admin/customers/${customer.id}` },
        { label: "Edit" },
      ]}
    >
      <div className="space-y-6">
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Customer account</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Email is required for customer access and public password reset.
                </p>
              </div>
              <StatusBadge
                status={customer.user_is_active ? "ACTIVE" : "INACTIVE"}
              />
            </div>

            <FormSection
              title="Identity and contact"
              description="Core profile fields submitted with the same admin customer update payload as before."
            >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium text-foreground">
                  Name
                </label>
                <input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="phone" className="text-sm font-medium text-foreground">
                  Phone
                </label>
                <input
                  id="phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
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
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="city" className="text-sm font-medium text-foreground">
                  City
                </label>
                <input
                  id="city"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                />
              </div>
            </div>
            </FormSection>

            <FormSection
              title="Address"
              description="Stored on the customer record for delivery and verification context."
            >
              <div className="space-y-2">
                <label htmlFor="address" className="text-sm font-medium text-foreground">
                  Address
                </label>
                <textarea
                  id="address"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  className="min-h-28 w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-ring"
                />
              </div>
            </FormSection>

            <FormSection
              title="KYC and portal identity"
              description="KYC status follows admin review rules; login username is read-only here."
            >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="kyc" className="text-sm font-medium text-foreground">
                  KYC status
                </label>
                <select
                  id="kyc"
                  value={kycStatus}
                  onChange={(event) => setKycStatus(event.target.value as KycStatus)}
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                >
                  <option value="NOT_PROVIDED">Not provided</option>
                  <option value="PENDING">Pending</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Login username
                </label>
                <div className="flex h-11 items-center rounded-xl border border-border bg-muted px-3 text-sm text-foreground">
                  {customer.user_username || "—"}
                </div>
              </div>
            </div>
            </FormSection>

            {error ? (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {success}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3">
              <Link
                href={`/admin/customers/${customer.id}`}
                className="inline-flex items-center rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>

          <div className="space-y-5">
            <DetailPanel title="Account controls" description="Login access and password recovery posture for this customer.">
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="text-sm font-medium text-foreground">
                    Account status
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Toggle customer login access without changing historical subscriptions or payments.
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleToggleStatus()}
                    disabled={toggling}
                    className="mt-3 inline-flex items-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {toggling
                      ? "Updating..."
                      : customer.user_is_active
                        ? "Deactivate account"
                        : "Activate account"}
                  </button>
                </div>

                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="text-sm font-medium text-foreground">
                    Change password
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Use only for exceptional admin-controlled recovery. Routine access handoff should use OTP reset.
                  </div>
                  <div className="mt-3 space-y-3">
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="New password"
                      className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                    />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Confirm password"
                      className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                    />
                    {passwordError ? (
                      <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                        {passwordError}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handlePasswordReset()}
                      disabled={resettingPassword}
                      className="inline-flex items-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {resettingPassword ? "Updating..." : "Set new password"}
                    </button>
                  </div>
                </div>
              </div>
            </DetailPanel>

            <Timeline
              title="Audit timeline"
            >
                {auditEntries.length > 0 ? (
                  auditEntries.slice(0, 8).map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-xl border border-border bg-background px-4 py-3"
                    >
                      <div className="text-sm font-medium text-foreground">
                        {entry.action_type}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {entry.performed_by_username ||
                          entry.performed_by ||
                          "System"}{" "}
                        • {formatDateTime(entry.created_at)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                    No customer audit timeline entries were returned yet.
                  </div>
                )}
            </Timeline>
          </div>
        </section>
      </div>
    </PortalPage>
  );
}
