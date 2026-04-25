"use client";

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
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import FormActions from "@/components/ui/FormActions";
import FormSection from "@/components/ui/FormSection";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceNotice } from "@/components/ui/role-workspace";
import StatusBadge from "@/components/ui/status-badge";
import { DetailItem, WorkspaceSection } from "@/components/ui/workspace";
import CustomerProductSummaryCard from "@/domains/subscriptions/components/CustomerProductSummaryCard";
import {
  getCustomerProfile,
  updateCustomerProfile,
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

function money(value: string | number): string {
  return `₹${Number(value || 0).toFixed(2)}`;
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

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const [profileResult, subscriptionsResult, kycResult, referralResult] =
        await Promise.allSettled([
          getCustomerProfile(),
          listCustomerSubscriptionsRegister({ page: 1, pageSize: 4 }),
          listCustomerKycDocuments(),
          listCustomerReferrals(),
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
    } catch (err) {
      setError(toErrorMessage(err));
      setData(null);
      setProductRows([]);
      setProductError(null);
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
        value: money(data.summary.total_paid_amount ?? 0),
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
    >
      {loading ? <LoadingBlock label="Loading profile workspace..." /> : null}

      {!loading && error && !data ? (
        <ErrorState
          title="Unable to load profile"
          description={error}
          onRetry={loadPage}
        />
      ) : null}

      {!loading && !error && data ? (
        <div className="space-y-6">
          <ControlLaneGrid
            title="Self-service lanes"
            description="Use the current customer-safe workspace routes without crossing into internal branch or finance controls."
            lanes={selfServiceLanes}
          />

          <WorkspaceSection
            title="Account identity"
            description="Core customer identity and KYC posture from your live profile record."
            action={
              <ActionButton
                variant="outline"
                onClick={() => void loadPage()}
                disabled={loading || saving}
              >
                Refresh
              </ActionButton>
            }
          >
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
            {photoUrl ? (
              <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl}
                  alt="Profile photo"
                  className="h-20 w-20 rounded-full border border-border object-cover"
                />
                <p className="text-sm text-muted-foreground">
                  Profile photo is set. You can upload a new one to replace it.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No profile photo uploaded. Click &ldquo;Upload photo&rdquo; to add one.
              </p>
            )}
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
                      {doc.notes && (
                        <span className="ml-2 text-muted-foreground text-xs">{doc.notes}</span>
                      )}
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
