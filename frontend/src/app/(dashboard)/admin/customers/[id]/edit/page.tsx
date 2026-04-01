// frontend/src/app/(dashboard)/admin/customers/[id]/edit/page.tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Mail,
  MapPin,
  Phone,
  User,
  X,
  Building2,
  Key,
  Power,
  History,
  Upload,
} from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import FormActions from "@/components/ui/FormActions";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import { DetailItem as InfoRow, WorkspaceSection as SectionCard } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

// Types
type KycStatus = "NOT_PROVIDED" | "PENDING" | "VERIFIED" | "REJECTED";

type CustomerDetail = {
  id: number;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  kyc_status: KycStatus;
  user_id?: number | null;
  user_username?: string | null;
  user_is_active?: boolean;
  created_at?: string | null;
  kyc_reviewed_by_username?: string | null;
  kyc_reviewed_at?: string | null;
  kyc_rejection_reason?: string | null;
  profile_image?: string | null;
};

type ValidationErrors = {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  kyc_status?: string;
};

type AuditLog = {
  id: number;
  action_type: string;
  model_name: string;
  object_id: number;
  performed_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to update customer profile.";
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
      } else if (typeof value === "string") {
        next[key] = value;
      }
    };

    assign("name");
    assign("phone");
    assign("email");
    assign("address");
    assign("city");
    assign("kyc_status");

    return next;
  } catch {
    return {};
  }
}

