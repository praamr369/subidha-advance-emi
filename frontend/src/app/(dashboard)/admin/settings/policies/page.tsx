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
  { key: "ACTION_REQUIRED", label: "Action required" },
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
  { key: "REVIEW_DUE_MISSING", label: "Review due missing" },
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

function readinessLabel(row: AdminPolicyPage | PolicyCoverageRow): string {
  if (row.visibility === "PUBLIC") return row.public_ready ? "Public ready" : "Public launch blocked";
  if (row.visibility === "INTERNAL") return row.internal_ready ? "Internal ready" : "Internal approval pending";
  return "Needs review";
}

function actionRecommendation(row: PolicyCoverageRow): string {
  if (row.status === "MISSING") return "Seed missing template";
  if (row.metadata_synced === false || row.metadata_mismatches?.length) return "Sync governance metadata";
  if (row.visibility === "PUBLIC" && row.status !== "PUBLISHED") return "Review, approve, then publish";
  if (row.visibility === "INTERNAL" && !row.internal_ready) return "Approve or accept internally";
  return row.recommended_action || "No immediate action";
}

function coverageNeedsAction(row: PolicyCoverageRow): boolean {
  if (row.status === "MISSING") return true;
  if (row.metadata_synced === false || Boolean(row.metadata_mismatches?.length)) return true;
  if (row.blocker_reason) return true;
  if (row.visibility === "PUBLIC" && row.status !== "PUBLISHED") return true;
  if (row.visibility === "INTERNAL" && !row.internal_ready) return true;
  return false;
}

function policyNeedsAction(row: AdminPolicyPage): boolean {
  if (row.visibility === "PUBLIC") return row.status !== "PUBLISHED";
  if (row.visibility === "INTERNAL") return !row.internal_ready;
  return row.status === "DRAFT" || row.status === "UNDER_REVIEW";
}

function coverageReviewDueMissing(row: PolicyCoverageRow): boolean {
  return row.status !== "MISSING" && !row.review_due_date;
}

function policyReviewDueMissing(row: AdminPolicyPage): boolean {
  return row.status !== "ARCHIVED" && !row.review_due_date;
}

