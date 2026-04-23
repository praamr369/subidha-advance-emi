"use client";

import {
  ClipboardList,
  CreditCard,
  LifeBuoy,
  PlusCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

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

  function hydrate(payload: CustomerProfileResponse) {
    setData(payload);
    setName(payload.name);
    setPhone(payload.phone);
    setEmail(payload.email || "");
    setAddress(payload.address || "");
    setCity(payload.city || "");
  }

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const [profileResult, subscriptionsResult] = await Promise.allSettled([
        getCustomerProfile(),
        listCustomerSubscriptionsRegister({ page: 1, pageSize: 4 }),
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
