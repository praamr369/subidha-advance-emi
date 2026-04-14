"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import {
  createCashDesk,
  listBranches,
  listCashDesks,
  listFinanceAccounts,
  updateCashDesk,
  type BranchRecord,
  type CashDeskRecord,
  type FinanceAccountRecord,
} from "@/services/business-setup";

const initialForm: Partial<CashDeskRecord> = {
  code: "",
  name: "",
  branch: 0,
  desk_type: "CASH",
  default_finance_account: 0,
  allow_cash_collection: true,
  allow_bank_collection: false,
  allow_upi_collection: false,
  receipt_printer_name: "",
  device_label: "",
  is_default_for_branch: false,
  is_active: true,
  notes: "",
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to save cash desk.";
}

function getDeskTypeDefaults(deskType: string) {
  switch (deskType) {
    case "BANK":
      return { allow_cash_collection: false, allow_bank_collection: true, allow_upi_collection: false };
    case "UPI":
      return { allow_cash_collection: false, allow_bank_collection: false, allow_upi_collection: true };
    case "MIXED":
      return { allow_cash_collection: true, allow_bank_collection: false, allow_upi_collection: false };
    case "CASH":
    default:
      return { allow_cash_collection: true, allow_bank_collection: false, allow_upi_collection: false };
  }
}

export default function CashDesksPage() {
  const [records, setRecords] = useState<CashDeskRecord[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccountRecord[]>([]);
  const [form, setForm] = useState<Partial<CashDeskRecord>>(initialForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadData() {
    try {
      const [cashDesks, branchRecords, financeAccounts] = await Promise.all([
        listCashDesks(),
        listBranches(),
        listFinanceAccounts(),
      ]);
      setRecords(cashDesks);
      setBranches(branchRecords);
      setAccounts(financeAccounts.filter((account) => account.is_active));
      setMessage(null);
    } catch (error) {
      setMessage(toErrorMessage(error));
    }
  }

  useEffect(() => {
    let isMounted = true;

    Promise.all([listCashDesks(), listBranches(), listFinanceAccounts()])
      .then(([cashDesks, branchRecords, financeAccounts]) => {
        if (!isMounted) {
          return;
        }
        setRecords(cashDesks);
        setBranches(branchRecords);
        setAccounts(financeAccounts.filter((account) => account.is_active));
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

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const target = event.target;
    const value = target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target.value;

    if (target.name === "desk_type") {
      const deskType = String(value);
      setForm((current) => ({ ...current, desk_type: deskType, ...getDeskTypeDefaults(deskType) }));
      return;
    }

    setForm((current) => ({
      ...current,
      [target.name]: target.name === "branch" || target.name === "default_finance_account" ? Number(value) : value,
    }));
  }

  function startEdit(record: CashDeskRecord) {
    setEditingId(record.id);
    setForm(record);
  }

  function resetForm() {
    setEditingId(null);
    setForm(initialForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (editingId) {
        await updateCashDesk(editingId, form);
        setMessage("Cash desk updated.");
      } else {
        await createCashDesk(form);
        setMessage("Cash desk created.");
      }
      resetForm();
      await loadData();
    } catch (error) {
      setMessage(toErrorMessage(error));
    }
  }

  const activeAccounts = useMemo(() => accounts.filter((account) => account.is_active), [accounts]);

  return (
    <div className="space-y-6">
      <PageHeader title="Cash desks" description="Map branch-level collection desks to active operational finance accounts." />
      <BusinessSetupLinks />
      {message ? <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">{message}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[380px,1fr]">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="text-base font-semibold text-foreground">{editingId ? "Edit cash desk" : "Create cash desk"}</div>
          <div className="mt-4 grid gap-3">
            <input name="code" value={form.code || ""} onChange={handleChange} placeholder="Code" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <input name="name" value={form.name || ""} onChange={handleChange} placeholder="Name" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <select name="branch" value={form.branch || 0} onChange={handleChange} className="rounded-xl border border-input bg-background px-3 py-2 text-sm">
              <option value={0}>Select branch</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            <select name="desk_type" value={form.desk_type || "CASH"} onChange={handleChange} className="rounded-xl border border-input bg-background px-3 py-2 text-sm">
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
              <option value="UPI">UPI</option>
              <option value="MIXED">Mixed</option>
            </select>
            <select name="default_finance_account" value={form.default_finance_account || 0} onChange={handleChange} className="rounded-xl border border-input bg-background px-3 py-2 text-sm">
              <option value={0}>Select finance account</option>
              {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="allow_cash_collection" checked={Boolean(form.allow_cash_collection)} onChange={handleChange} />Allow cash collection</label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="allow_bank_collection" checked={Boolean(form.allow_bank_collection)} onChange={handleChange} />Allow bank collection</label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="allow_upi_collection" checked={Boolean(form.allow_upi_collection)} onChange={handleChange} />Allow UPI collection</label>
            <input name="receipt_printer_name" value={form.receipt_printer_name || ""} onChange={handleChange} placeholder="Receipt printer name" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <input name="device_label" value={form.device_label || ""} onChange={handleChange} placeholder="Device label" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <textarea name="notes" value={form.notes || ""} onChange={handleChange} placeholder="Notes" className="min-h-[100px] rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="is_default_for_branch" checked={Boolean(form.is_default_for_branch)} onChange={handleChange} />Default desk for branch</label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="is_active" checked={Boolean(form.is_active)} onChange={handleChange} />Active</label>
          </div>
          <div className="mt-4 flex gap-3">
            <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{editingId ? "Update" : "Create"}</button>
            {editingId ? <button type="button" onClick={resetForm} className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground">Cancel</button> : null}
          </div>
        </form>

        <section className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4 text-sm font-medium text-muted-foreground">Cash desk register</div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Code</th>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Branch</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Finance Account</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="px-5 py-3 font-medium text-foreground">{record.code}</td>
                    <td className="px-5 py-3 text-foreground">{record.name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{record.branch_name || record.branch}</td>
                    <td className="px-5 py-3 text-muted-foreground">{record.desk_type}</td>
                    <td className="px-5 py-3 text-muted-foreground">{record.default_finance_account_name || "—"}</td>
                    <td className="px-5 py-3"><button type="button" onClick={() => startEdit(record)} className="text-sm font-medium text-primary hover:underline">Edit</button></td>
                  </tr>
                ))}
                {records.length === 0 ? <tr><td colSpan={6} className="px-5 py-6 text-center text-muted-foreground">No cash desks configured yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