function rowMatchesSearch(row: PolicyCoverageRow, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    row.label,
    row.slug,
    row.status,
    row.visibility,
    row.category,
    row.stored_category,
    row.coverage_group,
    row.catalog_coverage_group,
    row.blocker_reason,
    row.recommended_action,
    ...(row.metadata_mismatches ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function policyMatchesSearch(row: AdminPolicyPage, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    row.slug,
    row.title,
    row.summary,
    row.status,
    row.visibility,
    row.category,
    row.governance_category,
    row.coverage_group,
    row.source_template_key,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function rowMatchesFilter(row: PolicyCoverageRow, filter: FilterKey): boolean {
  switch (filter) {
    case "ACTION_REQUIRED":
      return coverageNeedsAction(row);
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
    case "REVIEW_DUE_MISSING":
      return coverageReviewDueMissing(row);
    default:
      return true;
  }
}

function policyMatchesFilter(row: AdminPolicyPage, filter: FilterKey): boolean {
  switch (filter) {
    case "ACTION_REQUIRED":
      return policyNeedsAction(row);
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
    case "REVIEW_DUE_MISSING":
      return policyReviewDueMissing(row);
    case "METADATA_MISMATCH":
    case "MISSING":
      return false;
    default:
      return true;
  }
}

function SummaryCard({ label, value, tone = "slate", detail }: { label: string; value: number | string; tone?: "green" | "amber" | "red" | "blue" | "slate" | "purple"; detail?: string }) {
  const toneClass = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    red: "border-red-200 bg-red-50 text-red-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    purple: "border-purple-200 bg-purple-50 text-purple-900",
    slate: "border-border bg-background text-foreground",
  }[tone];
  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {detail ? <div className="mt-1 text-xs opacity-80">{detail}</div> : null}
    </div>
  );
}

export default function AdminPoliciesSettingsPage() {
  const [rows, setRows] = useState<AdminPolicyPage[]>([]);
  const [coverage, setCoverage] = useState<PolicyCoverageMatrix | null>(null);
  const [filter, setFilter] = useState<FilterKey>("ACTION_REQUIRED");
  const [search, setSearch] = useState("");
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

  const coverageRows = coverage?.results ?? [];
  const actionRequiredCoverage = useMemo(() => coverageRows.filter(coverageNeedsAction), [coverageRows]);
  const reviewDueCoverage = useMemo(() => coverageRows.filter(coverageReviewDueMissing), [coverageRows]);
  const actionRequiredPolicies = useMemo(() => rows.filter(policyNeedsAction), [rows]);
  const reviewDuePolicies = useMemo(() => rows.filter(policyReviewDueMissing), [rows]);

  const visiblePolicies = useMemo(
    () => rows.filter((row) => policyMatchesFilter(row, filter) && policyMatchesSearch(row, search)),
    [filter, rows, search],
  );

  const visibleCoverageGroups = useMemo(() => {
    if (!coverage) return [];
    return coverage.groups
      .map((group) => ({ ...group, items: group.items.filter((item) => rowMatchesFilter(item, filter) && rowMatchesSearch(item, search)) }))
      .filter((group) => group.items.length > 0);
  }, [coverage, filter, search]);

  const hasPolicyBlocker = actionRequiredCoverage.length > 0 || actionRequiredPolicies.length > 0;
  const reviewDueMissingCount = Math.max(reviewDueCoverage.length, reviewDuePolicies.length);
  const isDefaultActionView = filter === "ACTION_REQUIRED" && !search.trim();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Policy governance"
        description="Admin-only policy lifecycle control, public/internal separation, metadata health, coverage readiness, publishing, and archival controls. Default view shows only action-required items."
      />

      <section className="rounded-2xl border border-amber-300/70 bg-amber-50/90 p-4 text-sm text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-100">
        Seeded templates remain DRAFT. Public launch requires PUBLISHED + PUBLIC. INTERNAL policies are never shown on public policy pages. Review dates are governance warnings, not customer-facing content.
      </section>

      {message ? <section className="rounded-2xl border border-emerald-300/70 bg-emerald-50/90 p-4 text-sm text-emerald-900 shadow-sm">{message}</section> : null}
      {error ? <section className="rounded-2xl border border-red-300/70 bg-red-50/90 p-4 text-sm text-red-900 shadow-sm">{error}</section> : null}

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Governance cockpit</h2>
            <p className="mt-1 text-sm text-muted-foreground">Lifecycle counts, public/internal readiness, metadata mismatch health, and review-schedule warnings.</p>
          </div>
          <button type="button" onClick={handleSeed} className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-accent disabled:opacity-60" disabled={seeding}>
            {seeding ? "Seeding..." : "Seed default templates"}
          </button>
        </div>

        {coverage ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <SummaryCard label="Policy blockers" value={actionRequiredCoverage.length} tone={actionRequiredCoverage.length ? "red" : "green"} detail="Coverage matrix" />
            <SummaryCard label="Public published" value={`${coverage.summary.public_published_count}/${coverage.summary.public_required_count}`} tone={coverage.summary.public_published_count === coverage.summary.public_required_count ? "green" : "amber"} />
            <SummaryCard label="Internal ready" value={`${coverage.summary.internal_ready_count}/${coverage.summary.internal_required_count}`} tone={coverage.summary.internal_ready_count === coverage.summary.internal_required_count ? "green" : "amber"} />
            <SummaryCard label="Metadata mismatch" value={coverage.summary.metadata_mismatch_count || 0} tone={(coverage.summary.metadata_mismatch_count || 0) ? "red" : "green"} />
            <SummaryCard label="Missing" value={coverage.summary.missing_count} tone={coverage.summary.missing_count ? "red" : "green"} />
            <SummaryCard label="Review dates" value={reviewDueMissingCount} tone={reviewDueMissingCount ? "amber" : "green"} detail="Warning only" />
          </div>
        ) : null}

        {coverage ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Draft" value={lifecycleCounts.DRAFT} tone={lifecycleCounts.DRAFT ? "amber" : "slate"} />
            <SummaryCard label="Under review" value={lifecycleCounts.UNDER_REVIEW} tone={lifecycleCounts.UNDER_REVIEW ? "purple" : "slate"} />
            <SummaryCard label="Approved" value={lifecycleCounts.APPROVED} tone="blue" />
            <SummaryCard label="Published" value={lifecycleCounts.PUBLISHED} tone="green" />
            <SummaryCard label="Archived" value={lifecycleCounts.ARCHIVED} tone="slate" />
          </div>
        ) : null}

        {!loading && coverage ? (
          <div className={`mt-4 rounded-xl border p-4 text-sm ${hasPolicyBlocker ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
            <div className="font-semibold">{hasPolicyBlocker ? "Policy governance needs action" : "Policy governance is operationally ready"}</div>
            <div className="mt-1">
              {hasPolicyBlocker
                ? "Resolve missing, unpublished public, unaccepted internal, or metadata-mismatch rows before relying on public/legal readiness."
                : "All required public policies are published, all internal policies are ready, and no metadata mismatch is exposed."}
            </div>
            {reviewDueMissingCount ? <div className="mt-2 text-amber-900">Warning: {reviewDueMissingCount} policy row(s) do not have a review due date. This is governance hygiene, not a launch blocker.</div> : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {filterOptions.map((option) => (
              <button key={option.key} type="button" onClick={() => setFilter(option.key)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${filter === option.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-accent"}`}>
                {option.label}
              </button>
            ))}
          </div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search slug, title, group, category, readiness" className="min-w-[18rem] rounded-xl border border-input bg-background px-3 py-2 text-sm" />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Policy Coverage Matrix</h2>
        <p className="mt-1 text-sm text-muted-foreground">Default view shows only rows requiring action. Use All when intentionally auditing every catalog policy.</p>

        {loading ? <div className="mt-4 text-sm text-muted-foreground">Loading policy coverage...</div> : null}
        {!loading && visibleCoverageGroups.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            {isDefaultActionView ? "No policy coverage row currently requires operator action." : "No coverage rows match this filter."}
          </div>
        ) : null}
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

      <details className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <summary className="cursor-pointer text-base font-semibold text-foreground">Create policy draft</summary>
        <p className="mt-1 text-sm text-muted-foreground">Use only for new policy slugs. For existing policies, open the policy and create a draft version there.</p>
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
      </details>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Policy registry</h2>
        <p className="mt-1 text-sm text-muted-foreground">Registry follows the same filter/search as the coverage matrix. Open a slug to submit, approve, publish, accept internal, archive, sync metadata, or create a draft version.</p>
        {loading ? <div className="mt-4 text-sm text-muted-foreground">Loading policies...</div> : null}
        {!loading && visiblePolicies.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            {isDefaultActionView ? "No policy registry row currently requires operator action." : "No policy rows match this filter."}
          </div>
        ) : null}
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
