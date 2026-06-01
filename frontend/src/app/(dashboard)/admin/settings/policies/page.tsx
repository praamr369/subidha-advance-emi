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
  { key: "UNDER_REVIEW", label: "Under review" },
  { key: "APPROVED", label: "Approved" },
  { key: "PUBLISHED", label: "Published" },
  { key: "ARCHIVED", label: "Archived" },
  { key: "MISSING", label: "Missing" },
  { key: "METADATA_MISMATCH", label: "Metadata mismatch" },
] as const;

type FilterKey = (typeof filterOptions)[number]["key"];

const initialForm: PolicyCreatePayload = {
  slug: "",
  category: "GENERAL",
  title: "",
  summary: "",
  content: "# ",
  status: "DRAFT",
  visibility: "PUBLIC",
};

function readableError(error: unknown): string {
  if (error instanceof ApiError) return error.readableMessage || error.message;
  return error instanceof Error ? error.message : "Request failed.";
}

function badgeClass(tone: "green" | "amber" | "red" | "blue" | "slate" | "purple") {
  const map = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    purple: "border-purple-200 bg-purple-50 text-purple-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };
  return `inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${map[tone]}`;
}

function lifecycleTone(status: PolicyStatus | "MISSING") {
  if (status === "PUBLISHED") return "green" as const;
  if (status === "APPROVED") return "blue" as const;
  if (status === "UNDER_REVIEW") return "purple" as const;
  if (status === "DRAFT") return "amber" as const;
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
    case "UNDER_REVIEW":
    case "APPROVED":
    case "PUBLISHED":
    case "ARCHIVED":
      return row.status === filter;
    case "MISSING":
      return row.status === "MISSING";
    case "METADATA_MISMATCH":
      return row.metadata_synced === false || Boolean(row.metadata_mismatches?.length);
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
    case "UNDER_REVIEW":
    case "APPROVED":
    case "PUBLISHED":
    case "ARCHIVED":
      return row.status === filter;
    case "METADATA_MISMATCH":
    case "MISSING":
      return false;
    default:
      return true;
  }
}

function readinessLabel(row: AdminPolicyPage | PolicyCoverageRow): string {
  if (row.visibility === "PUBLIC") return row.public_ready ? "Public ready" : "Public launch blocked";
  if (row.visibility === "INTERNAL") return row.internal_ready ? "Internal ready" : "Internal approval pending";
  return "Needs review";
}