function FormField({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  error,
  required,
  disabled,
  icon,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      <div className="relative">
        {icon && (
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </div>
        )}
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full rounded-xl border ${
            error ? "border-destructive" : "border-border"
          } bg-background px-4 py-3 text-sm outline-none transition focus:border-ring ${
            icon ? "pl-10" : ""
          }`}
        />
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export default function AdminCustomerEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const customerId = params?.id;

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ValidationErrors>({});
  const [success, setSuccess] = useState(false);

  // Password change modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // User status toggle state
  const [togglingStatus, setTogglingStatus] = useState(false);

  // Profile image
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [kycStatus, setKycStatus] = useState<KycStatus>("PENDING");

  // Fetch customer data and audit logs
  const loadCustomer = useCallback(async () => {
    if (!customerId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await apiFetch<Record<string, unknown>>(
        `/admin/customers/${customerId}/`
      );

      // Normalize the response
      const normalized: CustomerDetail = {
        id: Number(data.id),
        name: (data.name as string) || "",
        phone: (data.phone as string) || "",
        email: (data.email as string | null) || null,
        address: (data.address as string | null) || null,
        city: (data.city as string | null) || null,
        kyc_status: (data.kyc_status as KycStatus) || "NOT_PROVIDED",
        // API returns "user" field with the user ID, not "user_id"
        user_id: data.user ? Number(data.user) : null,
        user_username: (data.user_username as string) || null,
        user_is_active: data.user_is_active as boolean,
        created_at: (data.created_at as string) || null,
        kyc_reviewed_by_username: (data.kyc_reviewed_by_username as string) || null,
        kyc_reviewed_at: (data.kyc_reviewed_at as string) || null,
        kyc_rejection_reason: (data.kyc_rejection_reason as string) || null,
        profile_image: (data.profile_image as string) || null,
      };
      setCustomer(normalized);
      setName(normalized.name);
      setPhone(normalized.phone);
      setEmail(normalized.email || "");
      setAddress(normalized.address || "");
      setCity(normalized.city || "");
      setKycStatus(normalized.kyc_status);
      if (normalized.profile_image) {
        setImagePreview(normalized.profile_image);
      }

      // Fetch audit logs (optional)
      try {
        const logs = await apiFetch<unknown>(`/admin/customers/${customerId}/audit-logs/`);
        if (Array.isArray(logs)) {
          setAuditLogs(logs as AuditLog[]);
        }
      } catch {
        // ignore, logs may not exist
      }
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void loadCustomer();
  }, [loadCustomer]);

  // Validate form
  const validate = (): ValidationErrors => {
    const errors: ValidationErrors = {};

    if (!name.trim()) {
      errors.name = "Name is required.";
    }

    if (!phone.trim()) {
      errors.phone = "Phone number is required.";
    } else if (!/^[0-9+\-\s]+$/.test(phone)) {
      errors.phone = "Please enter a valid phone number.";
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Enter a valid email address.";
    }

    return errors;
  };

  // Handle profile image change
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProfileImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.append("name", name.trim());
    formData.append("phone", phone.trim());
    if (email.trim()) formData.append("email", email.trim());
    if (address.trim()) formData.append("address", address.trim());
    if (city.trim()) formData.append("city", city.trim());
    formData.append("kyc_status", kycStatus);
    if (profileImage) {
      formData.append("profile_image", profileImage);
    }

    try {
      await apiFetch(`/admin/customers/${customerId}/`, {
        method: "PUT",
        body: formData,
        headers: {}, // Let browser set Content-Type for FormData
      });
      setSuccess(true);
      setTimeout(() => {
        router.push(`/admin/customers/${customerId}`);
      }, 1500);
    } catch (err) {
      setError(toErrorMessage(err));
      setFieldErrors(parseFieldErrors(err));
    } finally {
      setSaving(false);
    }
  };

  // Toggle user active status using customer endpoint
  const handleToggleStatus = async () => {
    if (!customerId) return;
    setTogglingStatus(true);
    try {
      const newStatus = !customer?.user_is_active;
      await apiFetch(`/admin/customers/${customerId}/toggle-user-status/`, {
        method: "POST",
        body: JSON.stringify({ is_active: newStatus }),
      });
      setCustomer((prev) => (prev ? { ...prev, user_is_active: newStatus } : prev));
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setTogglingStatus(false);
    }
  };

  // Change password using customer endpoint
  const handlePasswordChange = async () => {
    if (!customerId) return;
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    setChangingPassword(true);
    setPasswordError("");
    try {
      await apiFetch(`/admin/customers/${customerId}/change-user-password/`, {
        method: "POST",
        body: JSON.stringify({ password: newPassword }),
      });
      setShowPasswordModal(false);
      setNewPassword("");
      setConfirmPassword("");
      // Show a toast or success message (optional)
    } catch (err) {
      setPasswordError(toErrorMessage(err));
    } finally {
      setChangingPassword(false);
    }
  };

  // Compute stats for PortalPage
  const stats = [
    {
      label: "Customer ID",
      value: customer?.id ? `#${customer.id}` : "—",
    },
    {
      label: "Username",
      value: customer?.user_username || "—",
    },
    {
      label: "Created",
      value: customer?.created_at ? formatDate(customer.created_at) : "—",
    },
    {
      label: "KYC Status",
      value: kycStatus,
      tone: (kycStatus === "VERIFIED" ? "success" :
             kycStatus === "REJECTED" ? "danger" :
             kycStatus === "PENDING" ? "warning" : "default") as "success" | "danger" | "warning" | "default",
    },
  ];

  return (
    <PortalPage
      title={`Edit Customer: ${customer?.name || "..."}`}
      subtitle="Update customer profile information, contact details, KYC status, and manage user account."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Customers", href: "/admin/customers" },
        { label: customer?.name || "Customer", href: `/admin/customers/${customerId}` },
        { label: "Edit" },
      ]}
      actions={[
        {
          href: `/admin/customers/${customerId}`,
          label: "Cancel",
          variant: "secondary",
        },
        {
          href: `/admin/subscriptions/create?customer=${customerId}`,
          label: "Create Subscription",
          variant: "secondary",
        },
      ]}
      stats={stats}
      statusBadge={{
        label: "Editing Customer Profile",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        {loading ? <LoadingBlock label="Loading customer data..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load customer"
            description={error}
            onRetry={loadCustomer}
          />
        ) : null}

        {!loading && !error && !customer ? (
          <EmptyState
            title="Customer not found"
            description="The requested customer could not be loaded."
          />
        ) : null}

        {!loading && !error && customer && (
          <form onSubmit={handleSubmit}>
            {/* Profile Section with Image */}
            <SectionCard
              title="Profile Information"
              description="Basic customer details used throughout the system."
            >
              <div className="grid gap-6 md:grid-cols-2">
                {/* Profile Image */}
                <div className="md:col-span-2 flex items-center gap-6">
                  <div className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-border bg-muted">
                    {imagePreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imagePreview}
                        alt="Profile"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <User className="h-12 w-12 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="profile-image"
                      className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                    >
                      <Upload className="h-4 w-4" />
                      Upload Photo
                    </label>
                    <input
                      id="profile-image"
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                      disabled={saving}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Recommended: Square image, max 2MB
                    </p>
                  </div>
                </div>

                <FormField
                  id="name"
                  label="Full Name"
                  value={name}
                  onChange={setName}
                  placeholder="Enter customer name"
                  required
                  error={fieldErrors.name}
                  disabled={saving}
                  icon={<User className="h-4 w-4" />}
                />

                <FormField
                  id="phone"
                  label="Phone Number"
                  value={phone}
                  onChange={setPhone}
                  placeholder="Enter phone number"
                  required
                  error={fieldErrors.phone}
                  disabled={saving}
                  icon={<Phone className="h-4 w-4" />}
                />

                <FormField
                  id="email"
                  label="Email Address"
                  value={email}
                  onChange={setEmail}
                  type="email"
                  placeholder="Optional"
                  error={fieldErrors.email}
                  disabled={saving}
                  icon={<Mail className="h-4 w-4" />}
                />

                <div>
                  <label htmlFor="kyc-status" className="mb-2 block text-sm font-medium text-foreground">
                    KYC Status
                  </label>
                  <select
                    id="kyc-status"
                    value={kycStatus}
                    onChange={(e) => setKycStatus(e.target.value as KycStatus)}
                    disabled={saving}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring"
                  >
                    <option value="NOT_PROVIDED">Not Provided</option>
                    <option value="PENDING">Pending Verification</option>
                    <option value="VERIFIED">Verified</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                  {fieldErrors.kyc_status && (
                    <p className="mt-1 text-xs text-destructive">{fieldErrors.kyc_status}</p>
                  )}
                </div>
              </div>
            </SectionCard>

            {/* Address Section */}
            <SectionCard
              title="Address Information"
              description="Optional address fields for shipping or correspondence."
            >
              <div className="grid gap-6 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label htmlFor="address" className="mb-2 block text-sm font-medium text-foreground">
                    Street Address
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="address"
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Street, building, etc."
                      disabled={saving}
                      className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-3 text-sm outline-none transition focus:border-ring"
                    />
                  </div>
                </div>

                <FormField
                  id="city"
                  label="City"
                  value={city}
                  onChange={setCity}
                  placeholder="City"
                  disabled={saving}
                  icon={<Building2 className="h-4 w-4" />}
                />
              </div>
            </SectionCard>

            {/* User Account Management */}
            <SectionCard
              title="User Account Management"
              description="Manage the login account associated with this customer."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoRow label="Username" value={customer.user_username || "—"} />
                <InfoRow
                  label="Account Status"
                  value={
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        status={customer.user_is_active ? "ACTIVE" : "INACTIVE"}
                      />
                      <button
                        type="button"
                        onClick={handleToggleStatus}
                        disabled={togglingStatus}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground transition hover:bg-muted disabled:opacity-50"
                      >
                        <Power className="h-3 w-3" />
                        {togglingStatus ? "Updating..." : (customer.user_is_active ? "Deactivate" : "Activate")}
                      </button>
                    </div>
                  }
                />
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(true)}
                    className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                  >
                    <Key className="h-4 w-4" />
                    Change Password
                  </button>
                </div>
              </div>
            </SectionCard>

            {/* System Information (read-only) */}
            <SectionCard
              title="System Information"
              description="Read-only audit and user linkage details."
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <InfoRow label="Customer ID" value={`#${customer.id}`} />
                <InfoRow label="Linked User ID" value={customer.user_id || "—"} />
                <InfoRow label="Created At" value={formatDateTime(customer.created_at)} />
                <InfoRow label="Last KYC Review" value={customer.kyc_reviewed_by_username || "—"} />
                <InfoRow label="KYC Review Date" value={formatDateTime(customer.kyc_reviewed_at)} />
                {customer.kyc_rejection_reason && (
                  <InfoRow label="Rejection Reason" value={customer.kyc_rejection_reason} />
                )}
              </div>
            </SectionCard>

            {/* Activity Timeline (if logs exist) */}
            {auditLogs.length > 0 && (
              <SectionCard
                title="Activity Timeline"
                description="Recent changes to this customer profile."
              >
                <div className="space-y-3">
                  {auditLogs.slice(0, 10).map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3"
                    >
                      <History className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-foreground">
                          {log.action_type.replace(/_/g, " ")}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          By {log.performed_by || "System"} · {formatDateTime(log.created_at)}
                        </div>
                        {Object.keys(log.metadata).length > 0 && (
                          <pre className="mt-1 text-xs text-muted-foreground">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Action Buttons */}
            <FormActions
              submitLabel="Save Changes"
              submitLoadingLabel="Saving Changes..."
              submitting={saving}
              cancel={{
                label: "Cancel",
                href: `/admin/customers/${customerId}`,
              }}
            />

            {/* Success Message */}
            {success && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <Check className="mr-2 inline h-4 w-4" />
                Customer profile updated successfully. Redirecting...
              </div>
            )}
          </form>
        )}
      </div>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Change Password</h3>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="new-password" className="mb-2 block text-sm font-medium text-foreground">
                  New Password
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm outline-none focus:border-ring"
                  disabled={changingPassword}
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="mb-2 block text-sm font-medium text-foreground">
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full rounded-xl border border-border bg-background px-4 py-2 text-sm outline-none focus:border-ring"
                  disabled={changingPassword}
                />
              </div>

              {passwordError && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive">
                  {passwordError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePasswordChange}
                  disabled={changingPassword}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:opacity-60"
                >
                  {changingPassword ? "Changing..." : "Change Password"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PortalPage>
  );
}
