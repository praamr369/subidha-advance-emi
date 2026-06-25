"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";

import PolicyMarkdown from "@/components/public/PolicyMarkdown";
import PageHeader from "@/components/ui/PageHeader";
import { ApiError } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import {
  acceptInternalPolicy,
  approveAdminPolicy,
  archiveAdminPolicy,
  createAdminPolicyDraft,
  getAdminPolicyBySlug,
  publishAdminPolicy,
  rejectAdminPolicy,
  submitAdminPolicyForReview,
  syncPolicyGovernanceMetadata,
  updateAdminPolicy,
  type AdminPolicyPage,
} from "@/services/policies";

type Params = Promise<{ slug: string }>;

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

function lifecycleTone(status?: string) {
  if (status === "PUBLISHED") return "green" as const;
  if (status === "APPROVED") return "blue" as const;
  if (status === "UNDER_REVIEW") return "purple" as const;
  if (status === "DRAFT") return "amber" as const;
  if (status === "ARCHIVED") return "slate" as const;
  return "red" as const;
}

function visibilityTone(visibility?: string) {
  return visibility === "INTERNAL" ? "blue" : "green";
}

function readinessText(policy: AdminPolicyPage): string {
  if (policy.visibility === "INTERNAL") return policy.internal_ready ? "Internal governance ready" : "Internal approval pending";
  return policy.public_ready ? "Public policy live" : "Public launch blocked until published";
}

