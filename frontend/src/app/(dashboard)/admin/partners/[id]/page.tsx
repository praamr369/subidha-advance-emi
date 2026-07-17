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
  Shield,
  User,
  XCircle,
} from "lucide-react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import KycDocumentPanel from "@/components/kyc/KycDocumentPanel";
import ERPPageShell from "@/components/erp/ERPPageShell";
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

type Tab = "overview" | "account" | "kyc";

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

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold text-card-foreground">
        {value}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground">{value || "—"}</span>
    </div>
  );
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
    tone === "success"
      ? CheckCircle2
      : tone === "error"
        ? AlertCircle
        : Info;

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
  const [tab, setTab] = useState<Tab>("overview");

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

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <User className="size-4" /> },
    {
      key: "account",
      label: "Account Actions",
      icon: <Shield className="size-4" />,
    },
    {
      key: "kyc",
      label: "KYC Documents",
      icon: <KeyRound className="size-4" />,
    },
  ];

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
          value: partner
            ? partner.is_active
              ? "Active"
              : "Inactive"
            : "—",
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
          {/* Tab bar */}
          <div className="flex gap-1 rounded-xl border border-border bg-muted/30 p-1">
            {TABS.map(({ key, label, icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                  tab === key
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {/* Overview */}
          {tab === "overview" ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatCard
                  label="Referred Customers"
                  value={partner.referred_customers}
                />
                <StatCard
                  label="Active Subscriptions"
                  value={partner.active_subscriptions}
                />
                <StatCard
                  label="Total Commission"
                  value={formatRupee(partner.total_commission)}
                />
              </div>

              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h3 className="mb-4 text-sm font-semibold text-card-foreground">
                  Partner Information
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <InfoRow label="Partner ID" value={`#${partner.id}`} />
                  <InfoRow label="Username" value={partner.username} />
                  <InfoRow label="Email" value={partner.email} />
                  <InfoRow label="Phone" value={partner.phone} />
                  <InfoRow
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
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h3 className="mb-4 text-sm font-semibold text-card-foreground">
                  Quick Navigation
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
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
              </div>
            </div>
          ) : null}

          {/* Account Actions */}
          {tab === "account" ? (
            <div className="space-y-5">
              {/* Change Username */}
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-1 flex items-center gap-2">
                  <User className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-card-foreground">
                    Change Username
                  </h3>
                </div>
                <p className="mb-4 text-xs text-muted-foreground">
                  Changes the partner&apos;s login username only. Customer IDs,
                  subscription history, and financial records are unaffected.
                  The partner will need to sign in again after this change.
                </p>

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
                    <Notice tone={usernameNotice.tone}>
                      {usernameNotice.msg}
                    </Notice>
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
              </div>

              {/* Password Reset */}
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-1 flex items-center gap-2">
                  <KeyRound className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-card-foreground">
                    Password Reset
                  </h3>
                </div>
                <p className="mb-4 text-xs text-muted-foreground">
                  Partners reset their own password using the Forgot Password
                  flow on the login page. Admin-side forced password reset is
                  available through the Django Admin panel for emergency access.
                </p>

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
                        Share this link — has "Forgot password" built in
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
                    For security, admin-forced password resets are not exposed
                    in this interface. If the partner is locked out, use the
                    Django Admin link above or ask them to use Forgot Password
                    on the login page.
                  </Notice>
                </div>
              </div>

              {/* Danger zone — deactivate */}
              <div className="rounded-xl border border-red-200 bg-card p-5 shadow-sm dark:border-red-900">
                <div className="mb-1 flex items-center gap-2">
                  <XCircle className="size-4 text-red-500" />
                  <h3 className="text-sm font-semibold text-card-foreground">
                    Account Status
                  </h3>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Deactivating a partner prevents login and hides them from
                  active partner lists. Their historical records and
                  subscriptions are preserved. Manage via Django Admin.
                </p>
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
              </div>
            </div>
          ) : null}

          {/* KYC Documents */}
          {tab === "kyc" ? (
            <KycDocumentPanel mode="admin" owner="partner" ownerId={partner.id} />
          ) : null}
        </div>
      ) : null}
    </ERPPageShell>
  );
}
