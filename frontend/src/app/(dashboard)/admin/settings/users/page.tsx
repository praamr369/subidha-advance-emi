"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/status-badge";
import TableToolbar from "@/components/ui/TableToolbar";
import { DataTableShell, MobileSafeTable } from "@/components/ui/operations";
import {
  activateInternalUser,
  deactivateInternalUser,
  listInternalUsers,
  type InternalUserRecord,
  type InternalUserRole,
} from "@/services/internal-users";

function toMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Unable to load managed users.";
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN");
}

function roleTone(role: InternalUserRole): string {
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

function roleHelp(role: InternalUserRole): string {
  switch (role) {
    case "ADMIN":
      return "Application-level control";
    case "CASHIER":
      return "Counter operations";
    case "PARTNER":
      return "Managed partner access";
    default:
      return "";
  }
}

type UserFilters = {
  role: InternalUserRole | "";
  q: string;
  is_active: "true" | "false" | "";
};

const defaultFilters: UserFilters = {
  role: "",
  q: "",
  is_active: "",
};

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

export default function AdminInternalUsersPage() {
  const [draftFilters, setDraftFilters] = useState<UserFilters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<UserFilters>(defaultFilters);

  const [rows, setRows] = useState<InternalUserRecord[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const response = await listInternalUsers({
          role: appliedFilters.role,
          q: appliedFilters.q,
          is_active: appliedFilters.is_active,
        });

        setRows(response.results);
        setCount(response.count);
        setError(null);
      } catch (err) {
        setError(toMessage(err));
        setRows([]);
        setCount(0);
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [appliedFilters]
  );

  useEffect(() => {
    void loadUsers("initial");
  }, [loadUsers]);

  const stats = useMemo(() => {
    const admins = rows.filter((row) => row.role === "ADMIN").length;
    const cashiers = rows.filter((row) => row.role === "CASHIER").length;
    const partners = rows.filter((row) => row.role === "PARTNER").length;
    const active = rows.filter((row) => row.is_active).length;
    const inactive = rows.filter((row) => !row.is_active).length;

    return {
      admins,
      cashiers,
      partners,
      active,
      inactive,
    };
  }, [rows]);

async function handleActivate(user: InternalUserRecord) {
    try {
      setActionLoadingId(user.id);
      setMessage(null);
      setError(null);

      await activateInternalUser(user.id);
      setMessage(`${user.username} activated successfully.`);
      await loadUsers("refresh");
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setActionLoadingId(null);
    }
  }

async function handleDeactivate(user: InternalUserRecord) {
    try {
      setActionLoadingId(user.id);
      setMessage(null);
      setError(null);

      await deactivateInternalUser(user.id);
      setMessage(`${user.username} deactivated successfully.`);
      await loadUsers("refresh");
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setActionLoadingId(null);
    }
  }

  function handleApplyFilters() {
    setMessage(null);
    setError(null);
    setAppliedFilters({
      role: draftFilters.role,
      q: draftFilters.q.trim(),
      is_active: draftFilters.is_active,
    });
  }

  function handleClearFilters() {
    setMessage(null);
    setError(null);
    setDraftFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Managed Users"
        description="Control ADMIN, CASHIER, and PARTNER accounts from one internal workspace with activation, deactivation, audit visibility, and role-safe lifecycle management."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/settings"
              className="inline-flex items-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
            >
              Back to Settings
            </Link>
            <Link
              href="/admin/settings/users/create"
              className="inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95"
            >
              Create Managed User
            </Link>
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard
          label="Matched users"
          value={String(count)}
          hint="Filtered backend count"
        />
        <SummaryCard
          label="Visible rows"
          value={String(rows.length)}
          hint="Current loaded records"
        />
        <SummaryCard
          label="Admins"
          value={String(stats.admins)}
          hint="Highest-control users"
        />
        <SummaryCard
          label="Cashiers"
          value={String(stats.cashiers)}
          hint="Daily collection users"
        />
        <SummaryCard
          label="Partners"
          value={String(stats.partners)}
          hint="Internally managed partners"
        />
        <SummaryCard
          label="Active"
          value={String(stats.active)}
          hint={`${stats.inactive} inactive account(s)`}
        />
      </section>

      <TableToolbar
        title="Filter register"
        description="Search by username, phone, email, or name. Filter by role and active status to operate safely across internal and partner-managed accounts."
      >
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Role</label>
            <select
              value={draftFilters.role}
              onChange={(e) =>
                setDraftFilters((current) => ({
                  ...current,
                  role: e.target.value as InternalUserRole | "",
                }))
              }
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
            >
              <option value="">All roles</option>
              <option value="ADMIN">Admin</option>
              <option value="CASHIER">Cashier</option>
              <option value="PARTNER">Partner</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Status</label>
            <select
              value={draftFilters.is_active}
              onChange={(e) =>
                setDraftFilters((current) => ({
                  ...current,
                  is_active: e.target.value as "true" | "false" | "",
                }))
              }
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
            >
              <option value="">All statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-foreground">Search</label>
            <input
              value={draftFilters.q}
              onChange={(e) =>
                setDraftFilters((current) => ({
                  ...current,
                  q: e.target.value,
                }))
              }
              placeholder="Username, full name, phone, email"
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleApplyFilters}
            disabled={refreshing || loading}
            className="inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Apply filters"}
          </button>

          <button
            type="button"
            onClick={handleClearFilters}
            disabled={refreshing || loading}
            className="inline-flex items-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            Clear
          </button>

          <button
            type="button"
            onClick={() => void loadUsers("refresh")}
            disabled={refreshing || loading}
            className="inline-flex items-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </TableToolbar>

      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      {loading ? <LoadingBlock label="Loading managed users..." /> : null}

      {!loading && error ? (
        <ErrorState
          title="Unable to load managed users"
          description={error}
          onRetry={() => void loadUsers("initial")}
        />
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          title="No managed users found"
          description="No ADMIN, CASHIER, or PARTNER records match the current filters."
        />
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <DataTableShell>
          <MobileSafeTable className="border-none bg-transparent">
            <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Commission %</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Staff</th>
                <th className="px-4 py-3 font-medium">Last Login</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border text-sm">
              {rows.map((row) => {
                const fullName =
                  row.full_name?.trim() ||
                  `${row.first_name || ""} ${row.last_name || ""}`.trim() ||
                  row.username;

                return (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{fullName}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        @{row.username}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${roleTone(row.role)}`}>
                          {row.role}
                        </span>
                        <div className="text-xs text-muted-foreground">
                          {roleHelp(row.role)}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-foreground">
                      {row.role === "PARTNER"
                        ? `${row.commission_rate ?? "0.00"}%`
                        : "—"}
                    </td>

                    <td className="px-4 py-3 text-foreground">{row.phone || "—"}</td>
                    <td className="px-4 py-3 text-foreground">{row.email || "—"}</td>
                    <td className="px-4 py-3 text-foreground">
                      <StatusBadge status={row.is_active ? "ACTIVE" : "ARCHIVED"} hideIcon />
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {row.is_staff ? "Yes" : "No"}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {formatDateTime(row.last_login)}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {formatDateTime(row.date_joined)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/settings/users/${row.id}`}
                          className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
                        >
                          View
                        </Link>

                        <Link
                          href={`/admin/settings/users/${row.id}/edit`}
                          className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
                        >
                          Edit
                        </Link>

                        {row.is_active ? (
                          <ConfirmActionButton
                            label={actionLoadingId === row.id ? "Working..." : "Deactivate"}
                            confirmLabel="Deactivate user"
                            title={`Deactivate ${row.username}?`}
                            description="The user will no longer be able to log in until reactivated by an admin."
                            onConfirm={async () => {
                              await handleDeactivate(row);
                            }}
                            variant="destructive"
                            disabled={actionLoadingId === row.id}
                          />
                        ) : (
                          <ConfirmActionButton
                            label={actionLoadingId === row.id ? "Working..." : "Activate"}
                            confirmLabel="Activate user"
                            title={`Activate ${row.username}?`}
                            description="This account will be able to access internal portals again according to its role."
                            onConfirm={async () => {
                              await handleActivate(row);
                            }}
                            variant="secondary"
                            disabled={actionLoadingId === row.id}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </MobileSafeTable>
        </DataTableShell>
      ) : null}
    </div>
  );
}
