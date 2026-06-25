"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import StatCard from "@/components/ui/StatCard";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  createBranch,
  getBranchReadiness,
  listBranches,
  updateBranch,
  type BranchPayload,
  type BranchReadiness,
  type BranchRecord,
} from "@/services/branch-control";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unable to save branch governance changes.";
}

type BranchForm = {
  code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  is_primary: boolean;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

function emptyForm(): BranchForm {
  return {
    code: "",
    name: "",
    status: "ACTIVE",
    is_primary: false,
    phone: "",
    email: "",
    address: "",
    notes: "",
  };
}

function statusBadge(tone: "green" | "amber" | "red" | "blue" | "slate") {
  const map = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };
  return `inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${map[tone]}`;
}

export default function AdminBranchesPage() {
  const [rows, setRows] = useState<BranchRecord[]>([]);
  const [readiness, setReadiness] = useState<BranchReadiness | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [form, setForm] = useState<BranchForm>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [branchPayload, readinessPayload] = await Promise.all([listBranches(), getBranchReadiness()]);
      setRows(branchPayload.results);
      setReadiness(readinessPayload);
      setError(null);
    } catch (err) {
      setRows([]);
      setReadiness(null);
      setError(toErrorMessage(err));
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  const selectedBranch = useMemo(
    () => rows.find((row) => row.id === selectedBranchId) ?? null,
    [rows, selectedBranchId],
  );

  const columns: EnterpriseColumnDef<BranchRecord>[] = [
    { key: "code", header: "Code" },
    { key: "name", header: "Branch" },
    { key: "status", header: "Status" },
    {
      key: "is_primary",
      header: "Primary",
      render: (row) => (row.is_primary ? "Primary default" : "Secondary"),
    },
    {
      key: "phone",
      header: "Contact",
      render: (row) => row.phone || row.email || "—",
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <button
          type="button"
          onClick={() => {
            setSelectedBranchId(row.id);
            setForm({
              code: row.code,
              name: row.name,
              status: row.status,
              is_primary: row.is_primary,
              phone: row.phone || "",
              email: row.email || "",
              address: row.address || "",
              notes: row.notes || "",
            });
            setNotice(null);
            setError(null);
          }}
          className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-muted"
        >
          Edit
        </button>
      ),
    },
  ];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    const payload: BranchPayload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      status: form.status,
      is_primary: form.is_primary,
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      notes: form.notes.trim(),
    };

    try {
      if (selectedBranch) {
        await updateBranch(selectedBranch.id, payload);
        setNotice(`Branch ${payload.code} updated.`);
      } else {
        await createBranch(payload);
        setNotice(`Branch ${payload.code} created.`);
      }
      setSelectedBranchId(null);
      setForm(emptyForm());
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setSelectedBranchId(null);
    setForm(emptyForm());
    setNotice(null);
    setError(null);
  }

  const activeCount = rows.filter((row) => row.status === "ACTIVE").length;
  const inactiveCount = rows.filter((row) => row.status === "INACTIVE").length;
  const primaryBranch = readiness?.primary_branch ?? rows.find((row) => row.is_primary) ?? null;
  const activeCounters = readiness?.counts.active_counters ?? 0;
  const branchesWithCounters = readiness?.counts.branches_with_counters ?? 0;
  const hasBranchBlocker = Boolean(readiness?.blockers?.length);

  return (
    <ERPPageShell
      title="Branch Master"
      subtitle="Govern branch ownership centrally so subscriptions, collections, billing, inventory, accounting, and workforce records can carry explicit branch context without collapsing those modules into one table."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Branches" },
      ]}
      actions={[
        { href: ROUTES.admin.counters, label: "Counters", variant: "secondary" },
        { href: ROUTES.admin.branchReporting, label: "Branch Reporting", variant: "primary" },
      ]}
      stats={[
        { label: "Branches", value: String(rows.length), tone: "info" },
        { label: "Active", value: String(activeCount), tone: activeCount > 0 ? "success" : "default" },
        { label: "Inactive", value: String(inactiveCount), tone: inactiveCount > 0 ? "warning" : "default" },
        { label: "Primary Default", value: primaryBranch?.code || "Unset", tone: primaryBranch ? "info" : "warning" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        {loading ? <ERPLoadingState label="Loading branches..." /> : null}
        {!loading && error ? (
          <ERPErrorState
            title="Unable to load branches"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <>
            <WorkspaceSection
              title="Branch readiness"
              description="This is the launch gate for branch-safe operations: one active primary branch, active counter coverage, and branch traceability."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Readiness"
                  value={readiness?.status || "NEEDS_SETUP"}
                  subtext={hasBranchBlocker ? "Resolve blockers before cashier rollout." : "Branch setup is safe for current shop operation."}
                  tone={hasBranchBlocker ? "warning" : "success"}
                />
                <StatCard
                  label="Active Counters"
                  value={String(activeCounters)}
                  subtext="Counters link cashier collection to branch and finance account."
                  tone={activeCounters > 0 ? "success" : "warning"}
                />
                <StatCard
                  label="Counter Coverage"
                  value={String(branchesWithCounters)}
                  subtext="Active branches with at least one active counter."
                  tone={branchesWithCounters > 0 ? "info" : "warning"}
                />
                <StatCard
                  label="Operational Posture"
                  value={activeCount > 1 ? "Multi-branch" : "Single-branch"}
                  subtext="Current business can stay single-branch; expansion remains additive."
                  tone="info"
                />
              </div>
              {readiness?.blockers?.length ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                  <div className="font-semibold">Blockers</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5">{readiness.blockers.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              ) : null}
              {readiness?.warnings?.length ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <div className="font-semibold">Warnings</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5">{readiness.warnings.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={ROUTES.admin.counters} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold hover:bg-accent">Open counters</Link>
                <Link href={ROUTES.admin.branchReporting} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold hover:bg-accent">Open reporting</Link>
                <button type="button" onClick={() => void loadPage("refresh")} disabled={refreshing} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-60">{refreshing ? "Refreshing..." : "Refresh"}</button>
              </div>
            </WorkspaceSection>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Primary Branch"
                value={primaryBranch?.name || "Not set"}
                subtext="Existing single-branch records fall back here during additive branch rollout."
                tone={primaryBranch ? "success" : "warning"}
              />
              <StatCard
                label="Financial Integrity"
                value="No rewrite"
                subtext="Branch setup does not rewrite EMI, payment, receipt, journal, or stock history."
                tone="info"
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <WorkspaceSection
                title="Branch Register"
                description="Branch codes and primary-branch designation drive safe defaults for existing records and new branch-aware operations."
              >
                {rows.length === 0 ? (
                  <ERPEmptyState
                    title="No branches yet"
                    description="Create the primary branch first so existing operational records have a safe default governance home."
                  />
                ) : (
                  <EnterpriseDataTable
                    data={rows}
                    columns={columns}
                    emptyTitle="No branches found"
                    emptyDescription="Create a branch to begin branch-safe operations."
                    rowKey={(row: BranchRecord) => row.id}
                  />
                )}
              </WorkspaceSection>

              <WorkspaceSection
                title={selectedBranch ? `Edit ${selectedBranch.code}` : "Create Branch"}
                description="Use one primary branch only. Marking a branch primary safely clears the previous primary flag in the backend."
              >
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="text-sm text-foreground">
                      <span className="mb-2 block font-medium">Code</span>
                      <input
                        value={form.code}
                        onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-ring"
                        placeholder="BR-MAIN"
                        required
                      />
                    </label>
                    <label className="text-sm text-foreground">
                      <span className="mb-2 block font-medium">Name</span>
                      <input
                        value={form.name}
                        onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-ring"
                        placeholder="Main Showroom"
                        required
                      />
                    </label>
                    <label className="text-sm text-foreground">
                      <span className="mb-2 block font-medium">Status</span>
                      <select
                        value={form.status}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            status: event.target.value as BranchForm["status"],
                            is_primary: event.target.value === "INACTIVE" ? false : current.is_primary,
                          }))
                        }
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-ring"
                      >
                        <option value="ACTIVE">Active</option>
                        <option value="INACTIVE">Inactive</option>
                      </select>
                    </label>
                    <label className="text-sm text-foreground">
                      <span className="mb-2 block font-medium">Phone</span>
                      <input
                        value={form.phone}
                        onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-ring"
                        placeholder="Branch contact phone"
                      />
                    </label>
                    <label className="text-sm text-foreground md:col-span-2">
                      <span className="mb-2 block font-medium">Email</span>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-ring"
                        placeholder="branch@example.com"
                      />
                    </label>
                    <label className="text-sm text-foreground md:col-span-2">
                      <span className="mb-2 block font-medium">Address</span>
                      <textarea
                        rows={3}
                        value={form.address}
                        onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-ring"
                        placeholder="Physical branch address"
                      />
                    </label>
                    <label className="text-sm text-foreground md:col-span-2">
                      <span className="mb-2 block font-medium">Notes</span>
                      <textarea
                        rows={3}
                        value={form.notes}
                        onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-ring"
                        placeholder="Operational notes, opening remarks, or branch-control posture."
                      />
                    </label>
                  </div>

                  <label className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={form.is_primary}
                      disabled={form.status !== "ACTIVE"}
                      onChange={(event) => setForm((current) => ({ ...current, is_primary: event.target.checked }))}
                      className="h-4 w-4 rounded border-border"
                    />
                    Mark this as the primary branch default for legacy and fallback branch assignment.
                  </label>
                  {form.status !== "ACTIVE" && form.is_primary ? <div className={statusBadge("red")}>Inactive branches cannot be primary.</div> : null}

                  {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}
                  {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

                  <div className="flex flex-wrap gap-3">
                    <button type="submit" disabled={saving} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition disabled:opacity-60">
                      {saving ? "Saving..." : selectedBranch ? "Update Branch" : "Create Branch"}
                    </button>
                    <button type="button" onClick={resetForm} className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted">Reset</button>
                    <button type="button" onClick={() => void loadPage("refresh")} disabled={refreshing} className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-60">
                      {refreshing ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                </form>
              </WorkspaceSection>
            </div>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
