"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";

import PolicyMarkdown from "@/components/public/PolicyMarkdown";
import PageHeader from "@/components/ui/PageHeader";
import { ApiError } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import {
  archiveAdminPolicy,
  createAdminPolicyDraft,
  getAdminPolicyBySlug,
  publishAdminPolicy,
  updateAdminPolicy,
  type AdminPolicyPage,
} from "@/services/policies";

type Params = Promise<{
  slug: string;
}>;

function readableError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.readableMessage || error.message;
  }
  return error instanceof Error ? error.message : "Request failed.";
}

export default function AdminPolicySlugEditorPage({ params }: { params: Params }) {
  const { slug } = use(params);
  const [policy, setPolicy] = useState<AdminPolicyPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
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
    }
    void load();
  }, [slug]);

  const isPublished = useMemo(() => policy?.status === "PUBLISHED", [policy]);

  async function saveDraft() {
    if (!policy) return;
    try {
      setSaving(true);
      const payload = await updateAdminPolicy(policy.id, {
        title: policy.title,
        summary: policy.summary,
        content: policy.content,
        category: policy.category,
      });
      setPolicy(payload);
      setMessage("Policy draft saved.");
      setError(null);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSaving(false);
    }
  }

  async function publishNow() {
    if (!policy) return;
    try {
      setSaving(true);
      const payload = await publishAdminPolicy(policy.id, {
        review_now: true,
      });
      setPolicy(payload);
      setMessage("Policy published.");
      setError(null);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSaving(false);
    }
  }

  async function archiveNow() {
    if (!policy) return;
    try {
      setSaving(true);
      const payload = await archiveAdminPolicy(policy.id);
      setPolicy(payload);
      setMessage("Policy archived.");
      setError(null);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSaving(false);
    }
  }

  async function createDraftVersion() {
    if (!policy) return;
    try {
      setSaving(true);
      const draft = await createAdminPolicyDraft(policy.id);
      setPolicy(draft);
      setMessage(`New draft created: v${draft.version}.`);
      setError(null);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Policy editor: ${slug}`}
        description="Admin-only legal policy editor with draft/publish/archive lifecycle."
        actions={
          <>
            <Link
              href={ROUTES.admin.settingsPolicies}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-accent"
            >
              Policy list
            </Link>
            <Link
              href={ROUTES.admin.settingsBusinessCompliance}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-accent"
            >
              Business compliance
            </Link>
          </>
        }
      />

      <section className="rounded-2xl border border-amber-300/70 bg-amber-50/90 p-4 text-sm text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-100">
        Legal review warning: publish only after legal/management review. Published text is publicly visible without authentication.
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

      {loading ? (
        <section className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
          Loading policy...
        </section>
      ) : !policy ? (
        <section className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
          No policy found for slug <strong>{slug}</strong>.
          <div className="mt-3">
            <Link href={ROUTES.admin.settingsPolicies} className="text-primary underline">
              Back to policy list
            </Link>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border bg-background px-2.5 py-1">Status: {policy.status}</span>
            <span className="rounded-full border border-border bg-background px-2.5 py-1">Version: {policy.version}</span>
            <span className="rounded-full border border-border bg-background px-2.5 py-1">Category: {policy.category}</span>
            {policy.effective_date ? (
              <span className="rounded-full border border-border bg-background px-2.5 py-1">Effective: {policy.effective_date}</span>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3">
            <input
              value={policy.title}
              onChange={(event) => setPolicy((current) => (current ? { ...current, title: event.target.value } : current))}
              className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
              disabled={isPublished}
            />
            <textarea
              value={policy.summary}
              onChange={(event) => setPolicy((current) => (current ? { ...current, summary: event.target.value } : current))}
              className="min-h-[70px] rounded-xl border border-input bg-background px-3 py-2 text-sm"
              disabled={isPublished}
            />
            <textarea
              value={policy.content}
              onChange={(event) => setPolicy((current) => (current ? { ...current, content: event.target.value } : current))}
              className="min-h-[280px] rounded-xl border border-input bg-background px-3 py-2 font-mono text-xs"
              disabled={isPublished}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveDraft}
              className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-accent disabled:opacity-60"
              disabled={saving || isPublished}
            >
              {saving ? "Working..." : "Save draft"}
            </button>
            <button
              type="button"
              onClick={publishNow}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              disabled={saving}
            >
              {saving ? "Working..." : "Publish"}
            </button>
            <button
              type="button"
              onClick={archiveNow}
              className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-accent disabled:opacity-60"
              disabled={saving}
            >
              {saving ? "Working..." : "Archive"}
            </button>
            <button
              type="button"
              onClick={createDraftVersion}
              className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-accent disabled:opacity-60"
              disabled={saving}
            >
              {saving ? "Working..." : "Create new draft version"}
            </button>
          </div>

          {isPublished ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Published rows are content-locked. Use &quot;Create new draft version&quot; before editing legal text.
            </p>
          ) : null}

          <div className="mt-6 rounded-2xl border border-border bg-background p-4">
            <h3 className="text-sm font-semibold text-foreground">Draft preview</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Preview uses current draft text and placeholder substitutions are applied on public publish endpoints.
            </p>
            <PolicyMarkdown content={policy.content} className="mt-3" />
          </div>
        </section>
      )}
    </div>
  );
}
