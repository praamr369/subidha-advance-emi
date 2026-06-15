"use client";
import { formatRupee } from "@/lib/utils/currency";

import {
  ClipboardList,
  CreditCard,
  LifeBuoy,
  PlusCircle,
  Camera,
  FileText,
  GitBranch,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ControlLaneGrid } from "@/components/admin/control-center/ControlLanes";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import { CardSkeleton } from "@/components/feedback/Skeleton";
import ActionButton from "@/components/ui/ActionButton";
import FormActions from "@/components/ui/FormActions";
import FormSection from "@/components/ui/FormSection";
import {
  DataTableShell,
  DetailPanel,
  KpiCard,
  QuickActionGrid,
} from "@/components/ui/operations";
import PortalPage from "@/components/ui/PortalPage";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { WorkspaceNotice } from "@/components/ui/role-workspace";
import StatusBadge from "@/components/ui/status-badge";
import { DetailItem, WorkspaceSection } from "@/components/ui/workspace";
import CustomerProductSummaryCard from "@/domains/subscriptions/components/CustomerProductSummaryCard";
import {
  getCustomerProfile,
  changeCustomerUsername,
  getCustomerDirectSaleSummary,
  listCustomerPayments,
  updateCustomerProfile,
  type CustomerPayment,
  type CustomerProfileResponse,
} from "@/services/customer";
import { listCustomerSubscriptionsRegister } from "@/services/customer/paginated-subscriptions";
import {
  uploadCustomerPhoto,
  listCustomerKycDocuments,
  submitCustomerKycDocument,
  listCustomerReferrals,
  type CustomerKycDocumentRecord,
  type CustomerReferralRecord,
} from "@/services/customer/index";
import { initialsFromDisplayName } from "@/lib/display-name";
import { useLogout } from "@/hooks/useLogout";


function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

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
  return "Failed to load customer profile.";
}

function noticeToneForKyc(
  status: string | null | undefined
): "info" | "success" | "warning" {
  const token = String(status || "").toUpperCase();
  if (token === "APPROVED" || token === "VERIFIED") {
    return "success";
  }
  if (token === "PENDING") {
    return "warning";
  }
  return "info";
}

