"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Info,
  KeyRound,
  User,
  XCircle,
} from "lucide-react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import KycDocumentPanel from "@/components/kyc/KycDocumentPanel";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { Party360Embed, UniversalQuickWidgetsEmbed } from "@/components/profile/Profile360";
import { WorkbenchFilterChips } from "@/components/workbench/WorkbenchFilterChips";
import {
  DetailItem as DetailValue,
  WorkspaceSection as SectionCard,
} from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type PartnerDetail = {
  id: number;
  username: string;
  email?: string;
  phone?: string;
  is_active: boolean;
  referred_customers: number;
  active_subscriptions: number;
  total_commission: string | number;
};

type Segment = "overview" | "operations" | "account" | "kyc";

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: "overview", label: "Overview & Actions" },
  { key: "operations", label: "Operations 360" },
  { key: "account", label: "Account Actions" },
  { key: "kyc", label: "KYC Documents" },
];

function toNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Request failed.";
}

function formatRupee(v: string | number | undefined): string {
  return `₹${toNum(v).toFixed(2)}`;
}

function Notice({
  tone,
  children,
}: {
  tone: "success" | "error" | "info";
  children: React.ReactNode;
}) {
  const styles = {
    success:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    error:
      "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
    info: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  };
  const Icon =
    tone === "success" ? CheckCircle2 : tone === "error" ? AlertCircle : Info;

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${styles[tone]}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export default function AdminPartnerDetailPage() {
  const params = useParams<{ id: string }>();
  const partnerId = Number(params?.id || 0);

  const [partner, setPartner] = useState<PartnerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [segment, setSegment] = useState<Segment>("overview");

  // username change
  const [newUsername, setNewUsername] = useState("");
  const [usernameReason, setUsernameReason] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameNotice, setUsernameNotice] = useState<{
    tone: "success" | "error";
    msg: string;
  } | null>(null);

  const loadPage = useCallback(async () => {
    if (!partnerId) return;
    setLoading(true);
    try {
      const payload = await apiFetch<PartnerDetail>(
        `/admin/partners/${partnerId}/`
      );
      setPartner(payload);
      setError(null);
    } catch (err) {
      setPartner(null);
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const handleChangeUsername = useCallback(async () => {
    if (!partner?.id) return;
    setUsernameSaving(true);
    setUsernameNotice(null);
    try {
      await apiFetch(`/admin/users/${partner.id}/username/`, {
        method: "PATCH",
        body: {
          new_username: newUsername.trim(),
          reason: usernameReason.trim(),
        },
      });
      setUsernameNotice({
        tone: "success",
        msg: `Username changed to "${newUsername.trim()}". Partner must sign in again with the new username.`,
      });
      setNewUsername("");
      setUsernameReason("");
      await loadPage();
    } catch (err) {
      setUsernameNotice({ tone: "error", msg: toErrorMessage(err) });
    } finally {
      setUsernameSaving(false);
    }
  }, [loadPage, newUsername, partner?.id, usernameReason]);

  return (
    <ERPPageShell
      eyebrow="Partners"
      title={partner ? `Partner — ${partner.username}` : "Partner Detail"}
      subtitle="Partner profile, login identity management, and KYC document review."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Partners", href: "/admin/partners" },
        { label: partner ? partner.username : `#${partnerId}` },
      ]}
      actions={[
        {
          href: `/admin/requests/subscriptions?requester_role=PARTNER&q=${partner?.username}`,
          label: "View Subscription Requests",
          variant: "primary",
        },
        { href: "/admin/partners", label: "All Partners", variant: "secondary" },
        {
          href: `/admin/subscriptions?partner=${partnerId}`,
          label: "View Subscriptions",
          variant: "secondary",
        },
        {
          href: `/admin/finance/commissions?partner=${partnerId}`,
          label: "Commissions",
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Partner ID", value: partner?.id ?? "—" },
        {
          label: "Status",
          value: partner ? (partner.is_active ? "Active" : "Inactive") : "—",
        },
        { label: "Referred", value: partner?.referred_customers ?? "—" },
        { label: "Active Subs", value: partner?.active_subscriptions ?? "—" },
      ]}
      statusBadge={{
        label: partner?.is_active ? "Active" : "Inactive",
        tone: partner?.is_active ? "success" : ("warning" as const),
      }}
    >
      {loading ? <LoadingBlock label="Loading partner..." /> : null}

      {!loading && error ? (
        <ErrorState
          title="Unable to load partner"
          description={error}
          onRetry={() => void loadPage()}
        />
      ) : null}

      {!loading && partner ? (
        <div className="space-y-6">
          {/* Segmented workbench navigation */}
          <div className="sticky top-0 z-10 -mx-2 bg-background/95 px-2 py-3 backdrop-blur sm:-mx-6 sm:px-6">
            <WorkbenchFilterChips
              active={segment}
              onSelect={(key) => setSegment(key as Segment)}
              chips={SEGMENTS}
            />
          </div>

          {/* Overview & Actions */}
          {segment === "overview" && (
            <div className="space-y-6">
              <UniversalQuickWidgetsEmbed role="PARTNER" sourceId={partner.id} />

              <div className="grid gap-6 xl:grid-cols-2">
                <SectionCard
                  title="Partner Information"
                  description="Primary partner facts used for admin operations."
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <DetailValue label="Partner ID" value={`#${partner.id}`} />
                    <DetailValue label="Username" value={partner.username} />
                    <DetailValue label="Email" value={partner.email || "—"} />
                    <DetailValue label="Phone" value={partner.phone || "—"} />
                    <DetailValue
                      label="Account Status"
                      value={
                        partner.is_active ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 className="size-3.5" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-500">
                            <XCircle className="size-3.5" /> Inactive
                          </span>
                        )
                      }
                    />
                    <DetailValue
                      label="Total Commission"
                      value={formatRupee(partner.total_commission)}
                    />
                  </div>
                </SectionCard>

                <SectionCard
                  title="Quick Navigation"
                  description="Jump to the partner's linked operational registers."
                >
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      {
                        label: "Subscription Requests",
                        desc: "View Advance EMI requests submitted by this partner",
                        href: `/admin/requests/subscriptions?requester_role=PARTNER&q=${partner.username}`,
                      },
                      {
                        label: "Subscriptions",
                        desc: "View all subscriptions linked to this partner",
                        href: `/admin/subscriptions?partner=${partner.id}`,
                      },
                      {
                        label: "Commission History",
                        desc: "Commission ledger and payout records",
                        href: `/admin/finance/commissions?partner=${partner.id}`,
                      },
                      {
                        label: "Collection Requests",
                        desc: "Partner-submitted field collection reports",
                        href: `/admin/partners/collection-requests?partner=${partner.id}`,
                      },
                      {
                        label: "All Partners",
                        desc: "Back to the full partner register",
                        href: "/admin/partners",
                      },
                    ].map(({ label, desc, href }) => (
                      <Link
                        key={href}
                        href={href}
                        className="flex items-center justify-between rounded-xl border border-border bg-background p-4 transition hover:bg-muted"
                      >
                        <div>
                          <div className="text-sm font-medium text-foreground">
                            {label}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {desc}
                          </div>
                        </div>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </Link>
                    ))}
                  </div>
                </SectionCard>
              </div>
            </div>
          )}

          {/* Operations 360 — full cross-module alerts, financials & tables */}
          {segment === "operations" && (
            <Party360Embed role="PARTNER" sourceId={partner.id} />
          )}

          {/* Account Actions */}
          {segment === "account" && (
            <div className="space-y-6">
              <SectionCard
                title="Change Username"
                description="Changes the partner's login username only. Customer IDs, subscription history, and financial records are unaffected. The partner will need to sign in again after this change."
              >
                <div className="mb-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Current Username
                  </span>
                  <div className="mt-1 text-base font-semibold text-foreground">
                    {partner.username}
                  </div>
                </div>

                {usernameNotice ? (
                  <div className="mb-4">
                    <Notice tone={usernameNotice.tone}>{usernameNotice.msg}</Notice>
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="new-username"
                      className="text-xs font-medium text-foreground"
                    >
                      New Username <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="new-username"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="e.g. partner_rahul_2025"
                      className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="username-reason"
                      className="text-xs font-medium text-foreground"
                    >
                      Reason for change <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="username-reason"
                      value={usernameReason}
                      onChange={(e) => setUsernameReason(e.target.value)}
                      placeholder="e.g. Partner requested name correction"
                      className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => void handleChangeUsername()}
                    disabled={
                      usernameSaving ||
                      !newUsername.trim() ||
                      !usernameReason.trim()
                    }
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {usernameSaving ? "Saving…" : "Change Username"}
                  </button>
                </div>
              </SectionCard>

              <SectionCard
                title="Password Reset"
                description="Partners reset their own password using the Forgot Password flow on the login page. Admin-side forced password reset is available through the Django Admin panel for emergency access."
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <a
                    href="/login"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-xl border border-border bg-background p-4 transition hover:bg-muted"
                  >
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        Partner Login Page
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Share this link — has &quot;Forgot password&quot; built in
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </a>

                  <a
                    href="/admin-django/subscriptions/user/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-xl border border-border bg-background p-4 transition hover:bg-muted"
                  >
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        Django Admin — Users
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Force-set password for emergency access
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </a>
                </div>

                <div className="mt-4">
                  <Notice tone="info">
                    For security, admin-forced password resets are not exposed in
                    this interface. If the partner is locked out, use the Django
                    Admin link above or ask them to use Forgot Password on the
                    login page.
                  </Notice>
                </div>
              </SectionCard>

              <SectionCard
                title="Account Status"
                description="Deactivating a partner prevents login and hides them from active partner lists. Their historical records and subscriptions are preserved. Manage via Django Admin."
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                      partner.is_active
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                    }`}
                  >
                    {partner.is_active ? (
                      <CheckCircle2 className="size-3" />
                    ) : (
                      <XCircle className="size-3" />
                    )}
                    {partner.is_active ? "Account Active" : "Account Inactive"}
                  </span>
                  <a
                    href={`/admin-django/subscriptions/user/${partner.id}/change/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Edit in Django Admin →
                  </a>
                </div>
              </SectionCard>
            </div>
          )}

          {/* KYC Documents */}
          {segment === "kyc" && (
            <KycDocumentPanel mode="admin" owner="partner" ownerId={partner.id} />
          )}
        </div>
      ) : null}
    </ERPPageShell>
  );
}
