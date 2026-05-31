"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import PageHeader from "@/components/ui/PageHeader";
import { ApiError } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import {
  createAdminPolicy,
  getAdminPolicyCoverage,
  listAdminPolicies,
  seedDefaultPolicies,
  type AdminPolicyPage,
  type PolicyCoverageMatrix,
  type PolicyCoverageRow,
  type PolicyCreatePayload,
  type PolicyStatus,
  type PolicyVisibility,
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

const filterOptions = [
  { key: "ALL", label: "All" },
  { key: "PUBLIC", label: "Public" },
  { key: "INTERNAL", label: "Internal" },
  { key: "DRAFT", label: "Draft" },
  { key: "PUBLISHED", label: "Published" },
  { key: "MISSING", label: "Missing coverage" },
] as const;

type FilterKey = (typeof filterOptions)[number]["key"];

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

function badgeClass(tone: "green" | "amber" | "red" | "blue" | "slate") {
  const map = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };
  return `inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${map[tone]}`;
}

function lifecycleTone(status: PolicyStatus | "MISSING") {
  if (status === "PUBLISHED" || status === "APPROVED") return "green" as const;
  if (status === "DRAFT" || status === "UNDER_REVIEW") return "amber" as const;
  if (status === "MISSING") return "red" as const;
  return "slate" as const;
}

function visibilityTone(visibility?: PolicyVisibility) {
  return visibility === "INTERNAL" ? "blue" : "green";
}

function rowMatchesFilter(row: PolicyCoverageRow, filter: FilterKey): boolean {
  switch (filter) {
    case "PUBLIC":
      return row.visibility === "PUBLIC";
    case "INTERNAL":
      return row.visibility === "INTERNAL";
    case "DRAFT":
      return row.status === "DRAFT";
    case "PUBLISHED":
      return row.status === "PUBLISHED";
    case "MISSING":
      return row.status === "MISSING";
    default:
      return true;
  }
}

function policyMatchesFilter(row: AdminPolicyPage, filter: FilterKey): boolean {
  switch (filter) {
    case "PUBLIC":
      return row.visibility === "PUBLIC";
    case "INTERNAL":
      return row.visibility === "INTERNAL";
    case "DRAFT":
      return row.status === "DRAFT";
    case "PUBLISHED":
      return row.status === "PUBLISHED";
    case "MISSING":
      return false;
    default:
      return true;
  }
}

function readinessLabel(row: AdminPolicyPage | PolicyCoverageRow): string {
  if (row.visibility === "PUBLIC") return row.public_ready ? "Public ready" : "Not public-ready";
  if (row.visibility === "INTERNAL") return row.internal_ready ? "Internal ready" : "Internal draft/control pending";
  return "Needs review";
}