export default function CustomerProfilePage() {
  const { logout, isLoggingOut } = useLogout();
  const [data, setData] = useState<CustomerProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [productRows, setProductRows] = useState<
    Awaited<ReturnType<typeof listCustomerSubscriptionsRegister>>["results"]
  >([]);
  const [productError, setProductError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");

  // Phase 1 – KYC state
  const [kycDocs, setKycDocs] = useState<CustomerKycDocumentRecord[]>([]);
  const [kycStatus, setKycStatus] = useState<string>("");
  const [kycDocType, setKycDocType] = useState("AADHAAR");
  const [kycFile, setKycFile] = useState<File | null>(null);
  const [kycNotes, setKycNotes] = useState("");
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycSubmitError, setKycSubmitError] = useState<string | null>(null);
  const [kycSubmitSuccess, setKycSubmitSuccess] = useState<string | null>(null);

  // Phase 1 – Photo state
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoSuccess, setPhotoSuccess] = useState<string | null>(null);

  // Phase 1 – Referral state
  const [referrals, setReferrals] = useState<CustomerReferralRecord[]>([]);
  const [referralCount, setReferralCount] = useState(0);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [directSaleSummary, setDirectSaleSummary] =
    useState<Awaited<ReturnType<typeof getCustomerDirectSaleSummary>> | null>(null);
  const [directSaleError, setDirectSaleError] = useState<string | null>(null);
  const [paymentPreview, setPaymentPreview] = useState<CustomerPayment[]>([]);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSuccess, setUsernameSuccess] = useState<string | null>(null);

  function hydrate(payload: CustomerProfileResponse) {
    setData(payload);
    setName(payload.name);
    setPhone(payload.phone);
    setEmail(payload.email || "");
    setAddress(payload.address || "");
    setCity(payload.city || "");
    const rawPayload = payload as unknown as Record<string, unknown>;
    if (rawPayload["profile_photo_url"]) {
      setPhotoUrl(String(rawPayload["profile_photo_url"]));
    }
    if (payload.kyc_status) {
      setKycStatus(payload.kyc_status);
    }
  }

  const reloadDirectSaleSummary = useCallback(async () => {
    try {
      const summary = await getCustomerDirectSaleSummary();
      setDirectSaleSummary(summary);
      setDirectSaleError(null);
    } catch (err) {
      setDirectSaleSummary(null);
      setDirectSaleError(toErrorMessage(err));
    }
  }, []);

  const reloadPaymentsPreview = useCallback(async () => {
    try {
      const payload = await listCustomerPayments();
      setPaymentPreview((payload.results ?? []).slice(0, 5));
      setPaymentError(null);
    } catch (err) {
      setPaymentPreview([]);
      setPaymentError(toErrorMessage(err));
    }
  }, []);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setPaymentError(null);
    setDirectSaleError(null);
    try {
      const [
        profileResult,
        subscriptionsResult,
        kycResult,
        referralResult,
        directSaleResult,
        paymentsResult,
      ] = await Promise.allSettled([
        getCustomerProfile(),
        listCustomerSubscriptionsRegister({ page: 1, pageSize: 4 }),
        listCustomerKycDocuments(),
        listCustomerReferrals(),
        getCustomerDirectSaleSummary(),
        listCustomerPayments(),
      ]);

      if (profileResult.status === "rejected") {
        throw profileResult.reason;
      }

      hydrate(profileResult.value);
      setError(null);

      if (subscriptionsResult.status === "fulfilled") {
        setProductRows(subscriptionsResult.value.results);
        setProductError(null);
      } else {
        setProductRows([]);
        setProductError("Subscription product summaries are temporarily unavailable.");
      }

      if (kycResult.status === "fulfilled") {
        setKycDocs(kycResult.value.results);
        setKycStatus(kycResult.value.kyc_status);
      } else {
        setKycDocs([]);
      }

      if (referralResult.status === "fulfilled") {
        setReferrals(referralResult.value.results);
        setReferralCount(referralResult.value.count);
      } else {
        setReferrals([]);
        setReferralError("Referral data temporarily unavailable.");
      }

      if (directSaleResult.status === "fulfilled") {
        setDirectSaleSummary(directSaleResult.value);
        setDirectSaleError(null);
      } else {
        setDirectSaleSummary(null);
        setDirectSaleError(toErrorMessage(directSaleResult.reason));
      }

      if (paymentsResult.status === "fulfilled") {
        setPaymentPreview((paymentsResult.value.results ?? []).slice(0, 5));
        setPaymentError(null);
      } else {
        setPaymentPreview([]);
        setPaymentError(toErrorMessage(paymentsResult.reason));
      }
    } catch (err) {
      setError(toErrorMessage(err));
      setData(null);
      setProductRows([]);
      setProductError(null);
      setDirectSaleSummary(null);
      setDirectSaleError(null);
      setPaymentPreview([]);
      setPaymentError(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const headerStats = useMemo(() => {
    if (!data) return [];
    return [
      {
        label: "Active subscriptions",
        value: String(data.summary.active_subscriptions ?? 0),
        tone: "success" as const,
      },
      {
        label: "Total subscriptions",
        value: String(data.summary.total_subscriptions ?? 0),
      },
      {
        label: "Won subscriptions",
        value: String(data.summary.won_subscriptions ?? 0),
        tone:
          (data.summary.won_subscriptions ?? 0) > 0
            ? ("info" as const)
            : ("default" as const),
      },
      {
        label: "Total paid",
        value: formatRupee(data.summary.total_paid_amount ?? 0),
        tone: "success" as const,
      },
    ];
  }, [data]);

  async function handlePhotoUpload(file: File) {
    setPhotoUploading(true);
    setPhotoError(null);
    setPhotoSuccess(null);
    try {
      const result = await uploadCustomerPhoto(file);
      setPhotoUrl(result.photo_url);
      setPhotoSuccess("Profile photo updated.");
    } catch (err) {
      setPhotoError(toErrorMessage(err));
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleKycSubmit() {
    if (!kycFile) {
      setKycSubmitError("Please select a document file.");
      return;
    }
    setKycSubmitting(true);
    setKycSubmitError(null);
    setKycSubmitSuccess(null);
    try {
      const result = await submitCustomerKycDocument({
        document_type: kycDocType,
        file: kycFile,
        notes: kycNotes.trim() || undefined,
      });
      setKycStatus(result.kyc_status);
      setKycDocs((prev) => [result.document, ...prev]);
      setKycSubmitSuccess(
        "KYC document submitted for review. An admin will review it shortly."
      );
      setKycFile(null);
      setKycNotes("");
    } catch (err) {
      setKycSubmitError(toErrorMessage(err));
    } finally {
      setKycSubmitting(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);

    try {
      const payload = await updateCustomerProfile({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        city: city.trim(),
      });
      hydrate(payload);
      setSuccess("Profile updated successfully.");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleUsernameSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUsernameSaving(true);
    setUsernameError(null);
    setUsernameSuccess(null);
    try {
      const response = await changeCustomerUsername({
        new_username: newUsername.trim(),
        current_password: currentPassword,
      });
      if (response.changed && response.requires_relogin) {
        setUsernameSuccess("Username changed. Please sign in again.");
        setCurrentPassword("");
        setTimeout(() => {
          void logout();
        }, 1200);
        return;
      }
      setUsernameSuccess("Username updated.");
      setCurrentPassword("");
      await loadPage();
    } catch (err) {
      setUsernameError(toErrorMessage(err));
    } finally {
      setUsernameSaving(false);
    }
  }

  const selfServiceLanes = [
    {
      title: "Subscriptions",
      description:
        "Open contract detail, EMI posture, lucky number status, and waiver history.",
      href: "/customer/subscriptions",
      icon: <ClipboardList className="h-4 w-4" />,
      badge: "Workspace",
    },
    {
      title: "Payments",
      description:
        "Review recorded receipts and move into a receipt-specific support issue when needed.",
      href: "/customer/payments",
      icon: <CreditCard className="h-4 w-4" />,
      badge: "Receipts",
    },
    {
      title: "Support",
      description:
        "Track current requests and submit a new issue without exposing branch-only workflows.",
      href: "/customer/support",
      icon: <LifeBuoy className="h-4 w-4" />,
      badge: "Follow-up",
    },
    {
      title: "Subscription Requests",
      description:
        "Create intake-only requests that remain pending until admin approval creates the real contract.",
      href: "/customer/subscription-requests",
      icon: <PlusCircle className="h-4 w-4" />,
      badge: "Approval",
    },
  ];

  return (
    <PortalPage
      eyebrow="Customer Profile"
      title="Profile Workspace"
      subtitle="Manage your customer identity, self-service contact details, and linked subscription context from the same operational shell."
      helperNote="Profile maintenance changes only your own customer record. Subscription creation, payment posting, and winner logic remain separate controlled workflows."
      helperTone="info"
      breadcrumbs={[{ label: "Customer", href: "/customer" }, { label: "Profile" }]}
      actions={[
        {
          href: "/customer/subscriptions",
          label: "Subscriptions",
          variant: "primary",
        },
        {
          href: "/customer/payments",
          label: "Payments",
          variant: "secondary",
        },
        {
          href: "/customer/support",
          label: "Support",
          variant: "secondary",
        },
      ]}
      stats={headerStats}
      statusBadge={{
        label: data?.kyc_status || "Customer profile",
        tone: noticeToneForKyc(data?.kyc_status),
      }}
      headerMode="erp"
    >
      {loading ? (
        <div aria-busy="true" aria-label="Loading profile workspace">
          <div className="space-y-6" aria-hidden="true">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </div>
      ) : null}

      {!loading && error && !data ? (
        <ErrorState
          title="Unable to load profile"
          description={error}
          onRetry={loadPage}
        />
      ) : null}

      {!loading && !error && data ? (
        <div className="space-y-6" aria-busy="false">
          <ControlLaneGrid
            title="Self-service lanes"
            description="Use the current customer-safe workspace routes without crossing into internal branch or finance controls."
            lanes={selfServiceLanes}
          />

          {headerStats.length > 0 ? (
            <DetailPanel
              title="At a glance"
              description="Figures below come from your live profile summary; they mirror the header stats from the same API response."
            >
              <QuickActionGrid className="sm:grid-cols-2 xl:grid-cols-4">
                {headerStats.map((stat) => (
                  <KpiCard
                    key={stat.label}
                    label={stat.label}
                    value={stat.value}
                  />
                ))}
              </QuickActionGrid>
            </DetailPanel>
          ) : null}

          <DetailPanel
            title="Account identity"
            description="Core customer identity and KYC posture from your live profile record."
          >
            <div className="mb-4 flex justify-end">
              <ActionButton
                variant="outline"
                onClick={() => void loadPage()}
                disabled={loading || saving}
              >
                Refresh
              </ActionButton>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <DetailItem label="Username" value={data.username} />
              <DetailItem
                label="KYC status"
                value={<StatusBadge status={data.kyc_status || "NOT_PROVIDED"} size="md" />}
              />
              <DetailItem label="Phone" value={data.phone || "—"} />
              <DetailItem label="Email" value={data.email || "Add email for password reset"} />
              <DetailItem label="City" value={data.city || "—"} />
              <DetailItem label="Address" value={data.address || "No address recorded"} />
            </div>
          </DetailPanel>

          <WorkspaceSection
            title="Change username"
            description="Username is only your login identifier. Your customer ID, subscriptions, invoices, receipts, payments, and audit trail remain unchanged."
          >
            {usernameError ? (
              <WorkspaceNotice tone="danger" title="Unable to change username">
                {usernameError}
              </WorkspaceNotice>
            ) : null}
            {usernameSuccess ? (
              <WorkspaceNotice tone="success" title="Username changed">
                {usernameSuccess}
              </WorkspaceNotice>
            ) : null}
            <form onSubmit={handleUsernameSubmit} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">New username</label>
                <input
                  value={newUsername}
                  onChange={(event) => setNewUsername(event.target.value)}
                  placeholder="letters, numbers, dots, underscores, hyphens"
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Current password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={usernameSaving || isLoggingOut}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                >
                  {usernameSaving ? "Updating username..." : "Change Username"}
                </button>
              </div>
            </form>
          </WorkspaceSection>

          <WorkspaceSection
            title="EMI subscriptions & rent/lease contracts"
            description="Lucky Plan EMI contracts stay distinct from retail invoices and receipts."
            action={
              <ActionButton href="/customer/subscriptions" variant="outline">
                View all subscriptions
              </ActionButton>
            }
          >
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-border p-3 text-sm">
                <div className="text-xs text-muted-foreground">Active EMI subscriptions</div>
                <div className="mt-1 font-semibold">{data.summary.active_subscriptions ?? 0}</div>
              </div>
              <div className="rounded-xl border border-border p-3 text-sm">
                <div className="text-xs text-muted-foreground">Rent / lease contracts (recent)</div>
                <div className="mt-1 font-semibold">
                  {
                    productRows.filter((row) =>
                      ["RENT", "LEASE"].includes((row.plan_type || "").toUpperCase()),
                    ).length
                  }
                </div>
              </div>
              <div className="rounded-xl border border-border p-3 text-sm">
                <div className="text-xs text-muted-foreground">Linked EMI highlights</div>
                <div className="mt-1 font-semibold">{productRows.length} shown</div>
              </div>
            </div>
          </WorkspaceSection>

          <WorkspaceSection
            title="Direct-sale invoices"
            description="Counts include only invoiced retail bills linked to your customer profile (walk-in snapshots matched by phone alone never appear here)."
            action={
              <ActionButton href="/customer/direct-sales" variant="outline">
                View all direct sales
              </ActionButton>
            }
          >
            {directSaleError ? (
              <div className="space-y-3">
                <WorkspaceNotice tone="warning" title="Direct-sale summary unavailable">
                  {directSaleError}
                </WorkspaceNotice>
                <ActionButton variant="outline" onClick={() => void reloadDirectSaleSummary()}>
                  Retry direct-sale summary
                </ActionButton>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-border p-3 text-sm">
                  <div className="text-xs text-muted-foreground">Direct-sale invoices</div>
                  <div className="mt-1 font-semibold">
                    {directSaleSummary?.total_direct_sale_invoices ?? 0}
                  </div>
                </div>
                <div className="rounded-xl border border-border p-3 text-sm">
                  <div className="text-xs text-muted-foreground">Outstanding dues</div>
                  <div className="mt-1 font-semibold">
                    {formatRupee(directSaleSummary?.total_outstanding_direct_sale_dues || 0)}
                  </div>
                </div>
              </div>
            )}
          </WorkspaceSection>

          <WorkspaceSection
            title="Receipts & EMI payments"
            description="Recorded Lucky Plan EMI payments and receipts linked to your authenticated profile."
            action={
              <ActionButton href="/customer/payments" variant="outline">
                View all payments
              </ActionButton>
            }
          >
            {paymentError ? (
              <div className="space-y-3">
                <WorkspaceNotice tone="warning" title="Payment history unavailable">
                  {paymentError}
                </WorkspaceNotice>
                <ActionButton variant="outline" onClick={() => void reloadPaymentsPreview()}>
                  Retry payments
                </ActionButton>
              </div>
            ) : paymentPreview.length === 0 ? (
              <EmptyState
                title="No payments shown yet"
                description="Payments appear once EMI receipts post against your subscriptions."
              />
            ) : (
              <div className="space-y-3">
                {paymentPreview.map((pay) => (
                  <div
                    key={pay.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-sm"
                  >
                    <div>
                      <div className="font-medium text-foreground">
                        {pay.subscription_number || `SUB-${pay.subscription ?? ""}`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {pay.payment_date || pay.paid_at || "—"} ·{" "}
                        {pay.subscription_plan_type || "EMI"}
                      </div>
                    </div>
                    <div className="font-semibold tabular-nums">{formatRupee(String(pay.amount))}</div>
                  </div>
                ))}
              </div>
            )}
          </WorkspaceSection>

          <WorkspaceSection
            title="Profile maintenance"
            description="Keep contact details current so receipts, support, and password recovery remain usable."
          >
            {error ? (
              <WorkspaceNotice tone="danger" title="Unable to save profile">
                {error}
              </WorkspaceNotice>
            ) : null}

            {success ? (
              <WorkspaceNotice tone="success" title="Profile updated">
                {success}
              </WorkspaceNotice>
            ) : null}

            <form onSubmit={handleSubmit}>
              <div className="space-y-5">
                <FormSection
                  title="Contact details"
                  description="These fields are customer-editable and stay inside your own account scope."
                  columns={2}
                >
                  <div className="space-y-2">
                    <label htmlFor="customer-name" className="text-sm font-medium text-foreground">
                      Name
                    </label>
                    <input
                      id="customer-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="customer-phone" className="text-sm font-medium text-foreground">
                      Phone
                    </label>
                    <input
                      id="customer-phone"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="customer-email" className="text-sm font-medium text-foreground">
                      Email
                    </label>
                    <input
                      id="customer-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="customer-city" className="text-sm font-medium text-foreground">
                      City
                    </label>
                    <input
                      id="customer-city"
                      value={city}
                      onChange={(event) => setCity(event.target.value)}
                      className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                    />
                  </div>
                </FormSection>

                <FormSection
                  title="Address details"
                  description="Address is shown as stored on your customer record and does not alter subscription truth."
                  columns={1}
                >
                  <div className="space-y-2">
                    <label htmlFor="customer-address" className="text-sm font-medium text-foreground">
                      Address
                    </label>
                    <textarea
                      id="customer-address"
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                      className="min-h-28 w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-ring"
                    />
                  </div>
                </FormSection>

                <FormActions
                  submitLabel="Save profile"
                  submitLoadingLabel="Saving profile..."
                  submitting={saving}
                  cancel={{ label: "Reset", onClick: () => data && hydrate(data) }}
                />
              </div>
            </form>
          </WorkspaceSection>

          {/* Phase 1 – Profile Photo */}
          <WorkspaceSection
            title="Profile photo"
            description="Upload a profile photo. Photo is visible to admin staff and in your profile identity."
            action={
              <ActionButton
                variant="outline"
                onClick={() => photoInputRef.current?.click()}
                disabled={photoUploading}
              >
                <Camera className="mr-1.5 h-3.5 w-3.5" />
                {photoUploading ? "Uploading…" : "Upload photo"}
              </ActionButton>
            }
          >
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handlePhotoUpload(file);
              }}
            />
            {photoError && (
              <WorkspaceNotice tone="danger" title="Photo upload failed">
                {photoError}
              </WorkspaceNotice>
            )}
            {photoSuccess && (
              <WorkspaceNotice tone="success" title="Photo updated">
                {photoSuccess}
              </WorkspaceNotice>
            )}
            <div className="flex flex-wrap items-center gap-4">
              <Avatar className="size-20 rounded-full border-border">
                {photoUrl ? <AvatarImage src={photoUrl} alt="Profile photo" className="rounded-full object-cover" /> : null}
                <AvatarFallback className="rounded-full text-lg">{initialsFromDisplayName(name || data?.name || "?")}</AvatarFallback>
              </Avatar>
              <p className="text-sm text-muted-foreground">
                {photoUrl
                  ? "Profile photo is set. You can upload a new one to replace it."
                  : 'No profile photo uploaded. Click "Upload photo" to add one.'}
              </p>
            </div>
          </WorkspaceSection>

          {/* Phase 1 – KYC Documents */}
          <WorkspaceSection
            title="KYC verification"
            description="Upload identity documents for KYC verification. Admin approval is required – documents do not auto-approve."
          >
            <div className="mb-4 flex items-center gap-3">
              <span className="text-sm font-medium text-foreground">Current KYC status:</span>
              <StatusBadge status={kycStatus || data?.kyc_status || "PENDING"} size="md" />
            </div>

            {(kycStatus === "PENDING" || kycStatus === "REJECTED" || !kycStatus) && (
              <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
                <h4 className="text-sm font-semibold">Submit KYC document</h4>

                {kycSubmitError && (
                  <WorkspaceNotice tone="danger" title="Submission failed">
                    {kycSubmitError}
                  </WorkspaceNotice>
                )}
                {kycSubmitSuccess && (
                  <WorkspaceNotice tone="success" title="Submitted">
                    {kycSubmitSuccess}
                  </WorkspaceNotice>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Document type</label>
                    <select
                      value={kycDocType}
                      onChange={(e) => setKycDocType(e.target.value)}
                      className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                    >
                      <option value="AADHAAR">Aadhaar Card</option>
                      <option value="PAN">PAN Card</option>
                      <option value="PASSPORT">Passport</option>
                      <option value="DRIVING_LICENSE">Driving License</option>
                      <option value="VOTER_ID">Voter ID</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">
                      Document file <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setKycFile(e.target.files?.[0] ?? null)}
                      className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring file:mr-3 file:text-xs"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-medium">Notes (optional)</label>
                    <input
                      type="text"
                      value={kycNotes}
                      onChange={(e) => setKycNotes(e.target.value)}
                      placeholder="Any notes for the reviewer"
                      className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleKycSubmit()}
                    disabled={kycSubmitting || !kycFile}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {kycSubmitting ? "Submitting…" : "Submit for review"}
                  </button>
                </div>
              </div>
            )}

            {kycDocs.length > 0 ? (
              <div className="mt-4 space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Submitted documents
                </h4>
                {kycDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm"
                  >
                    <div>
                      <span className="font-medium">{doc.document_type}</span>
                      <div className="text-xs text-muted-foreground">
                        {doc.original_filename || "Unnamed file"} · {Math.max(1, Math.round((doc.file_size || 0) / 1024))} KB
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={doc.status} size="sm" />
                      {doc.rejection_reason && (
                        <span className="text-xs text-destructive">{doc.rejection_reason}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : kycStatus === "APPROVED" || kycStatus === "VERIFIED" ? (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                Your KYC has been approved. No further action required.
              </div>
            ) : null}
          </WorkspaceSection>

          {/* Phase 1 – Referrals */}
          <WorkspaceSection
            title="Referrals"
            description="Customers you have referred. Commission is only payable if admin enables it."
            action={
              <ActionButton href="/customer/referrals" variant="outline">
                <GitBranch className="mr-1.5 h-3.5 w-3.5" />
                View all referrals
              </ActionButton>
            }
          >
            {referralError && (
              <WorkspaceNotice tone="warning" title="Referral data unavailable">
                {referralError}
              </WorkspaceNotice>
            )}
            {referrals.length > 0 ? (
              <div className="space-y-2">
                {referrals.slice(0, 5).map((referral) => (
                  <div
                    key={referral.id}
                    className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm"
                  >
                    <div>
                      <span className="font-medium">{referral.referred_name || "Unknown"}</span>
                      {referral.referred_phone && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {referral.referred_phone}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {referral.commission_approved ? (
                        <span className="text-green-700 font-medium">
                          Commission approved: ₹{referral.commission_amount}
                        </span>
                      ) : (
                        "Pending admin approval"
                      )}
                    </div>
                  </div>
                ))}
                {referralCount > 5 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">
                    Showing 5 of {referralCount} referrals.
                  </p>
                )}
              </div>
            ) : !referralError ? (
              <EmptyState
                title="No referrals yet"
                description="Refer a customer and they will appear here once the referral is recorded."
              />
            ) : null}
          </WorkspaceSection>

          <WorkspaceSection
            title="Lucky draw verification (your records)"
            description="Only your own winner/waiver records are shown here from authenticated profile data."
          >
            {(data.summary.lucky_plan_draw?.length ?? 0) > 0 ? (
              <DataTableShell>
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left">
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Subscription
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Draw
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Verification
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Waiver
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.summary.lucky_plan_draw || []).map((draw) => (
                        <tr key={`${draw.subscription_id}-${draw.draw_month || 0}`}>
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            SUB-{draw.subscription_id}
                            <div className="text-xs text-muted-foreground">
                              Batch {draw.batch_code || "—"} · Lucky #
                              {draw.winner_lucky_number != null
                                ? String(draw.winner_lucky_number).padStart(2, "0")
                                : "—"}
                            </div>
                          </td>
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            Month {draw.draw_month ?? "—"}
                            <div className="text-xs text-muted-foreground">
                              {formatDateTime(draw.revealed_at || draw.draw_date || null)}
                            </div>
                          </td>
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <StatusBadge status={draw.verification_status || "UNKNOWN"} hideIcon />
                            <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
                              {draw.public_commit_hash || "—"}
                            </div>
                          </td>
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            {draw.waived_emi_count ?? 0} EMI
                            <div className="text-xs text-muted-foreground">
                              {formatRupee(draw.waived_amount || 0)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DataTableShell>
            ) : (
              <EmptyState
                title="No winner draw records yet"
                description="When your own subscription receives winner waiver events, verification and waiver details appear here."
              />
            )}
          </WorkspaceSection>

          <WorkspaceSection
            title="Recent linked products"
            description="Latest subscription-linked product surfaces from your own customer workspace."
            action={
              <ActionButton href="/customer/subscriptions" variant="outline">
                Open all subscriptions
              </ActionButton>
            }
          >
            {productError ? (
              <WorkspaceNotice tone="warning" title="Subscription context unavailable">
                {productError}
              </WorkspaceNotice>
            ) : null}

            {productRows.length > 0 ? (
              <DataTableShell>
                <div className="grid gap-4 xl:grid-cols-2">
                  {productRows.map((subscription) => (
                    <CustomerProductSummaryCard
                      key={subscription.id}
                      subscription={subscription}
                      href={`/customer/subscriptions/${subscription.id}`}
                      compact
                    />
                  ))}
                </div>
              </DataTableShell>
            ) : !productError ? (
              <EmptyState
                title="No linked subscriptions yet"
                description="Subscription-linked product visibility appears here after a real customer subscription is created."
                action={
                  <ActionButton href="/customer/subscription-requests" variant="outline">
                    Open subscription requests
                  </ActionButton>
                }
              />
            ) : null}
          </WorkspaceSection>
        </div>
      ) : null}
    </PortalPage>
  );
}
