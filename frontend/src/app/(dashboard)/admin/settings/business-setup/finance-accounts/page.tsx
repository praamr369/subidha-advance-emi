"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import {
  createFinanceAccount,
  listFinanceAccounts,
  updateFinanceAccount,
  type FinanceAccountRecord,
} from "@/services/business-setup";

const initialForm: Partial<FinanceAccountRecord> = {
  code: "",
  name: "",
  account_type: "CASH",
  account_holder_name: "",
  provider_name: "",
  bank_name: "",
  branch_name: "",
  masked_account_number: "",
  ifsc_code: "",
  upi_handle: "",
  notes: "",
  is_active: true,
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to save finance account.";
}

export default function FinanceAccountsPage() {
  const [records, setRecords] = useState<FinanceAccountRecord[]>([]);
  const [form, setForm] = useState<Partial<FinanceAccountRecord>>(initialForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadRecords() {
    try {
      const data = await listFinanceAccounts();
      setRecords(data);
      setMessage(null);
    } catch (error) {
      setMessage(toErrorMessage(error));
    }
  }

  useEffect(() => {
    void loadRecords();
  }, []);

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const target = event.target;
    const value = target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target.value;
    setForm((current) => ({ ...current, [target.name]: value }));
  }

  function startEdit(record: FinanceAccountRecord) {
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
        await updateFinanceAccount(editingId, form);
        setMessage("Finance account updated.");
      } else {
        await createFinanceAccount(form);
        setMessage("Finance account created.");
      }
      resetForm();
      await loadRecords();
    } catch (error) {
      setMessage(toErrorMessage(error));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance accounts"
        description="Manage operational cash, bank, and UPI collection accounts. These are not chart-of-account heads."
      />
      <BusinessSetupLinks />
      {message ? <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">{message}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[380px,1fr]">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="text-base font-semibold text-foreground">{editingId ? "Edit finance account" : "Create finance account"}</div>
          <div className="mt-4 grid gap-3">
            <input name="code" value={form.code || ""} onChange={handleChange} placeholder="Code" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <input name="name" value={form.name || ""} onChange={handleChange} placeholder="Name" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <select name="account_type" value={form.account_type || "CASH"} onChange={handleChange} className="rounded-xl border border-input bg-background px-3 py-2 text-sm">
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
              <option value="UPI">UPI</option>
              <option value="OTHER">Other</option>
            </select>
            <input name="account_holder_name" value={form.account_holder_name || ""} onChange={handleChange} placeholder="Account holder name" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <input name="provider_name" value={form.provider_name || ""} onChange={handleChange} placeholder="Provider name" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <input name="bank_name" value={form.bank_name || ""} onChange={handleChange} placeholder="Bank name" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <input name="branch_name" value={form.branch_name || ""} onChange={handleChange} placeholder="Bank branch name" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <input name="masked_account_number" value={form.masked_account_number || ""} onChange={handleChange} placeholder="Masked account number" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <input name="ifsc_code" value={form.ifsc_code || ""} onChange={handleChange} placeholder="IFSC code" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <input name="upi_handle" value={form.upi_handle || ""} onChange={handleChange} placeholder="UPI handle" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <textarea name="notes" value={form.notes || ""} onChange={handleChange} placeholder="Notes" className="min-h-[100px] rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="is_active" checked={Boolean(form.is_active)} onChange={handleChange} />
              Active
            </label>
          </div>
          <div className="mt-4 flex gap-3">
            <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              {editingId ? "Update" : "Create"}
            </button>
            {editingId ? <button type="button" onClick={resetForm} className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground">Cancel</button> : null}
          </div>
        </form>

        <section className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4 text-sm font-medium text-muted-foreground">Operational finance account register</div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Code</th>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Provider</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="px-5 py-3 font-medium text-foreground">{record.code}</td>
                    <td className="px-5 py-3 text-foreground">{record.name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{record.account_type}</td>
                    <td className="px-5 py-3 text-muted-foreground">{record.provider_name || record.bank_name || "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">{record.is_active ? "Active" : "Inactive"}</td>
                    <td className="px-5 py-3">
                      <button type="button" onClick={() => startEdit(record)} className="text-sm font-medium text-primary hover:underline">Edit</button>
                    </td>
                  </tr>
                ))}
                {records.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-6 text-center text-muted-foreground">No finance accounts configured yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
