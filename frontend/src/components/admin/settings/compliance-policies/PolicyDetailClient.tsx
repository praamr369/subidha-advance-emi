"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  History,
  Lock,
  Pencil,
  RefreshCw,
  Shield,
  Zap,
} from "lucide-react";
import Link from "next/link";

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
  type PolicyStatus,
  type PolicyUpdatePayload,
} from "@/services/policies";

// ─── Types ────────────────────────────────────────────────────────────────────

type ContentTab = "edit" | "preview";

// ─── Constants ────────────────────────────────────────────────────────────────

const TOKENS: { token: string; description: string }[] = [
  { token: "[BUSINESS_NAME]",    description: "Trade / brand name" },
  { token: "[BUSINESS_PHONE]",   description: "Primary phone" },
  { token: "[BUSINESS_EMAIL]",   description: "Primary email" },
  { token: "[WEBSITE_URL]",      description: "Website URL" },
  { token: "[BUSINESS_ADDRESS]", description: "Full postal address" },
  { token: "[BUSINESS_OWNER]",   description: "Authorized signatory" },
  { token: "[GSTIN]",            description: "GST number" },
  { token: "[PAN_NUMBER]",       description: "PAN number" },
  { token: "[CITY]",             description: "City" },
  { token: "[STATE]",            description: "State" },
  { token: "[UDYAM_NUMBER]",     description: "Udyam / MSME number" },
];

const ALL_TOKENS = TOKENS.map((t) => t.token);

const STATUS_CONFIG: Record<PolicyStatus, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  DRAFT:        { label: "Draft",        color: "text-amber-800",       bg: "bg-amber-50",     border: "border-amber-200",  icon: <Pencil className="h-3 w-3" /> },
  UNDER_REVIEW: { label: "Under Review", color: "text-purple-800",      bg: "bg-purple-50",    border: "border-purple-200", icon: <Clock className="h-3 w-3" /> },
  APPROVED:     { label: "Approved",     color: "text-blue-800",        bg: "bg-blue-50",      border: "border-blue-200",   icon: <CheckCircle2 className="h-3 w-3" /> },
  PUBLISHED:    { label: "Published",    color: "text-emerald-800",     bg: "bg-emerald-50",   border: "border-emerald-200",icon: <Shield className="h-3 w-3" /> },
  ARCHIVED:     { label: "Archived",     color: "text-muted-foreground",bg: "bg-muted/50",     border: "border-border",     icon: <History className="h-3 w-3" /> },
};

