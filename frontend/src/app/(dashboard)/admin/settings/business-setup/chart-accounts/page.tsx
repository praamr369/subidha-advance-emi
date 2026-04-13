"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import {
  createChartAccount,
  listChartAccounts,
  updateChartAccount,
  type ChartAccountRecord,
} from "@/services/business-setup";

const initialForm: Partial<ChartAccountRecord> = {
  code: "",
  name: "",
  account_category: "ASSET",
  account_group: "CASH",
  parent: null,
  description: "",
  is_system: false,
  is_active: true,
  allow_manual_posting: true,
  display_order: 0,
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to save chart account.";
}

export default function ChartAccountsPage() {
  const [records, setRecords] = useState<ChartAccountRecord[]>([]);
  const [form, setForm] = useState<Partial<ChartAccountRecord>>(initialForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadData() {
    try {
      const data = await listChartAccounts();
      setRecords(data);
      setMessage(null);
    } catch (error) {
      setMessage(toErrorMessage(error));
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const target = event.target;
    const value = target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target.value;
    setForm((current) => ({
      ...current,
      [target.name]:
        target.name === "display_order"
          ? Number(value)
          : target.name === "parent"
            ? value ? Number(value) : null
            : value,
    }));
  }

  function startEdit(record: ChartAccountRecord) {
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
        await updateChartAccount(editingId, form);
        setMessage("Chart account updated.");
      } else {
        await createChartAccount(form);
        setMessage("Chart account created.");
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
        title="Chart accounts"
        description="Maintain accounting classification heads separate from operational finance accounts."
      />
      <BusinessSetupLinks />
      {message ? <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">{message}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[380px,1fr]">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="text-base font-semibold text-foreground">{editingId ? "Edit chart account" : "Create chart account"}</div>
          <div className="mt-4 grid gap-3">
            <input name="code" value={form.code || ""} onChange={handleChange} placeholder="Code" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <input name="name" value={form.name || ""} onChange={handleChange} placeholder="Name" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <select name="account_category" value={form.account_category || "ASSET"} onChange={handleChange} className="rounded-xl border border-input bg-background px-3 py-2 text-sm">
              <option value="ASSET">Asset</option>
              <option value="LIABILITY">Liability</option>
              <option value="INCOME">Income</option>
              <option value="EXPENSE">Expense</option>
              <option value="EQUITY">Equity</option>
            </select>
            <select name="account_group" value={form.account_group || "CASH"} onChange={handleChange} className="rounded-xl border border-input bg-background px-3 py-2 text-sm">
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
              <option value="RECEIVABLE">Receivable</option>
              <option value="PAYABLE">Payable</option>
              <option value="REVENUE">Revenue</option>
              <option value="COMMISSION">Commission</option>
              <option value="WAIVER">Waiver</option>
              <option value="TAX">Tax</option>
              <option value="EXPENSE">Expense</option>
              <option value="SUSPENSE">Suspense</option>
              <option value="EQUITY">Equity</option>
            </select>
            <select name="parent" value={form.parent || ""} onChange={handleChange} className="rounded-xl border border-input bg-background px-3 py-2 text-sm">
              <option value="">No parent</option>
              {records.filter((record) => record.id !== editingId).map((record) => (
                <option key={record.id} value={record.id}>{record.code} - {record.name}</option>
              ))}
            </select>
            <input name="display_order" value={form.display_order ?? 0} onChange={handleChange} placeholder="Display order" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <textarea name="description" value={form.description || ""} onChange={handleChange} placeholder="Description" className="min-h-[100px] rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="is_system" checked={Boolean(form.is_system)} onChange={handleChange} />System account</label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="allow_manual_posting" checked={Boolean(form.allow_manual_posting)} onChange={handleChange} />Allow manual posting</label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="is_active" checked={Boolean(form.is_active)} onChange={handleChange} />Active</label>
          </div>
          <div className="mt-4 flex gap-3">
            <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{editingId ? "Update" : "Create"}</button>
            {editingId ? <button type="button" onClick={resetForm} className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground">Cancel</button> : null}
          </div>
        </form>

        <section className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4 text-sm font-medium text-muted-foreground">Chart account register</div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Code</th>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium">Group</th>
                  <th className="px-5 py-3 font-medium">Parent</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="px-5 py-3 font-medium text-foreground">{record.code}</td>
                    <td className="px-5 py-3 text-foreground">{record.name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{record.account_category}</td>
                    <td className="px-5 py-3 text-muted-foreground">{record.account_group}</td>
                    <td className="px-5 py-3 text-muted-foreground">{record.parent_name || "—"}</td>
                    <td className="px-5 py-3"><button type="button" onClick={() => startEdit(record)} className="text-sm font-medium text-primary hover:underline">Edit</button></td>
                  </tr>
                ))}
                {records.length === 0 ? <tr><td colSpan={6} className="px-5 py-6 text-center text-muted-foreground">No chart accounts configured yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
