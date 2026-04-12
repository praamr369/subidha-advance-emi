"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  createBranch,
  listBranches,
  updateBranch,
  type BranchPayload,
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

export default function AdminBranchesPage() {
  const [rows, setRows] = useState<BranchRecord[]>([]);
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
      const payload = await listBranches();
      setRows(payload.results);
      setError(null);
    } catch (err) {
      setRows([]);
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
    [rows, selectedBranchId]
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
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
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
      code: form.code.trim(),
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
  const primaryBranch = rows.find((row) => row.is_primary) ?? null;

  return (
    <PortalPage
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
        {loading ? <LoadingBlock label="Loading branches..." /> : null}
        {!loading && error ? (
          <ErrorState
            title="Unable to load branches"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Primary Branch"
                value={primaryBranch?.name || "Not set"}
                subtext="Existing single-branch records fall back here during additive branch rollout."
                tone={primaryBranch ? "success" : "warning"}
              />
              <StatCard
                label="Operational Posture"
                value={activeCount > 1 ? "Multi-branch" : "Single-branch"}
                subtext="New branch-aware posting stays additive on top of the current operational modules."
                tone="info"
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <WorkspaceSection
                title="Branch Register"
                description="Branch codes and primary-branch designation drive safe defaults for existing records and new branch-aware operations."
              >
                {rows.length === 0 ? (
                  <EmptyState
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
                description="Use one primary branch only. That default is used to backfill older single-branch records safely."
              >
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="text-sm text-slate-700">
                      <span className="mb-2 block font-medium">Code</span>
                      <input
                        value={form.code}
                        onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                        placeholder="BR-MAIN"
                        required
                      />
                    </label>
                    <label className="text-sm text-slate-700">
                      <span className="mb-2 block font-medium">Name</span>
                      <input
                        value={form.name}
                        onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                        placeholder="Main Showroom"
                        required
                      />
                    </label>
                    <label className="text-sm text-slate-700">
                      <span className="mb-2 block font-medium">Status</span>
                      <select
                        value={form.status}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            status: event.target.value as BranchForm["status"],
                          }))
                        }
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                      >
                        <option value="ACTIVE">Active</option>
                        <option value="INACTIVE">Inactive</option>
                      </select>
                    </label>
                    <label className="text-sm text-slate-700">
                      <span className="mb-2 block font-medium">Phone</span>
                      <input
                        value={form.phone}
                        onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                        placeholder="Branch contact phone"
                      />
                    </label>
                    <label className="text-sm text-slate-700 md:col-span-2">
                      <span className="mb-2 block font-medium">Email</span>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                        placeholder="branch@example.com"
                      />
                    </label>
                    <label className="text-sm text-slate-700 md:col-span-2">
                      <span className="mb-2 block font-medium">Address</span>
                      <textarea
                        rows={3}
                        value={form.address}
                        onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                        placeholder="Physical branch address"
                      />
                    </label>
                    <label className="text-sm text-slate-700 md:col-span-2">
                      <span className="mb-2 block font-medium">Notes</span>
                      <textarea
                        rows={3}
                        value={form.notes}
                        onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                        placeholder="Operational notes, opening remarks, or branch-control posture."
                      />
                    </label>
                  </div>

                  <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.is_primary}
                      onChange={(event) => setForm((current) => ({ ...current, is_primary: event.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Mark this as the primary branch default for legacy and fallback branch assignment.
                  </label>

                  {notice ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      {notice}
                    </div>
                  ) : null}

                  {error ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                    >
                      {saving ? "Saving..." : selectedBranch ? "Update Branch" : "Create Branch"}
                    </button>
                    <button
                      type="button"
                      onClick={resetForm}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadPage("refresh")}
                      disabled={refreshing}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      {refreshing ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                </form>
              </WorkspaceSection>
            </div>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