const LIFECYCLE_STEPS: { status: PolicyStatus; label: string }[] = [
  { status: "DRAFT",        label: "Draft" },
  { status: "UNDER_REVIEW", label: "Review" },
  { status: "APPROVED",     label: "Approved" },
  { status: "PUBLISHED",    label: "Live" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readableError(error: unknown): string {
  if (error instanceof ApiError) return error.readableMessage || error.message;
  return error instanceof Error ? error.message : "Request failed.";
}

function detectUnknownTokens(text: string): string[] {
  const found = text.match(/\[[A-Z_]+\]/g) ?? [];
  return [...new Set(found.filter((t) => !ALL_TOKENS.includes(t)))];
}

function countTokenUsage(text: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { token } of TOKENS) {
    const matches = text.split(token).length - 1;
    if (matches > 0) counts[token] = matches;
  }
  return counts;
}

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PolicyStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function LifecycleTrack({ status }: { status: PolicyStatus }) {
  const steps = LIFECYCLE_STEPS;
  const currentIdx = steps.findIndex((s) => s.status === status);
  const isArchived = status === "ARCHIVED";

  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => {
        const done = currentIdx > i || (currentIdx === i && !isArchived);
        const active = currentIdx === i && !isArchived;
        return (
          <div key={step.status} className="flex items-center">
            <div className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold transition ${
              active   ? "border-primary bg-primary text-primary-foreground" :
              done     ? "border-emerald-400 bg-emerald-50 text-emerald-700" :
                         "border-border bg-muted/40 text-muted-foreground"
            }`}>
              {done && !active ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
            </div>
            <span className={`ml-1 text-[10px] font-medium ${active ? "text-primary" : done ? "text-emerald-700" : "text-muted-foreground"}`}>
              {step.label}
            </span>
            {i < steps.length - 1 && (
              <ChevronRight className="mx-1 h-3 w-3 text-muted-foreground/40" />
            )}
          </div>
        );
      })}
      {isArchived && (
        <div className="ml-2 flex items-center gap-1 text-[10px] text-muted-foreground">
          <ChevronRight className="h-3 w-3 opacity-40" />
          <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 font-semibold">Archived</span>
        </div>
      )}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value?: string | number | boolean | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-border/40 last:border-0">
      <dt className="text-xs text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-xs font-medium text-foreground text-right break-all">{String(value)}</dd>
    </div>
  );
}

function TokenChip({ token, description, onClick }: { token: string; description: string; onClick: () => void }) {
  const [copied, setCopied] = useState(false);
  function handleClick() {
    onClick();
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      title={description}
      className={`group relative rounded-md border px-2 py-1 font-mono text-[11px] font-semibold transition ${
        copied
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50/80 text-amber-800 hover:border-amber-400 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
      }`}
    >
      {copied ? "✓ Inserted" : token}
      <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] text-background opacity-0 transition group-hover:opacity-100">
        {description}
      </span>
    </button>
  );
}

/** Renders markdown using marked with scoped prose styles */
function MarkdownRenderer({ text }: { text: string }) {
  const html = useMemo(() => {
    if (!text?.trim()) return "";
    marked.setOptions({ gfm: true, breaks: true });
    return marked.parse(text) as string;
  }, [text]);

  if (!html) return <p className="text-sm italic text-muted-foreground">No content.</p>;

  return (
    <>
      <style>{`
        .policy-prose h1 { font-size: 1.35rem; font-weight: 700; margin: 0 0 1rem; line-height: 1.3; color: var(--foreground); }
        .policy-prose h2 { font-size: 1.05rem; font-weight: 600; margin: 1.5rem 0 0.5rem; color: var(--foreground); border-bottom: 1px solid var(--border); padding-bottom: 0.3rem; }
        .policy-prose h3 { font-size: 0.9rem; font-weight: 600; margin: 1.25rem 0 0.4rem; color: var(--foreground); }
        .policy-prose p  { font-size: 0.875rem; line-height: 1.7; margin: 0.6rem 0; color: var(--foreground); }
        .policy-prose ul, .policy-prose ol { margin: 0.5rem 0 0.5rem 1.25rem; }
        .policy-prose li { font-size: 0.875rem; line-height: 1.65; margin: 0.2rem 0; color: var(--foreground); }
        .policy-prose ul li { list-style-type: disc; }
        .policy-prose ol li { list-style-type: decimal; }
        .policy-prose strong { font-weight: 600; }
        .policy-prose em { font-style: italic; }
        .policy-prose code { font-family: monospace; font-size: 0.78rem; background: var(--muted); border-radius: 4px; padding: 0.1em 0.35em; }
        .policy-prose pre  { background: var(--muted); border-radius: 8px; padding: 0.75rem 1rem; overflow-x: auto; margin: 0.75rem 0; }
        .policy-prose pre code { background: transparent; padding: 0; }
        .policy-prose blockquote { border-left: 3px solid var(--border); margin: 0.75rem 0; padding: 0.25rem 0 0.25rem 1rem; color: var(--muted-foreground); font-style: italic; }
        .policy-prose hr { border: none; border-top: 1px solid var(--border); margin: 1.25rem 0; }
        .policy-prose a  { color: var(--primary); text-decoration: underline; }
        .policy-prose table { width: 100%; border-collapse: collapse; font-size: 0.8rem; margin: 0.75rem 0; }
        .policy-prose th  { background: var(--muted); font-weight: 600; text-align: left; padding: 0.4rem 0.6rem; border: 1px solid var(--border); }
        .policy-prose td  { padding: 0.35rem 0.6rem; border: 1px solid var(--border); vertical-align: top; }
        .policy-prose tr:nth-child(even) td { background: color-mix(in srgb, var(--muted) 40%, transparent); }
      `}</style>
      <div
        className="policy-prose"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PolicyDetailClient({ slug }: { slug: string }) {
  const [policy, setPolicy] = useState<AdminPolicyPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editContent, setEditContent] = useState("");
  const [dirty, setDirty] = useState(false);

  const [rejectReason, setRejectReason] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showArchiveForm, setShowArchiveForm] = useState(false);

  const [contentTab, setContentTab] = useState<ContentTab>("edit");
  const [showMetaExpanded, setShowMetaExpanded] = useState(false);

  const contentRef = useRef<HTMLTextAreaElement>(null);

  function applyPolicy(data: AdminPolicyPage) {
    setPolicy(data);
    setEditTitle(data.raw_title ?? data.title);
    setEditSummary(data.raw_summary ?? data.summary);
    setEditContent(data.raw_content ?? data.content);
    setDirty(false);
  }

  async function loadPolicy() {
    try {
      setLoading(true);
      setError(null);
      const data = await getAdminPolicyBySlug(slug);
      if (!data) { setError(`No policy found for slug "${slug}".`); return; }
      applyPolicy(data);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadPolicy(); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  function markDirty() { setDirty(true); setMessage(null); }

  /** Insert token at cursor position in the content textarea */
  const insertToken = useCallback((token: string) => {
    const el = contentRef.current;
    if (!el) return;
    const start = el.selectionStart ?? editContent.length;
    const end = el.selectionEnd ?? editContent.length;
    const next = editContent.slice(0, start) + token + editContent.slice(end);
    setEditContent(next);
    markDirty();
    // Restore cursor after token
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }, [editContent]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!policy) return;
    try {
      setSaving(true);
      setError(null);
      const payload: PolicyUpdatePayload = { title: editTitle, summary: editSummary, content: editContent };
      const updated = await updateAdminPolicy(policy.id, payload);
      applyPolicy(updated);
      setMessage("Policy saved successfully.");
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSaving(false);
    }
  }

  async function runAction(label: string, fn: () => Promise<AdminPolicyPage>) {
    try {
      setActionBusy(label);
      setError(null);
      setMessage(null);
      const updated = await fn();
      applyPolicy(updated);
      setMessage(`${label} complete. Status: ${updated.status}.`);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setActionBusy(null);
    }
  }

  if (loading) return <div className="py-20 text-center text-sm text-muted-foreground">Loading policy…</div>;

  if (!policy) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-900">
        {error ?? "Policy not found."}
        <div className="mt-3">
          <Link href={ROUTES.admin.settingsCompliancePolicies} className="font-semibold underline">← Back to compliance policies</Link>
        </div>
      </div>
    );
  }

  const actions = policy.lifecycle_actions;
  const canEdit = actions?.can_edit ?? false;
  const isPublished = policy.status === "PUBLISHED";
  const isArchived = policy.status === "ARCHIVED";
  const isLocked = isPublished || isArchived;

  const unknownTokens = detectUnknownTokens(editContent);
  const tokenUsage = countTokenUsage(editContent);
  const usedTokenCount = Object.keys(tokenUsage).length;

  return (
    <div className="space-y-5">

      {/* ── Header bar ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Link href={ROUTES.admin.settingsCompliancePolicies}
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition">
            <ArrowLeft className="h-3.5 w-3.5" /> Compliance policies
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={policy.status} />
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
              <FileText className="h-3 w-3" /> v{policy.version}
            </span>
            {policy.visibility === "INTERNAL" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                <Lock className="h-3 w-3" /> Internal only
              </span>
            )}
            {isPublished && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                <Zap className="h-3 w-3" /> Live
              </span>
            )}
          </div>
          <LifecycleTrack status={policy.status} />
        </div>

        {/* Quick stats */}
        <div className="flex gap-3">
          <div className="rounded-xl border border-border bg-card px-4 py-2 text-center">
            <div className="text-lg font-bold text-foreground">{usedTokenCount}</div>
            <div className="text-[10px] text-muted-foreground">Tokens used</div>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-2 text-center">
            <div className="text-lg font-bold text-foreground">{editContent.split("\n").length}</div>
            <div className="text-[10px] text-muted-foreground">Lines</div>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-2 text-center">
            <div className={`text-lg font-bold ${unknownTokens.length > 0 ? "text-red-600" : "text-foreground"}`}>{unknownTokens.length}</div>
            <div className="text-[10px] text-muted-foreground">Unknown tokens</div>
          </div>
        </div>
      </div>

      {/* ── Alerts ── */}
      {message && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {message}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {unknownTokens.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <span className="font-semibold">Unknown tokens detected — will not be resolved:</span>{" "}
            {unknownTokens.map((t) => <code key={t} className="ml-1 rounded bg-orange-100 px-1 font-mono text-xs">{t}</code>)}
          </div>
        </div>
      )}
      {isLocked && (
        <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <Lock className="h-4 w-4 shrink-0" />
          {isPublished
            ? "This policy is PUBLISHED and locked. Create a new draft to make changes."
            : "This policy is ARCHIVED. Create a draft to restore it."}
        </div>
      )}

      {/* ── Lifecycle action bar ── */}
      {actions && (
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lifecycle actions</h2>
          <div className="flex flex-wrap gap-2">
            {actions.can_submit_review && (
              <button type="button" disabled={!!actionBusy} onClick={() => runAction("Submit for review", () => submitAdminPolicyForReview(policy.id))}
                className="rounded-xl border border-purple-300 bg-purple-50 px-4 py-2 text-sm font-semibold text-purple-900 hover:bg-purple-100 disabled:opacity-60 transition">
                {actionBusy === "Submit for review" ? "Submitting…" : "Submit for review"}
              </button>
            )}
            {actions.can_approve && (
              <button type="button" disabled={!!actionBusy} onClick={() => runAction("Approve", () => approveAdminPolicy(policy.id))}
                className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-100 disabled:opacity-60 transition">
                {actionBusy === "Approve" ? "Approving…" : "Approve"}
              </button>
            )}
            {actions.can_reject && (
              <button type="button" onClick={() => setShowRejectForm((v) => !v)}
                className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-900 hover:bg-red-100 transition">
                Reject
              </button>
            )}
            {actions.can_publish && (
              <button type="button" disabled={!!actionBusy} onClick={() => runAction("Publish", () => publishAdminPolicy(policy.id))}
                className="rounded-xl border border-emerald-400 bg-emerald-500 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-60 transition shadow-sm">
                {actionBusy === "Publish" ? "Publishing…" : "🚀 Publish live"}
              </button>
            )}
            {actions.can_accept_internal && (
              <button type="button" disabled={!!actionBusy} onClick={() => runAction("Accept internal", () => acceptInternalPolicy(policy.id))}
                className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-60 transition">
                {actionBusy === "Accept internal" ? "Accepting…" : "Accept internal"}
              </button>
            )}
            {actions.can_archive && (
              <button type="button" onClick={() => setShowArchiveForm((v) => !v)}
                className="rounded-xl border border-border bg-background px-4 py-2 text-sm text-muted-foreground hover:bg-accent transition">
                Archive
              </button>
            )}
            {actions.can_create_draft && (
              <button type="button" disabled={!!actionBusy} onClick={() => runAction("Create draft", () => createAdminPolicyDraft(policy.id))}
                className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60 transition">
                {actionBusy === "Create draft" ? "Creating…" : "Create new draft"}
              </button>
            )}
            <button type="button" disabled={!!actionBusy} onClick={() => runAction("Sync metadata", () => syncPolicyGovernanceMetadata(policy.id))}
              className="rounded-xl border border-border bg-background px-4 py-2 text-sm text-muted-foreground hover:bg-accent disabled:opacity-60 transition">
              <RefreshCw className="mr-1.5 inline h-3.5 w-3.5" />
              {actionBusy === "Sync metadata" ? "Syncing…" : "Sync metadata"}
            </button>
          </div>

          {/* Inline forms */}
          {showRejectForm && actions.can_reject && (
            <div className="mt-4 flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50/50 p-4">
              <p className="text-xs font-semibold text-red-900">Rejection reason (required)</p>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain what needs to be corrected…"
                className="min-h-[80px] rounded-xl border border-red-200 bg-white px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <button type="button" disabled={!rejectReason.trim() || !!actionBusy}
                  onClick={() => { void runAction("Reject", () => rejectAdminPolicy(policy.id, rejectReason)); setShowRejectForm(false); }}
                  className="rounded-xl border border-red-400 bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-60">
                  Confirm reject
                </button>
                <button type="button" onClick={() => setShowRejectForm(false)}
                  className="rounded-xl border border-border bg-background px-4 py-2 text-sm text-muted-foreground hover:bg-accent">
                  Cancel
                </button>
              </div>
            </div>
          )}
          {showArchiveForm && actions.can_archive && (
            <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-xs font-semibold text-foreground">Archive reason (optional)</p>
              <textarea value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)}
                placeholder="Why is this policy being archived?"
                className="min-h-[60px] rounded-xl border border-input bg-background px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <button type="button" disabled={!!actionBusy}
                  onClick={() => { void runAction("Archive", () => archiveAdminPolicy(policy.id, archiveReason || undefined)); setShowArchiveForm(false); }}
                  className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-60">
                  Confirm archive
                </button>
                <button type="button" onClick={() => setShowArchiveForm(false)}
                  className="rounded-xl border border-border bg-background px-4 py-2 text-sm text-muted-foreground hover:bg-accent">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Two-column layout ── */}
      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">

        {/* Editor / Preview */}
        <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">

          {/* Tab bar */}
          <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 pt-0">
            <div className="flex">
              {(["edit", "preview"] as const).map((tab) => (
                <button key={tab} type="button" onClick={() => setContentTab(tab)}
                  className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-semibold transition ${
                    contentTab === tab
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}>
                  {tab === "edit" ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {tab === "edit" ? "Edit (raw tokens)" : "Preview (live data)"}
                  {tab === "edit" && dirty && (
                    <span className="ml-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
                  )}
                </button>
              ))}
            </div>
            {contentTab === "preview" && (
              <span className="py-3 text-xs text-muted-foreground">Tokens resolved from Business Setup</span>
            )}
          </div>

          <div className="p-5">

            {contentTab === "edit" ? (
              <form className="space-y-5" onSubmit={handleSave}>

                {/* Token palette */}
                <div className="rounded-xl border border-amber-200/60 bg-amber-50/40 p-3 dark:border-amber-700/40 dark:bg-amber-900/10">
                  <div className="mb-2 flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-amber-600" />
                    <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                      Dynamic tokens — click to insert at cursor
                    </span>
                    {usedTokenCount > 0 && (
                      <span className="ml-auto text-[11px] text-amber-700">{usedTokenCount} in use</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {TOKENS.map(({ token, description }) => (
                      <TokenChip key={token}
                        token={token}
                        description={description}
                        onClick={() => canEdit ? insertToken(token) : navigator.clipboard.writeText(token).catch(() => null)}
                      />
                    ))}
                  </div>
                  {usedTokenCount > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="text-[11px] text-amber-700 mr-1">In content:</span>
                      {Object.entries(tokenUsage).map(([tok, count]) => (
                        <span key={tok} className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] text-amber-800">
                          {tok} ×{count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted-foreground">Title</label>
                  <input value={editTitle}
                    onChange={(e) => { setEditTitle(e.target.value); markDirty(); }}
                    disabled={!canEdit}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 font-mono text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    required />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted-foreground">Summary</label>
                  <textarea value={editSummary}
                    onChange={(e) => { setEditSummary(e.target.value); markDirty(); }}
                    disabled={!canEdit}
                    className="min-h-[80px] w-full rounded-xl border border-input bg-background px-3 py-2 font-mono text-sm disabled:cursor-not-allowed disabled:opacity-50" />
                </div>

                <div>
                  <label className="mb-1 flex items-center justify-between text-xs font-semibold text-muted-foreground">
                    <span>Content (Markdown)</span>
                    <span className="font-normal">{editContent.length.toLocaleString()} chars · {editContent.split(/\s+/).filter(Boolean).length} words</span>
                  </label>
                  <textarea
                    ref={contentRef}
                    value={editContent}
                    onChange={(e) => { setEditContent(e.target.value); markDirty(); }}
                    disabled={!canEdit}
                    className="min-h-[480px] w-full rounded-xl border border-input bg-background px-3 py-3 font-mono text-sm leading-relaxed disabled:cursor-not-allowed disabled:opacity-50"
                    spellCheck={false}
                  />
                </div>

                {canEdit && (
                  <div className="flex items-center gap-3">
                    <button type="submit" disabled={saving || !dirty}
                      className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition">
                      {saving ? "Saving…" : "Save changes"}
                    </button>
                    {dirty && <span className="text-xs font-medium text-amber-600">● Unsaved changes</span>}
                    {!dirty && policy.updated_at && (
                      <span className="text-xs text-muted-foreground">Last saved {fmt(policy.updated_at)}</span>
                    )}
                  </div>
                )}
              </form>
            ) : (
              /* Preview tab */
              <div className="space-y-6">
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800 flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 shrink-0" />
                  Tokens are resolved using your current Business Setup data. Updating Business Setup automatically refreshes this.
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Title</p>
                  <p className="text-lg font-bold text-foreground">{policy.title || "—"}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Summary</p>
                  <p className="text-sm text-foreground leading-relaxed">{policy.summary || "—"}</p>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Content</p>
                  <div className="rounded-xl border border-border bg-background p-6 min-h-[400px]">
                    <MarkdownRenderer text={policy.content} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Sidebar */}
        <aside className="space-y-4">

          {/* Version / status card */}
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Version control</h2>
            <dl className="space-y-0">
              <MetaRow label="Version" value={`v${policy.version}`} />
              <MetaRow label="Status" value={policy.status} />
              <MetaRow label="Visibility" value={policy.visibility} />
              <MetaRow label="Effective date" value={fmt(policy.effective_date)} />
              <MetaRow label="Published" value={fmt(policy.published_at)} />
              <MetaRow label="Last reviewed" value={fmt(policy.last_reviewed_at)} />
            </dl>

            <div className="mt-3 flex gap-2">
              <div className={`flex-1 rounded-lg border px-2 py-1.5 text-center text-[11px] font-semibold ${policy.public_ready ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-border bg-muted/30 text-muted-foreground"}`}>
                {policy.public_ready ? "✓ Public ready" : "○ Not public"}
              </div>
              <div className={`flex-1 rounded-lg border px-2 py-1.5 text-center text-[11px] font-semibold ${policy.internal_ready ? "border-blue-200 bg-blue-50 text-blue-800" : "border-border bg-muted/30 text-muted-foreground"}`}>
                {policy.internal_ready ? "✓ Internal ready" : "○ Not internal"}
              </div>
            </div>
          </section>

          {/* Governance */}
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Governance</h2>
            <dl className="space-y-0">
              <MetaRow label="Category" value={policy.category} />
              <MetaRow label="Gov. category" value={policy.governance_category} />
              <MetaRow label="Coverage group" value={policy.coverage_group} />
              <MetaRow label="Source template" value={policy.source_template_key} />
              <MetaRow label="Legal review req." value={policy.requires_legal_review ? "Yes" : "No"} />
              <MetaRow label="Admin acceptance" value={policy.requires_admin_acceptance ? "Yes" : "No"} />
            </dl>
          </section>

          {/* People */}
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <button type="button" onClick={() => setShowMetaExpanded((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              People & audit trail
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMetaExpanded ? "rotate-180" : ""}`} />
            </button>
            {showMetaExpanded && (
              <dl className="mt-3 space-y-0">
                <MetaRow label="Owner" value={policy.owner_username} />
                <MetaRow label="Reviewer" value={policy.reviewer_username} />
                <MetaRow label="Approved by" value={policy.approved_by_username} />
                <MetaRow label="Published by" value={policy.published_by_username} />
                <MetaRow label="Archived by" value={policy.archived_by_username} />
                <MetaRow label="Accepted by" value={policy.internal_accepted_by_username} />
                <MetaRow label="Created by" value={policy.created_by_username ?? ""} />
                <MetaRow label="Submitted at" value={fmt(policy.submitted_for_review_at)} />
                <MetaRow label="Approved at" value={fmt(policy.approved_at)} />
                <MetaRow label="Archived at" value={fmt(policy.archived_at)} />
                <MetaRow label="Accepted at" value={fmt(policy.internal_acceptance_at)} />
                <MetaRow label="Created at" value={fmt(policy.created_at)} />
                <MetaRow label="Updated at" value={fmt(policy.updated_at)} />
              </dl>
            )}
          </section>

          {/* Alerts */}
          {policy.rejection_reason && (
            <section className="rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-red-900">
                <AlertTriangle className="h-3.5 w-3.5" /> Rejection reason
              </div>
              <p className="text-sm text-red-800">{policy.rejection_reason}</p>
            </section>
          )}
          {policy.archive_reason && (
            <section className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="mb-1 text-xs font-semibold text-foreground">Archive reason</div>
              <p className="text-sm text-muted-foreground">{policy.archive_reason}</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
