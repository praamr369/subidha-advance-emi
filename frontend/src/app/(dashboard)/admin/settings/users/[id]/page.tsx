"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import StatCard from "@/components/ui/StatCard";
import {
  activateInternalUser,
  deactivateInternalUser,
  getInternalUser,
  getInternalUserAudit,
  type InternalUserAuditEntry,
  type InternalUserRecord,
} from "@/services/internal-users";

function toMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Unable to load managed user.";
}

function roleTone(role: string): string {
  switch (role) {
    case "ADMIN":
      return "border-red-200 bg-red-50 text-red-700";
    case "CASHIER":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "PARTNER":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    default:
      return "border-border bg-muted text-foreground";
  }
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN");
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

export default function AdminInternalUserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params?.id;

  const [user, setUser] = useState<InternalUserRecord | null>(null);
  const [auditRows, setAuditRows] = useState<InternalUserAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<"activate" | "deactivate" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!userId) return;

      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        setError(null);

        const [userPayload, auditPayload] = await Promise.all([
          getInternalUser(userId),
          getInternalUserAudit(userId),
        ]);

        setUser(userPayload);
        setAuditRows(auditPayload.results || []);
      } catch (err) {
        setError(toMessage(err));
        setUser(null);
        setAuditRows([]);
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [userId]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const stats = useMemo(() => {
    if (!user) return [];

    const base: Array<{
      label: string;
      value: string;
      subtext: string;
    }> = [
      {
        label: "Role",
        value: user.role,
        subtext: "Managed operational role",
      },
    ];

    if (user.role === "PARTNER") {
      base.push({
        label: "Commission %",
        value: user.commission_rate ? `${user.commission_rate}%` : "0.00%",
        subtext: "Partner commission setting",
      });
    }

    base.push(
      {
        label: "Status",
        value: user.is_active ? "Active" : "Inactive",
        subtext: "Current login availability",
      },
      {
        label: "Staff Flag",
        value: user.is_staff ? "True" : "False",
        subtext: "Internal application access",
      },
      {
        label: "Last Login",
        value: user.last_login ? formatDateTime(user.last_login) : "Never",
        subtext: "Most recent successful login",
      }
    );

    return base;
  }, [user]);

  async function handleActivate() {
    if (!user) return;

    const confirmed = window.confirm(`Activate ${user.username}?`);
    if (!confirmed) return;

    try {
      setActionLoading("activate");
      setMessage(null);
      setError(null);

      const updated = await activateInternalUser(user.id);
      setUser(updated);
      setMessage(`${updated.username} activated successfully.`);
      await loadPage("refresh");
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeactivate() {
    if (!user) return;

    const confirmed = window.confirm(
      `Deactivate ${user.username}? They will no longer be able to log in.`
    );
    if (!confirmed) return;

    try {
      setActionLoading("deactivate");
      setMessage(null);
      setError(null);

      const updated = await deactivateInternalUser(user.id);
      setUser(updated);
      setMessage(`${updated.username} deactivated successfully.`);
      await loadPage("refresh");
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <ERPPageShell
      eyebrow="Settings · Users"
      title={user ? `Managed User: ${user.full_name || user.username}` : "Managed User Detail"}
      subtitle="Review identity, role posture, account status, and audit history for managed admin, cashier, and partner accounts."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Settings", href: ROUTES.admin.settings },
        { label: "Managed Users", href: ROUTES.admin.settingsUsers },
        { label: user ? (user.full_name || user.username) : "Detail" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <div className="flex flex-wrap gap-2">
        <Link
          href={ROUTES.admin.settingsUsers}
          className="inline-flex items-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
        >
          Back to List
        </Link>

        {user ? (
          <Link
            href={`${ROUTES.admin.settingsUsers}/${user.id}/edit`}
            className="inline-flex items-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            Edit
          </Link>
        ) : null}

        {user?.is_active ? (
          <button
            type="button"
            onClick={() => void handleDeactivate()}
            disabled={actionLoading !== null}
            className="inline-flex items-center rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-60"
          >
            {actionLoading === "deactivate" ? "Working..." : "Deactivate"}
          </button>
        ) : user ? (
          <button
            type="button"
            onClick={() => void handleActivate()}
            disabled={actionLoading !== null}
            className="inline-flex items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
          >
            {actionLoading === "activate" ? "Working..." : "Activate"}
          </button>
        ) : null}
      </div>

      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      {(loading || refreshing) && !user ? (
        <LoadingBlock label="Loading managed user detail..." />
      ) : null}

      {!loading && error ? (
        <ErrorState
          title="Unable to load managed user detail"
          description={error}
          onRetry={() => void loadPage("initial")}
        />
      ) : null}

      {!loading && !error && !user ? (
        <EmptyState
          title="Managed user not found"
          description="The requested managed user record could not be loaded."
        />
      ) : null}

      {!loading && !error && user ? (
        <>
          <section className="flex justify-end">
            <button
              type="button"
              onClick={() => void loadPage("refresh")}
              disabled={refreshing || actionLoading !== null}
              className="inline-flex items-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {stats.map((item) => (
              <StatCard
                key={item.label}
                label={item.label}
                value={item.value}
                subtext={item.subtext}
              />
            ))}
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Identity</h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <InfoRow
                label="Full Name"
                value={
                  user.full_name ||
                  `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
                  "—"
                }
              />
              <InfoRow label="Username" value={`@${user.username}`} />
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Role
                </div>
                <div>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${roleTone(
                      user.role
                    )}`}
                  >
                    {user.role}
                  </span>
                </div>
              </div>
              {user.role === "PARTNER" ? (
                <InfoRow
                  label="Commission %"
                  value={user.commission_rate ? `${user.commission_rate}%` : "0.00%"}
                />
              ) : null}
              <InfoRow label="Status" value={user.is_active ? "Active" : "Inactive"} />
              <InfoRow label="Phone" value={user.phone || "—"} />
              <InfoRow label="Email" value={user.email || "—"} />
              <InfoRow label="Created" value={formatDateTime(user.date_joined)} />
              <InfoRow label="Last Login" value={formatDateTime(user.last_login)} />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Audit Timeline</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Account creation, edits, activation changes, and password reset history.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void loadPage("refresh")}
                disabled={refreshing || actionLoading !== null}
                className="inline-flex items-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {auditRows.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="No audit entries"
                  description="No audit records are currently available for this managed user."
                />
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted/40">
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Action</th>
                      <th className="px-4 py-3 font-medium">Performed By</th>
                      <th className="px-4 py-3 font-medium">Timestamp</th>
                      <th className="px-4 py-3 font-medium">Metadata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-sm">
                    {auditRows.map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {row.action_type}
                        </td>
                        <td className="px-4 py-3">{row.performed_by || "System"}</td>
                        <td className="px-4 py-3">{formatDateTime(row.created_at)}</td>
                        <td className="px-4 py-3">
                          <pre className="max-w-xl overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
                            {JSON.stringify(row.metadata || {}, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </ERPPageShell>
  );
}
