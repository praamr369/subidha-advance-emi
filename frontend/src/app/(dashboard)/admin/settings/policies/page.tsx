"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import PageHeader from "@/components/ui/PageHeader";
import { ApiError } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import {
  createAdminPolicy,
  listAdminPolicies,
  seedDefaultPolicies,
  type AdminPolicyPage,
  type PolicyCreatePayload,
} from "@/services/policies";

const categoryOptions = [
  "GENERAL",
  "PRIVACY",
  "REFUND",
  "WARRANTY",
  "DELIVERY",
  "RENT_LEASE",
  "LUCKY_PLAN",
  "DIRECT_SALE",
  "PAYMENT",
  "SERVICE",
  "GRIEVANCE",
  "COMPLIANCE",
  "CUSTOMER_SUPPORT",
] as const;

const initialForm: PolicyCreatePayload = {
  slug: "",
  category: "GENERAL",
  title: "",
  summary: "",
  content: "# ",
  status: "DRAFT",
};

function readableError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.readableMessage || error.message;
  }
  return error instanceof Error ? error.message : "Request failed.";
}

export default function AdminPoliciesSettingsPage() {
  const [rows, setRows] = useState<AdminPolicyPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<PolicyCreatePayload>(initialForm);

  async function loadPolicies() {
    try {
      setLoading(true);
      const payload = await listAdminPolicies();
      setRows(payload.results);
      setError(null);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPolicies();
  }, []);

  async function handleSeed() {
    try {
      setSeeding(true);
      const result = await seedDefaultPolicies();
      setMessage(
        `Default templates seeded. created=${result.created}, updated=${result.updated}, skipped=${result.skipped}.`
      );
      await loadPolicies();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSeeding(false);
    }
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setCreating(true);
      const policy = await createAdminPolicy(form);
      setMessage(`Draft created for ${policy.slug} v${policy.version}.`);
      setForm(initialForm);
      await loadPolicies();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Policy governance"
        description="Admin-only legal policy drafts, publishing, and archival controls for public legal pages."
      />

      <section className="rounded-2xl border border-amber-300/70 bg-amber-50/90 p-4 text-sm text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-100">
        Legal review is required before publishing any policy. Draft text must be validated by management/legal review before it is made public.
      </section>

      {message ? (
        <section className="rounded-2xl border border-emerald-300/70 bg-emerald-50/90 p-4 text-sm text-emerald-900 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-900/20 dark:text-emerald-100">
          {message}
        </section>
      ) : null}

      {error ? (
        <section className="rounded-2xl border border-red-300/70 bg-red-50/90 p-4 text-sm text-red-900 shadow-sm dark:border-red-500/40 dark:bg-red-900/20 dark:text-red-100">
          {error}
        </section>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Default templates</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Seed default policy templates as editable drafts. Draft content is never public until published.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSeed}
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-accent disabled:opacity-60"
            disabled={seeding}
          >
            {seeding ? "Seeding..." : "Seed default templates"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Create policy draft</h2>
        <form className="mt-4 grid gap-3" onSubmit={handleCreate}>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={form.slug}
              onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value.trim().toLowerCase() }))}
              placeholder="slug (example: terms)"
              className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
              required
            />
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Policy title"
              className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
              required
            />
          </div>

          <select
            value={form.category}
            onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
            className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
          >
            {categoryOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <textarea
            value={form.summary}
            onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
            placeholder="Policy summary"
            className="min-h-[70px] rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />

          <textarea
            value={form.content}
            onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
            placeholder="Markdown content"
            className="min-h-[180px] rounded-xl border border-input bg-background px-3 py-2 text-sm"
            required
          />

          <div>
            <button
              type="submit"
              disabled={creating}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              {creating ? "Creating..." : "Create draft"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Policy registry</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage versions and status. Open a slug to edit, create draft versions, publish, and archive.
        </p>

        {loading ? (
          <div className="mt-4 text-sm text-muted-foreground">Loading policies...</div>
        ) : rows.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            No policy rows yet. Seed templates first.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="px-3 py-2">Slug</th>
                  <th className="px-3 py-2">Version</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Updated</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className="px-3 py-2 font-medium text-foreground">{row.slug}</td>
                    <td className="px-3 py-2 text-muted-foreground">v{row.version}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.status}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.category}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.updated_at ? new Date(row.updated_at).toLocaleString() : "-"}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`${ROUTES.admin.settingsPolicies}/${row.slug}`}
                        className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
