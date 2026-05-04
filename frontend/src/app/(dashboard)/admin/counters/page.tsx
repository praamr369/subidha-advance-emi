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
import { listFinanceAccounts, type FinanceAccount } from "@/services/accounting";
import {
  createCashCounter,
  listBranches,
  listCashCounters,
  updateCashCounter,
  type BranchRecord,
  type CashCounterPayload,
  type CashCounterRecord,
} from "@/services/branch-control";
import { listInternalUsers, type InternalUserRecord } from "@/services/internal-users";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unable to save counter governance changes.";
}

type CounterForm = {
  code: string;
  name: string;
  branch: string;
  finance_account: string;
  assigned_user: string;
  is_active: boolean;
  notes: string;
};

function emptyForm(): CounterForm {
  return {
    code: "",
    name: "",
    branch: "",
    finance_account: "",
    assigned_user: "",
    is_active: true,
    notes: "",
  };
}

export default function AdminCountersPage() {
  const [rows, setRows] = useState<CashCounterRecord[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [eligibleFinanceAccounts, setEligibleFinanceAccounts] = useState<FinanceAccount[]>([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [eligibleError, setEligibleError] = useState<string | null>(null);
  const [cashiers, setCashiers] = useState<InternalUserRecord[]>([]);
  const [selectedCounterId, setSelectedCounterId] = useState<number | null>(null);
  const [form, setForm] = useState<CounterForm>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [counterPayload, branchPayload, cashierPayload] = await Promise.all([
        listCashCounters(),
        listBranches({ status: "ACTIVE" }),
        listInternalUsers({ role: "CASHIER", is_active: "true" }),
      ]);
      setRows(counterPayload.results);
      setBranches(branchPayload.results);
      setCashiers(cashierPayload.results);
      setError(null);
    } catch (err) {
      setRows([]);
      setBranches([]);
      setEligibleFinanceAccounts([]);
      setCashiers([]);
      setError(toErrorMessage(err));
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  useEffect(() => {
    if (!form.branch) {
      setEligibleFinanceAccounts([]);
      setEligibleError(null);
      setEligibleLoading(false);
      return;
    }
    let cancelled = false;
    setEligibleLoading(true);
    setEligibleError(null);
    listFinanceAccounts({
      is_active: 1,
      for_cash_counter: 1,
      branch: Number(form.branch),
      page_size: 100,
    })
      .then((payload) => {
        if (!cancelled) {
          setEligibleFinanceAccounts(payload.results);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setEligibleFinanceAccounts([]);
          setEligibleError(toErrorMessage(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setEligibleLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [form.branch]);

  const selectedCounter = useMemo(
    () => rows.find((row) => row.id === selectedCounterId) ?? null,
    [rows, selectedCounterId]
  );

  const columns: EnterpriseColumnDef<CashCounterRecord>[] = [
    { key: "code", header: "Counter" },
    { key: "branch_name", header: "Branch" },
    { key: "finance_account_name", header: "Collection Book" },
    {
      key: "assigned_user_username",
      header: "Assigned Cashier",
      render: (row) => row.assigned_user_username || "Unassigned",
    },
    {
      key: "is_active",
      header: "Status",
      render: (row) => (row.is_active ? "Active" : "Inactive"),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <button
          type="button"
          onClick={() => {
            setSelectedCounterId(row.id);
            setForm({
              code: row.code,
              name: row.name,
              branch: String(row.branch),
              finance_account: String(row.finance_account),
              assigned_user: row.assigned_user ? String(row.assigned_user) : "",
              is_active: row.is_active,
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

    const payload: CashCounterPayload = {
      code: form.code.trim(),
      name: form.name.trim(),
      branch: Number(form.branch),
      finance_account: Number(form.finance_account),
      assigned_user: form.assigned_user ? Number(form.assigned_user) : null,
      is_active: form.is_active,
      notes: form.notes.trim(),
    };

    try {
      if (selectedCounter) {
        await updateCashCounter(selectedCounter.id, payload);
        setNotice(`Counter ${payload.code} updated.`);
      } else {
        await createCashCounter(payload);
        setNotice(`Counter ${payload.code} created.`);
      }
      setSelectedCounterId(null);
      setForm(emptyForm());
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setSelectedCounterId(null);
    setForm(emptyForm());
    setError(null);
    setNotice(null);
  }

  const activeCount = rows.filter((row) => row.is_active).length;
  const assignedCount = rows.filter((row) => row.assigned_user).length;
  const coverageCount = new Set(rows.map((row) => row.branch)).size;

  return (
    <PortalPage
      title="Counter & Cash Desk Master"
      subtitle="Map each collection desk to one branch and one finance account so cashier scope, cash discipline, and branch-linked collection reporting stay explicit."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Counters" },
      ]}
      actions={[
        { href: ROUTES.admin.branches, label: "Branches", variant: "secondary" },
        { href: ROUTES.admin.branchReporting, label: "Branch Reporting", variant: "primary" },
      ]}
      stats={[
        { label: "Counters", value: String(rows.length), tone: "info" },
        { label: "Active", value: String(activeCount), tone: activeCount > 0 ? "success" : "default" },
        { label: "Assigned Cashiers", value: String(assignedCount), tone: assignedCount > 0 ? "info" : "warning" },
        { label: "Branch Coverage", value: String(coverageCount), tone: coverageCount > 0 ? "info" : "default" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        {loading ? <LoadingBlock label="Loading counters..." /> : null}
        {!loading && error ? (
          <ErrorState
            title="Unable to load counters"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Cash Discipline"
                value={assignedCount === activeCount && activeCount > 0 ? "Controlled" : "Review"}
                subtext="Each active counter should ideally have a finance book and a cashier assignment."
                tone={assignedCount === activeCount && activeCount > 0 ? "success" : "warning"}
              />
              <StatCard
                label="Collection Mapping"
                value={rows.some((row) => row.finance_account_name) ? "Mapped" : "Missing"}
                subtext="Counter selection remains separate from billing, payment, and accounting truth but flows into those modules as trace context."
                tone={rows.some((row) => row.finance_account_name) ? "info" : "warning"}
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <WorkspaceSection
                title="Counter Register"
                description="Counter assignments are the safe bridge between cashier users, finance books, and branch-scoped collection history."
              >
                {rows.length === 0 ? (
                  <EmptyState
                    title="No counters yet"
                    description="Create at least one active cash desk so cashier operations can carry explicit branch and finance-account context."
                  />
                ) : (
                  <EnterpriseDataTable
                    data={rows}
                    columns={columns}
                    emptyTitle="No counters found"
                    emptyDescription="Create a counter to begin branch-safe cashier discipline."
                    rowKey={(row: CashCounterRecord) => row.id}
                  />
                )}
              </WorkspaceSection>

              <WorkspaceSection
                title={selectedCounter ? `Edit ${selectedCounter.code}` : "Create Counter"}
                description="Each counter must stay inside one branch and map to one active cash-desk finance account for the same branch. Bank and UPI posting still use their own payment accounts from collection screens."
              >
                <form onSubmit={handleSubmit} className="space-y-4">
                  <p className="text-sm text-slate-600">
                    Counters use cash-desk finance accounts only. Bank and UPI receipts are still posted to their own
                    payment accounts through collection forms.
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="text-sm text-slate-700">
                      <span className="mb-2 block font-medium">Code</span>
                      <input
                        value={form.code}
                        onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                        placeholder="CTR-01"
                        required
                      />
                    </label>
                    <label className="text-sm text-slate-700">
                      <span className="mb-2 block font-medium">Name</span>
                      <input
                        value={form.name}
                        onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                        placeholder="Main Cash Desk"
                        required
                      />
                    </label>
                    <label className="text-sm text-slate-700">
                      <span className="mb-2 block font-medium">Branch</span>
                      <select
                        value={form.branch}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            branch: event.target.value,
                            finance_account: "",
                          }))
                        }
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                        required
                      >
                        <option value="">Select branch</option>
                        {branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.code} · {branch.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm text-slate-700">
                      <span className="mb-2 block font-medium">Collection Book</span>
                      <select
                        value={form.finance_account}
                        onChange={(event) => setForm((current) => ({ ...current, finance_account: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                        disabled={!form.branch || eligibleLoading}
                        required
                      >
                        <option value="">
                          {eligibleLoading ? "Loading cash desks…" : form.branch ? "Select cash desk" : "Select branch first"}
                        </option>
                        {eligibleFinanceAccounts.map((account) => {
                          const branchLabel = account.branch_code || account.branch_name || "—";
                          return (
                            <option key={account.id} value={account.id}>
                              {account.name} · {account.kind} · {branchLabel}
                            </option>
                          );
                        })}
                      </select>
                      {eligibleError ? <p className="mt-1 text-xs text-red-600">{eligibleError}</p> : null}
                      {form.branch && !eligibleLoading && eligibleFinanceAccounts.length === 0 && !eligibleError ? (
                        <p className="mt-1 text-xs text-amber-800">
                          Create an active CASH finance account for this branch before creating a counter.
                        </p>
                      ) : null}
                    </label>
                    <label className="text-sm text-slate-700 md:col-span-2">
                      <span className="mb-2 block font-medium">Assigned Cashier</span>
                      <select
                        value={form.assigned_user}
                        onChange={(event) => setForm((current) => ({ ...current, assigned_user: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                      >
                        <option value="">Unassigned</option>
                        {cashiers.map((cashier) => (
                          <option key={cashier.id} value={cashier.id}>
                            {cashier.full_name || cashier.username} · {cashier.username}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm text-slate-700 md:col-span-2">
                      <span className="mb-2 block font-medium">Notes</span>
                      <textarea
                        rows={3}
                        value={form.notes}
                        onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                        placeholder="Counter remarks, handover instructions, or cash-desk scope."
                      />
                    </label>
                  </div>

                  <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Keep this counter active for branch collection and cashier assignment.
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
                      {saving ? "Saving..." : selectedCounter ? "Update Counter" : "Create Counter"}
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