export default function AdminPoliciesSettingsPage() {
  const [rows, setRows] = useState<AdminPolicyPage[]>([]);
  const [coverage, setCoverage] = useState<PolicyCoverageMatrix | null>(null);
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<PolicyCreatePayload>(initialForm);

  async function loadPolicies() {
    try {
      setLoading(true);
      const [policiesPayload, coveragePayload] = await Promise.all([
        listAdminPolicies(),
        getAdminPolicyCoverage(),
      ]);
      setRows(policiesPayload.results);
      setCoverage(coveragePayload);
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
      setMessage(`Default templates seeded as DRAFT. created=${result.created}, updated=${result.updated}, skipped=${result.skipped}.`);
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

  const visiblePolicies = useMemo(() => rows.filter((row) => policyMatchesFilter(row, filter)), [filter, rows]);
  const visibleCoverageGroups = useMemo(() => {
    if (!coverage) return [];
    return coverage.groups
      .map((group) => ({ ...group, items: group.items.filter((item) => rowMatchesFilter(item, filter)) }))
      .filter((group) => group.items.length > 0);
  }, [coverage, filter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Policy governance"
        description="Admin-only legal policy drafts, public/internal separation, coverage readiness, publishing, and archival controls."
      />

      <section className="rounded-2xl border border-amber-300/70 bg-amber-50/90 p-4 text-sm text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-100">
        Legal review is required before publishing any policy. Seeded templates remain DRAFT. DRAFT policies are not public, and INTERNAL policies are never shown on public policy pages.
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
              Seed missing public and internal governance templates as editable DRAFT rows. Existing edited policies are not overwritten by default.
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
        {coverage ? (
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Required</div>
              <div className="mt-1 text-2xl font-semibold text-foreground">{coverage.summary.required_count}</div>
            </div>
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Missing</div>
              <div className="mt-1 text-2xl font-semibold text-foreground">{coverage.summary.missing_count}</div>
            </div>
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Public published</div>
              <div className="mt-1 text-2xl font-semibold text-foreground">{coverage.summary.public_published_count}/{coverage.summary.public_required_count}</div>
            </div>
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Internal ready</div>
              <div className="mt-1 text-2xl font-semibold text-foreground">{coverage.summary.internal_ready_count}/{coverage.summary.internal_required_count}</div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {filterOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${filter === option.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-accent"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Policy Coverage Matrix</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Coverage is grouped by business area. Public launch requires published PUBLIC policies. Internal governance policies support controls and audit but do not replace legal review.
        </p>

        {loading ? (
          <div className="mt-4 text-sm text-muted-foreground">Loading policy coverage...</div>
        ) : visibleCoverageGroups.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No coverage rows match this filter.</div>
        ) : (
          <div className="mt-4 space-y-5">
            {visibleCoverageGroups.map((group) => (
              <div key={group.group} className="rounded-2xl border border-border bg-background p-4">
                <h3 className="text-sm font-semibold text-foreground">{group.group}</h3>
                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  {group.items.map((item) => (
                    <article key={item.required_policy_key} className="rounded-xl border border-border bg-card p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">{item.label}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{item.slug} · {item.category}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className={badgeClass(visibilityTone(item.visibility))}>{item.visibility}</span>
                          <span className={badgeClass(lifecycleTone(item.status))}>{item.status}</span>
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-muted-foreground">{readinessLabel(item)}</div>
                      {item.blocker_reason ? (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                          <div className="font-semibold">Blocker</div>
                          <div className="mt-1">{item.blocker_reason}</div>
                          <div className="mt-1">{item.recommended_action}</div>
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.policy_id ? (
                          <Link href={`${ROUTES.admin.settingsPolicies}/${item.slug}`} className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent">
                            Open policy
                          </Link>
                        ) : (
                          <button type="button" onClick={handleSeed} disabled={seeding} className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent disabled:opacity-60">
                            {seeding ? "Seeding..." : "Seed missing template"}
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Create policy draft</h2>
        <form className="mt-4 grid gap-3" onSubmit={handleCreate}>
          <div className="grid gap-3 md:grid-cols-2">
            <input value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value.trim().toLowerCase() }))} placeholder="slug (example: terms)" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" required />
            <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Policy title" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" required />
          </div>

          <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className="rounded-xl border border-input bg-background px-3 py-2 text-sm">
            {categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>

          <textarea value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} placeholder="Policy summary" className="min-h-[70px] rounded-xl border border-input bg-background px-3 py-2 text-sm" />
          <textarea value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} placeholder="Markdown content" className="min-h-[180px] rounded-xl border border-input bg-background px-3 py-2 text-sm" required />

          <div>
            <button type="submit" disabled={creating} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
              {creating ? "Creating..." : "Create draft"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Policy registry</h2>
        <p className="mt-1 text-sm text-muted-foreground">Manage versions and status. Open a slug to edit, create draft versions, publish, and archive.</p>

        {loading ? (
          <div className="mt-4 text-sm text-muted-foreground">Loading policies...</div>
        ) : visiblePolicies.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No policy rows match this filter.</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="px-3 py-2">Slug</th>
                  <th className="px-3 py-2">Visibility</th>
                  <th className="px-3 py-2">Lifecycle</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Readiness</th>
                  <th className="px-3 py-2">Review due</th>
                  <th className="px-3 py-2">Updated</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {visiblePolicies.map((row) => (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className="px-3 py-2 font-medium text-foreground">{row.slug}<div className="text-xs text-muted-foreground">v{row.version}</div></td>
                    <td className="px-3 py-2"><span className={badgeClass(visibilityTone(row.visibility))}>{row.visibility || "PUBLIC"}</span></td>
                    <td className="px-3 py-2"><span className={badgeClass(lifecycleTone(row.status))}>{row.status}</span></td>
                    <td className="px-3 py-2 text-muted-foreground">{row.governance_category || row.category}</td>
                    <td className="px-3 py-2 text-muted-foreground">{readinessLabel(row)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.review_due_date || "Not exposed"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.updated_at ? new Date(row.updated_at).toLocaleString() : "-"}</td>
                    <td className="px-3 py-2">
                      <Link href={`${ROUTES.admin.settingsPolicies}/${row.slug}`} className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent">Open</Link>
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