function actionRecommendation(row: PolicyCoverageRow): string {
  if (row.status === "MISSING") return "Seed missing template";
  if (row.metadata_synced === false) return "Sync governance metadata";
  if (row.visibility === "PUBLIC" && row.status !== "PUBLISHED") return "Review, approve, then publish";
  if (row.visibility === "INTERNAL" && !row.internal_ready) return "Approve or accept internally";
  return row.recommended_action || "No immediate action";
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
      const [policiesPayload, coveragePayload] = await Promise.all([listAdminPolicies(), getAdminPolicyCoverage()]);
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

  const lifecycleCounts = useMemo(() => {
    const counts: Record<PolicyStatus, number> = { DRAFT: 0, UNDER_REVIEW: 0, APPROVED: 0, PUBLISHED: 0, ARCHIVED: 0 };
    rows.forEach((row) => {
      counts[row.status] = (counts[row.status] || 0) + 1;
    });
    return counts;
  }, [rows]);

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
        description="Admin-only policy lifecycle control, public/internal separation, metadata health, coverage readiness, publishing, and archival controls."
      />

      <section className="rounded-2xl border border-amber-300/70 bg-amber-50/90 p-4 text-sm text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-100">
        Seeded templates remain DRAFT. Public launch requires PUBLISHED + PUBLIC. INTERNAL policies are never shown on public policy pages.
      </section>

      {message ? <section className="rounded-2xl border border-emerald-300/70 bg-emerald-50/90 p-4 text-sm text-emerald-900 shadow-sm">{message}</section> : null}
      {error ? <section className="rounded-2xl border border-red-300/70 bg-red-50/90 p-4 text-sm text-red-900 shadow-sm">{error}</section> : null}

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Governance cockpit</h2>
            <p className="mt-1 text-sm text-muted-foreground">Lifecycle counts, public/internal readiness, and metadata mismatch health.</p>
          </div>
          <button type="button" onClick={handleSeed} className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-accent disabled:opacity-60" disabled={seeding}>
            {seeding ? "Seeding..." : "Seed default templates"}
          </button>
        </div>

        {coverage ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-border bg-background p-3"><div className="text-xs font-semibold uppercase text-muted-foreground">Draft</div><div className="mt-1 text-2xl font-semibold text-foreground">{lifecycleCounts.DRAFT}</div></div>
            <div className="rounded-xl border border-border bg-background p-3"><div className="text-xs font-semibold uppercase text-muted-foreground">Under review</div><div className="mt-1 text-2xl font-semibold text-foreground">{lifecycleCounts.UNDER_REVIEW}</div></div>
            <div className="rounded-xl border border-border bg-background p-3"><div className="text-xs font-semibold uppercase text-muted-foreground">Approved</div><div className="mt-1 text-2xl font-semibold text-foreground">{lifecycleCounts.APPROVED}</div></div>
            <div className="rounded-xl border border-border bg-background p-3"><div className="text-xs font-semibold uppercase text-muted-foreground">Published</div><div className="mt-1 text-2xl font-semibold text-foreground">{lifecycleCounts.PUBLISHED}</div></div>
            <div className="rounded-xl border border-border bg-background p-3"><div className="text-xs font-semibold uppercase text-muted-foreground">Archived</div><div className="mt-1 text-2xl font-semibold text-foreground">{lifecycleCounts.ARCHIVED}</div></div>
          </div>
        ) : null}

        {coverage ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border bg-background p-3"><div className="text-xs font-semibold uppercase text-muted-foreground">Public published</div><div className="mt-1 text-2xl font-semibold text-foreground">{coverage.summary.public_published_count}/{coverage.summary.public_required_count}</div></div>
            <div className="rounded-xl border border-border bg-background p-3"><div className="text-xs font-semibold uppercase text-muted-foreground">Internal ready</div><div className="mt-1 text-2xl font-semibold text-foreground">{coverage.summary.internal_ready_count}/{coverage.summary.internal_required_count}</div></div>
            <div className="rounded-xl border border-border bg-background p-3"><div className="text-xs font-semibold uppercase text-muted-foreground">Missing</div><div className="mt-1 text-2xl font-semibold text-foreground">{coverage.summary.missing_count}</div></div>
            <div className="rounded-xl border border-border bg-background p-3"><div className="text-xs font-semibold uppercase text-muted-foreground">Metadata mismatch</div><div className="mt-1 text-2xl font-semibold text-foreground">{coverage.summary.metadata_mismatch_count || 0}</div></div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {filterOptions.map((option) => (
            <button key={option.key} type="button" onClick={() => setFilter(option.key)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${filter === option.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-accent"}`}>
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Policy Coverage Matrix</h2>
        <p className="mt-1 text-sm text-muted-foreground">Each row compares stored governance metadata against the catalog. Dangerous visibility mismatches must be synced before readiness.</p>

        {loading ? <div className="mt-4 text-sm text-muted-foreground">Loading policy coverage...</div> : null}
        {!loading && visibleCoverageGroups.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No coverage rows match this filter.</div> : null}
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
                        <div className="mt-1 text-xs text-muted-foreground">{item.slug} · stored {item.stored_category || item.category} · catalog {item.category}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className={badgeClass(visibilityTone(item.visibility))}>Stored {item.visibility}</span>
                        <span className={badgeClass(visibilityTone(item.catalog_visibility || item.visibility))}>Catalog {item.catalog_visibility || item.visibility}</span>
                        <span className={badgeClass(lifecycleTone(item.status))}>{item.status}</span>
                        <span className={badgeClass(item.metadata_synced === false ? "red" : "green")}>{item.metadata_synced === false ? "Metadata mismatch" : "Metadata synced"}</span>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                      <div>Readiness: {readinessLabel(item)}</div>
                      <div>Action: {actionRecommendation(item)}</div>
                      <div>Coverage group: {item.coverage_group}</div>
                      <div>Review due: {item.review_due_date || "Not set"}</div>
                    </div>
                    {item.metadata_mismatches?.length ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">Mismatches: {item.metadata_mismatches.join(", ")}</div> : null}
                    {item.blocker_reason ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><div className="font-semibold">Blocker</div><div className="mt-1">{item.blocker_reason}</div><div className="mt-1">{item.recommended_action}</div></div> : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.policy_id ? <Link href={`${ROUTES.admin.settingsPolicies}/${item.slug}`} className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent">Open policy</Link> : <button type="button" onClick={handleSeed} disabled={seeding} className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent disabled:opacity-60">{seeding ? "Seeding..." : "Seed missing template"}</button>}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Create policy draft</h2>
        <form className="mt-4 grid gap-3" onSubmit={handleCreate}>
          <div className="grid gap-3 md:grid-cols-2">
            <input value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value.trim().toLowerCase() }))} placeholder="slug (example: terms)" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" required />
            <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Policy title" className="rounded-xl border border-input bg-background px-3 py-2 text-sm" required />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className="rounded-xl border border-input bg-background px-3 py-2 text-sm">
              {categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <select value={form.visibility || "PUBLIC"} onChange={(event) => setForm((current) => ({ ...current, visibility: event.target.value as PolicyVisibility }))} className="rounded-xl border border-input bg-background px-3 py-2 text-sm">
              <option value="PUBLIC">PUBLIC</option>
              <option value="INTERNAL">INTERNAL</option>
            </select>
          </div>
          <textarea value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} placeholder="Policy summary" className="min-h-[70px] rounded-xl border border-input bg-background px-3 py-2 text-sm" />
          <textarea value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} placeholder="Markdown content" className="min-h-[180px] rounded-xl border border-input bg-background px-3 py-2 text-sm" required />
          <div><button type="submit" disabled={creating} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">{creating ? "Creating..." : "Create draft"}</button></div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Policy registry</h2>
        <p className="mt-1 text-sm text-muted-foreground">Manage versions and lifecycle. Open a slug to submit, approve, publish, accept internal, archive, sync metadata, or create a draft version.</p>
        {loading ? <div className="mt-4 text-sm text-muted-foreground">Loading policies...</div> : null}
        {!loading && visiblePolicies.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No policy rows match this filter.</div> : null}
        {visiblePolicies.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs uppercase tracking-[0.12em] text-muted-foreground"><th className="px-3 py-2">Slug</th><th className="px-3 py-2">Visibility</th><th className="px-3 py-2">Lifecycle</th><th className="px-3 py-2">Governance</th><th className="px-3 py-2">Readiness</th><th className="px-3 py-2">Review due</th><th className="px-3 py-2">Updated</th><th className="px-3 py-2">Action</th></tr></thead>
              <tbody>
                {visiblePolicies.map((row) => (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className="px-3 py-2 font-medium text-foreground">{row.slug}<div className="text-xs text-muted-foreground">v{row.version}</div></td>
                    <td className="px-3 py-2"><span className={badgeClass(visibilityTone(row.visibility))}>{row.visibility || "PUBLIC"}</span></td>
                    <td className="px-3 py-2"><span className={badgeClass(lifecycleTone(row.status))}>{row.status}</span></td>
                    <td className="px-3 py-2 text-muted-foreground">{row.governance_category || row.category}<div className="text-xs">{row.coverage_group || "Public Legal"}</div></td>
                    <td className="px-3 py-2 text-muted-foreground">{readinessLabel(row)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.review_due_date || "Not set"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.updated_at ? new Date(row.updated_at).toLocaleString() : "-"}</td>
                    <td className="px-3 py-2"><Link href={`${ROUTES.admin.settingsPolicies}/${row.slug}`} className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent">Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