export default function AdminPolicySlugEditorPage({ params }: { params: Params }) {
  const { slug } = use(params);
  const [policy, setPolicy] = useState<AdminPolicyPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [archiveReason, setArchiveReason] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const payload = await getAdminPolicyBySlug(slug);
      setPolicy(payload);
      setError(null);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const isContentLocked = useMemo(() => policy?.status === "PUBLISHED" || policy?.status === "APPROVED" || policy?.status === "ARCHIVED", [policy]);
  const actions = policy?.lifecycle_actions;
  const isInternal = policy?.visibility === "INTERNAL";

  async function runAction(label: string, action: () => Promise<AdminPolicyPage>) {
    try {
      setSaving(true);
      const payload = await action();
      setPolicy(payload);
      setMessage(label);
      setError(null);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    if (!policy) return;
    await runAction("Policy draft saved.", () =>
      updateAdminPolicy(policy.id, {
        title: policy.title,
        summary: policy.summary,
        content: policy.content,
        category: policy.category,
        governance_category: policy.governance_category,
        coverage_group: policy.coverage_group,
        requires_legal_review: policy.requires_legal_review,
        requires_admin_acceptance: policy.requires_admin_acceptance,
        review_due_date: policy.review_due_date,
      }),
    );
  }

  async function submitForReview() {
    if (!policy) return;
    await runAction("Policy submitted for review.", () => submitAdminPolicyForReview(policy.id));
  }

  async function approvePolicy() {
    if (!policy) return;
    await runAction("Policy approved.", () => approveAdminPolicy(policy.id));
  }

  async function rejectPolicy() {
    if (!policy) return;
    await runAction("Policy rejected and returned to draft.", () => rejectAdminPolicy(policy.id, rejectReason));
    setRejectReason("");
  }

  async function acceptInternal() {
    if (!policy) return;
    await runAction("Internal policy accepted. It remains excluded from public policy pages.", () => acceptInternalPolicy(policy.id));
  }

  async function syncMetadata() {
    if (!policy) return;
    await runAction("Governance metadata synced from catalog.", () => syncPolicyGovernanceMetadata(policy.id));
  }

  async function publishNow() {
    if (!policy) return;
    await runAction("Public policy published.", () => publishAdminPolicy(policy.id, { review_now: true }));
  }

  async function archiveNow() {
    if (!policy) return;
    await runAction("Policy archived.", () => archiveAdminPolicy(policy.id, archiveReason));
    setArchiveReason("");
  }

  async function createDraftVersion() {
    if (!policy) return;
    await runAction("New draft version created.", () => createAdminPolicyDraft(policy.id));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Policy editor: ${slug}`}
        description="Admin-only policy editor with lifecycle review, stored governance metadata, public/internal separation, and content locking."
        actions={
          <>
            <Link href={ROUTES.admin.settingsPolicies} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-accent">Policy list</Link>
            <Link href={ROUTES.admin.settingsBusinessCompliance} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-accent">Business compliance</Link>
          </>
        }
      />

      <section className="rounded-xl border border-amber-300/70 bg-amber-50/90 p-4 text-sm text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-100">
        Public policies become customer-visible only after PUBLISHED. Internal policies must use Accept internal policy and are never public.
      </section>

      {message ? <section className="rounded-xl border border-emerald-300/70 bg-emerald-50/90 p-4 text-sm text-emerald-900 shadow-sm">{message}</section> : null}
      {error ? <section className="rounded-xl border border-red-300/70 bg-red-50/90 p-4 text-sm text-red-900 shadow-sm">{error}</section> : null}

      {loading ? (
        <section className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">Loading policy...</section>
      ) : !policy ? (
        <section className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
          No policy found for slug <strong>{slug}</strong>.
          <div className="mt-3"><Link href={ROUTES.admin.settingsPolicies} className="text-primary underline">Back to policy list</Link></div>
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className={badgeClass(lifecycleTone(policy.status))}>Lifecycle: {policy.status}</span>
              <span className={badgeClass(visibilityTone(policy.visibility))}>Visibility: {policy.visibility || "PUBLIC"}</span>
              <span className={badgeClass(policy.public_ready || policy.internal_ready ? "green" : "amber")}>{readinessText(policy)}</span>
              <span className="rounded-full border border-border bg-background px-2.5 py-1">Version: {policy.version}</span>
              <span className="rounded-full border border-border bg-background px-2.5 py-1">Category: {policy.category}</span>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-border bg-background p-4">
                <h2 className="text-sm font-semibold text-foreground">Governance metadata</h2>
                <dl className="mt-3 space-y-2 text-xs text-muted-foreground">
                  <div><dt className="font-semibold text-foreground">Governance category</dt><dd>{policy.governance_category || policy.category}</dd></div>
                  <div><dt className="font-semibold text-foreground">Coverage group</dt><dd>{policy.coverage_group || "Public Legal"}</dd></div>
                  <div><dt className="font-semibold text-foreground">Requires legal review</dt><dd>{policy.requires_legal_review ? "Yes" : "No"}</dd></div>
                  <div><dt className="font-semibold text-foreground">Requires admin acceptance</dt><dd>{policy.requires_admin_acceptance ? "Yes" : "No"}</dd></div>
                  <div><dt className="font-semibold text-foreground">Source template</dt><dd>{policy.source_template_key || "Custom"}</dd></div>
                </dl>
              </div>

              <div className="rounded-xl border border-border bg-background p-4">
                <h2 className="text-sm font-semibold text-foreground">Review trail</h2>
                <dl className="mt-3 space-y-2 text-xs text-muted-foreground">
                  <div><dt className="font-semibold text-foreground">Reviewer</dt><dd>{policy.reviewer_username || "Not assigned"}</dd></div>
                  <div><dt className="font-semibold text-foreground">Submitted</dt><dd>{policy.submitted_for_review_at || "Not submitted"}</dd></div>
                  <div><dt className="font-semibold text-foreground">Approved by</dt><dd>{policy.approved_by_username || "Not approved"}</dd></div>
                  <div><dt className="font-semibold text-foreground">Approved at</dt><dd>{policy.approved_at || "Not approved"}</dd></div>
                  <div><dt className="font-semibold text-foreground">Review due</dt><dd>{policy.review_due_date || "Not set"}</dd></div>
                </dl>
              </div>

              <div className="rounded-xl border border-border bg-background p-4">
                <h2 className="text-sm font-semibold text-foreground">Publication / internal state</h2>
                <dl className="mt-3 space-y-2 text-xs text-muted-foreground">
                  <div><dt className="font-semibold text-foreground">Published by</dt><dd>{policy.published_by_username || "Not published"}</dd></div>
                  <div><dt className="font-semibold text-foreground">Published at</dt><dd>{policy.published_at || "Not published"}</dd></div>
                  <div><dt className="font-semibold text-foreground">Internal accepted by</dt><dd>{policy.internal_accepted_by_username || "Not accepted"}</dd></div>
                  <div><dt className="font-semibold text-foreground">Internal accepted at</dt><dd>{policy.internal_acceptance_at || "Not accepted"}</dd></div>
                  <div><dt className="font-semibold text-foreground">Archived</dt><dd>{policy.archived_at || "Not archived"}</dd></div>
                </dl>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">Policy text</h2>
            <div className="mt-4 grid gap-3">
              <input value={policy.title} onChange={(event) => setPolicy((current) => (current ? { ...current, title: event.target.value } : current))} className="rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={isContentLocked} />
              <textarea value={policy.summary} onChange={(event) => setPolicy((current) => (current ? { ...current, summary: event.target.value } : current))} className="min-h-[70px] rounded-xl border border-input bg-background px-3 py-2 text-sm" disabled={isContentLocked} />
              <textarea value={policy.content} onChange={(event) => setPolicy((current) => (current ? { ...current, content: event.target.value } : current))} className="min-h-[280px] rounded-xl border border-input bg-background px-3 py-2 font-mono text-xs" disabled={isContentLocked} />
            </div>
            {isContentLocked ? <p className="mt-3 text-xs text-muted-foreground">Approved, published, and archived rows are content-locked. Create a new draft version before editing legal text.</p> : null}
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">Lifecycle actions</h2>
            <p className="mt-1 text-sm text-muted-foreground">Actions are enabled only when the backend lifecycle contract allows them.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={saveDraft} className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-accent disabled:opacity-60" disabled={saving || isContentLocked || actions?.can_edit === false}>{saving ? "Working..." : "Save draft"}</button>
              <button type="button" onClick={submitForReview} className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-accent disabled:opacity-60" disabled={saving || !actions?.can_submit_review}>Submit for review</button>
              <button type="button" onClick={approvePolicy} className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-accent disabled:opacity-60" disabled={saving || !actions?.can_approve}>Approve</button>
              {!isInternal ? <button type="button" onClick={publishNow} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60" disabled={saving || !actions?.can_publish}>Publish</button> : null}
              {isInternal ? <button type="button" onClick={acceptInternal} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60" disabled={saving || !actions?.can_accept_internal}>Accept internal policy</button> : null}
              <button type="button" onClick={syncMetadata} className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-accent disabled:opacity-60" disabled={saving || !actions?.can_sync_metadata}>Sync governance metadata</button>
              <button type="button" onClick={createDraftVersion} className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-accent disabled:opacity-60" disabled={saving || !actions?.can_create_draft}>Create new draft version</button>
            </div>

            {actions?.can_reject ? (
              <div className="mt-4 rounded-xl border border-border bg-background p-4">
                <label className="text-xs font-semibold uppercase text-muted-foreground" htmlFor="reject-reason">Reject reason</label>
                <div className="mt-2 flex flex-col gap-2 md:flex-row">
                  <input id="reject-reason" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Required reason before rejecting" className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm" />
                  <button type="button" onClick={rejectPolicy} className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 transition hover:bg-red-100 disabled:opacity-60" disabled={saving || rejectReason.trim().length === 0}>Reject with reason</button>
                </div>
              </div>
            ) : null}

            {actions?.can_archive ? (
              <div className="mt-4 rounded-xl border border-border bg-background p-4">
                <label className="text-xs font-semibold uppercase text-muted-foreground" htmlFor="archive-reason">Archive reason</label>
                <div className="mt-2 flex flex-col gap-2 md:flex-row">
                  <input id="archive-reason" value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} placeholder="Reason is stored for audit" className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm" />
                  <button type="button" onClick={archiveNow} className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-accent disabled:opacity-60" disabled={saving}>Archive with reason</button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground">Draft preview</h3>
            <p className="mt-1 text-xs text-muted-foreground">Preview uses current draft text. Public output remains controlled by PUBLISHED + PUBLIC only.</p>
            <PolicyMarkdown content={policy.content} className="mt-3" />
          </section>
        </>
      )}
    </div>
  );
}
