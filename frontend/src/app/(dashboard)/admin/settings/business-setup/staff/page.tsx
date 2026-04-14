"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import { listInternalUsers, type InternalUserRecord } from "@/services/internal-users";
import {
  createStaffAssignment,
  listBranches,
  listCashDesks,
  listStaffAssignments,
  updateStaffAssignment,
  type BranchRecord,
  type CashDeskRecord,
  type StaffOperationalAssignmentRecord,
} from "@/services/business-setup";

const initialDate = new Date().toISOString().slice(0, 10);

const initialForm: Partial<StaffOperationalAssignmentRecord> = {
  user: 0,
  role_scope: "CASHIER",
  branch: 0,
  default_cash_desk: null,
  can_collect_payments: true,
  can_verify_payments: false,
  can_manage_branches: false,
  can_manage_cash_desks: false,
  can_manage_finance_accounts: false,
  can_manage_chart_accounts: false,
  can_run_go_live_reset: false,
  is_primary: false,
  is_active: true,
  effective_from: initialDate,
  effective_to: "",
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to save staff setup.";
}

export default function StaffSetupPage() {
  const [records, setRecords] = useState<StaffOperationalAssignmentRecord[]>([]);
  const [users, setUsers] = useState<InternalUserRecord[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [cashDesks, setCashDesks] = useState<CashDeskRecord[]>([]);
  const [form, setForm] = useState<Partial<StaffOperationalAssignmentRecord>>(initialForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadData() {
    try {
      const [assignmentRecords, internalUsers, branchRecords, deskRecords] = await Promise.all([
        listStaffAssignments(),
        listInternalUsers(),
        listBranches(),
        listCashDesks(),
      ]);
      setRecords(assignmentRecords);
      setUsers(internalUsers.results);
      setBranches(branchRecords);
      setCashDesks(deskRecords.filter((desk) => desk.is_active));
      setMessage(null);
    } catch (error) {
      setMessage(toErrorMessage(error));
    }
  }

  useEffect(() => {
    let isMounted = true;

    Promise.all([listStaffAssignments(), listInternalUsers(), listBranches(), listCashDesks()])
      .then(([assignmentRecords, internalUsers, branchRecords, deskRecords]) => {
        if (!isMounted) {
          return;
        }
        setRecords(assignmentRecords);
        setUsers(internalUsers.results);
        setBranches(branchRecords);
        setCashDesks(deskRecords.filter((desk) => desk.is_active));
        setMessage(null);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        setMessage(toErrorMessage(error));
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredCashDesks = useMemo(() => {
    if (!form.branch) {
      return [];
    }
    return cashDesks.filter((desk) => desk.branch === Number(form.branch));
  }, [cashDesks, form.branch]);

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const target = event.target;
    const value = target.type === "checkbox" ? target.checked : target.value;
    setForm((current) => ({
      ...current,
      [target.name]:
        target.name === "user" || target.name === "branch"
          ? Number(value)
          : target.name === "default_cash_desk"
            ? value ? Number(value) : null
            : value,
    }));
  }

  function startEdit(record: StaffOperationalAssignmentRecord) {
    setEditingId(record.id);
    setForm({
      ...record,
      effective_to: record.effective_to || "",
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(initialForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (editingId) {
        await updateStaffAssignment(editingId, form);
        setMessage("Staff assignment updated.");
      } else {
        await createStaffAssignment(form);
        setMessage("Staff assignment created.");
      }
      resetForm();
      await loadData();
    } catch (error) {
      setMessage(toErrorMessage(error));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff setup"
        description="Assign branch-level operational scopes without changing the core auth model."
      />
      <BusinessSetupLinks />
      {message ? <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">{message}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[420px,1fr]">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="text-base font-semibold text-foreground">{editingId ? "Edit assignment" : "Create assignment"}</div>
          <div className="mt-4 grid gap-3">
            <select name="user" value={form.user || 0} onChange={handleChange} className="rounded-xl border border-input bg-background px-3 py-2 text-sm">
              <option value={0}>Select user</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.username}</option>
              ))}
            </select>
            <select name="role_scope" value={form.role_scope || "CASHIER"} onChange={handleChange} className="rounded-xl border border-input bg-background px-3 py-2 text-sm">
              <option value="ADMIN">Admin</option>
              <option value="CASHIER">Cashier</option>
              <option value="PARTNER">Partner</option>
              <option value="MANAGER">Manager</option>
              <option value="FINANCE_REVIEWER">Finance Reviewer</option>
            </select>
            <select name="branch" value={form.branch || 0} onChange={handleChange} className="rounded-xl border border-input bg-background px-3 py-2 text-sm">
              <option value={0}>Select branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            <select name="default_cash_desk" value={form.default_cash_desk || ""} onChange={handleChange} className="rounded-xl border border-input bg-background px-3 py-2 text-sm">
              <option value="">No default cash desk</option>
              {filteredCashDesks.map((desk) => (
                <option key={desk.id} value={desk.id}>{desk.name}</option>
              ))}
            </select>
            <input name="effective_from" value={form.effective_from || ""} onChange={handleChange} placeholder="Effective from" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <input name="effective_to" value={form.effective_to || ""} onChange={handleChange} placeholder="Effective to" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="can_collect_payments" checked={Boolean(form.can_collect_payments)} onChange={handleChange} />Can collect payments</label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="can_verify_payments" checked={Boolean(form.can_verify_payments)} onChange={handleChange} />Can verify payments</label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="can_manage_branches" checked={Boolean(form.can_manage_branches)} onChange={handleChange} />Can manage branches</label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="can_manage_cash_desks" checked={Boolean(form.can_manage_cash_desks)} onChange={handleChange} />Can manage cash desks</label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="can_manage_finance_accounts" checked={Boolean(form.can_manage_finance_accounts)} onChange={handleChange} />Can manage finance accounts</label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="can_manage_chart_accounts" checked={Boolean(form.can_manage_chart_accounts)} onChange={handleChange} />Can manage chart accounts</label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="can_run_go_live_reset" checked={Boolean(form.can_run_go_live_reset)} onChange={handleChange} />Can run go-live reset</label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="is_primary" checked={Boolean(form.is_primary)} onChange={handleChange} />Primary active assignment</label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="is_active" checked={Boolean(form.is_active)} onChange={handleChange} />Active</label>
          </div>
          <div className="mt-4 flex gap-3">
            <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{editingId ? "Update" : "Create"}</button>
            {editingId ? <button type="button" onClick={resetForm} className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground">Cancel</button> : null}
          </div>
        </form>

        <section className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4 text-sm font-medium text-muted-foreground">Operational staff assignments</div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-5 py-3 font-medium">Role Scope</th>
                  <th className="px-5 py-3 font-medium">Branch</th>
                  <th className="px-5 py-3 font-medium">Desk</th>
                  <th className="px-5 py-3 font-medium">Permissions</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="px-5 py-3 font-medium text-foreground">{record.username || record.user}</td>
                    <td className="px-5 py-3 text-muted-foreground">{record.role_scope}</td>
                    <td className="px-5 py-3 text-muted-foreground">{record.branch_name || record.branch}</td>
                    <td className="px-5 py-3 text-muted-foreground">{record.default_cash_desk_name || "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {[record.can_collect_payments ? "Collect" : null, record.can_verify_payments ? "Verify" : null].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-5 py-3"><button type="button" onClick={() => startEdit(record)} className="text-sm font-medium text-primary hover:underline">Edit</button></td>
                  </tr>
                ))}
                {records.length === 0 ? <tr><td colSpan={6} className="px-5 py-6 text-center text-muted-foreground">No staff assignments configured yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
