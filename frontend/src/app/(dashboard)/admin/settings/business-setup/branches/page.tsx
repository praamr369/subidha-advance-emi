"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import {
  createBranch,
  listBranches,
  updateBranch,
  type BranchRecord,
} from "@/services/business-setup";

const initialForm: Partial<BranchRecord> = {
  code: "",
  name: "",
  branch_type: "BRANCH",
  email: "",
  phone: "",
  manager_name: "",
  address_line_1: "",
  address_line_2: "",
  landmark: "",
  city: "",
  district: "",
  state: "",
  postal_code: "",
  country: "India",
  is_head_office: false,
  is_active: true,
  opened_on: "",
  notes: "",
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to save branch.";
}

export default function BranchesPage() {
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [form, setForm] = useState<Partial<BranchRecord>>(initialForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadBranches() {
    try {
      const records = await listBranches();
      setBranches(records);
      setMessage(null);
    } catch (error) {
      setMessage(toErrorMessage(error));
    }
  }

  useEffect(() => {
    let isMounted = true;

    listBranches()
      .then((records) => {
        if (!isMounted) {
          return;
        }
        setBranches(records);
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
    setForm((current) => ({ ...current, [target.name]: value }));
  }

  function startEdit(branch: BranchRecord) {
    setEditingId(branch.id);
    setForm(branch);
  }

  function resetForm() {
    setEditingId(null);
    setForm(initialForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (editingId) {
        await updateBranch(editingId, form);
        setMessage("Branch updated.");
      } else {
        await createBranch(form);
        setMessage("Branch created.");
      }
      resetForm();
      await loadBranches();
    } catch (error) {
      setMessage(toErrorMessage(error));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Branches" description="Manage head office, branches, warehouses, and collection points." />
      <BusinessSetupLinks />

      {message ? <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">{message}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[380px,1fr]">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="text-base font-semibold text-foreground">{editingId ? "Edit branch" : "Create branch"}</div>
          <div className="mt-4 grid gap-3">
            <input name="code" value={form.code || ""} onChange={handleChange} placeholder="Code" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <input name="name" value={form.name || ""} onChange={handleChange} placeholder="Name" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <select name="branch_type" value={form.branch_type || "BRANCH"} onChange={handleChange} className="rounded-xl border border-input bg-background px-3 py-2 text-sm">
              <option value="HEAD_OFFICE">Head Office</option>
              <option value="BRANCH">Branch</option>
              <option value="WAREHOUSE">Warehouse</option>
              <option value="COLLECTION_POINT">Collection Point</option>
            </select>
            <input name="email" value={form.email || ""} onChange={handleChange} placeholder="Email" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <input name="phone" value={form.phone || ""} onChange={handleChange} placeholder="Phone" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <input name="manager_name" value={form.manager_name || ""} onChange={handleChange} placeholder="Manager name" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <input name="city" value={form.city || ""} onChange={handleChange} placeholder="City" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <input name="state" value={form.state || ""} onChange={handleChange} placeholder="State" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <input name="opened_on" value={form.opened_on || ""} onChange={handleChange} placeholder="Opened on (YYYY-MM-DD)" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <textarea name="notes" value={form.notes || ""} onChange={handleChange} placeholder="Notes" className="min-h-[100px] rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="is_head_office" checked={Boolean(form.is_head_office)} onChange={handleChange} />
              Head office
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="is_active" checked={Boolean(form.is_active)} onChange={handleChange} />
              Active
            </label>
          </div>
          <div className="mt-4 flex gap-3">
            <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              {editingId ? "Update" : "Create"}
            </button>
            {editingId ? (
              <button type="button" onClick={resetForm} className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground">
                Cancel
              </button>
            ) : null}
          </div>
        </form>

        <section className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4 text-sm font-medium text-muted-foreground">
            Active branch register
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Code</th>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">City</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {branches.map((branch) => (
                  <tr key={branch.id}>
                    <td className="px-5 py-3 font-medium text-foreground">{branch.code}</td>
                    <td className="px-5 py-3 text-foreground">{branch.name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{branch.branch_type}</td>
                    <td className="px-5 py-3 text-muted-foreground">{branch.city || "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">{branch.is_active ? "Active" : "Inactive"}</td>
                    <td className="px-5 py-3">
                      <button type="button" onClick={() => startEdit(branch)} className="text-sm font-medium text-primary hover:underline">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {branches.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-6 text-center text-muted-foreground">
                      No branches configured yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
