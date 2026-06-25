"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import { invalidateAfterDocumentNumberingMutation } from "@/lib/operational-query-invalidation";
import {
  getDocumentNumberingState,
  updateDocumentNumbering,
  type DocumentNumberingSequence,
  type DocumentNumberingState,
} from "@/services/business-setup";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to load document numbering setup.";
}

type DraftState = Record<string, { prefix: string; pattern: string; suffix: string; reset_policy: string; next_number: string; padding: string }>;

function statusLabel(status: string): string {
  if (status === "ready") return "Ready";
  if (status === "duplicate_risk") return "Duplicate risk";
  if (status === "blocked") return "Blocked";
  return "Needs setup";
}

function statusClass(status: string): string {
  if (status === "ready") return "bg-emerald-500/10 text-emerald-700 border-emerald-200";
  if (status === "duplicate_risk" || status === "blocked") return "bg-rose-500/10 text-rose-700 border-rose-200";
  return "bg-amber-500/10 text-amber-700 border-amber-200";
}

function workflowLabel(sequence: DocumentNumberingSequence): string {
  const group = (sequence.workflow_group || "").replace(/_/g, " ");
  return group ? group.replace(/\b\w/g, (char) => char.toUpperCase()) : "General";
}

const emptyDraft = { prefix: "", pattern: "{PREFIX}-{number}", suffix: "", reset_policy: "YEARLY", next_number: "1", padding: "5" };
const SUMMARY_ORDER = ["CONTRACT", "RECEIPT", "TAX_INVOICE", "DIRECT_SALE", "RENT_INVOICE", "LEASE_INVOICE", "DEPOSIT_RECEIPT", "CREDIT_NOTE", "DEBIT_NOTE", "JOURNAL_ENTRY", "SETTLEMENT", "PAYOUT"];

function nextPreview(pattern: string, prefix: string, suffix: string, fy: string, doc: string, nextNumber: string, padding: string): string {
  const safeNumber = Math.max(1, Number(nextNumber || "1"));
  const safePadding = Math.min(12, Math.max(1, Number(padding || "5")));
  const cleanPrefix = (prefix || "").trim().toUpperCase();
  if (!cleanPrefix || Number.isNaN(safeNumber) || Number.isNaN(safePadding)) return "Invalid draft";
  const legacyFy = (fy || "").replace(/^FY/i, "");
  const yyyy = legacyFy.slice(0, 4);
  const yy = yyyy.slice(-2);
  const number = String(safeNumber).padStart(safePadding, "0");
  return (pattern || "{PREFIX}-{number}")
    .replaceAll("{PREFIX}", cleanPrefix)
    .replaceAll("{FY}", legacyFy)
    .replaceAll("{YYYY}", yyyy)
    .replaceAll("{YY}", yy)
    .replaceAll("{DOC}", doc || cleanPrefix)
    .replace(/\{number(?::\d{1,2})?\}/gi, number)
    .concat(suffix || "")
    .toUpperCase();
}

export default function BusinessSetupDocumentNumberingPage() {
  const queryClient = useQueryClient();
  const [data, setData] = useState<DocumentNumberingState | null>(null);
  const [drafts, setDrafts] = useState<DraftState>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  async function load() {
    try {
      const response = await getDocumentNumberingState();
      setData(response);
      setDrafts(
        response.sequences.reduce<DraftState>((acc, sequence) => {
          acc[sequence.key] = {
            prefix: sequence.prefix || sequence.default_prefix || "",
            pattern: sequence.pattern || sequence.default_pattern || "{PREFIX}-{number}",
            suffix: sequence.suffix || "",
            reset_policy: sequence.reset_policy || "YEARLY",
            next_number: String(sequence.next_number || sequence.min_safe_next_number || 1),
            padding: String(sequence.padding || sequence.default_padding || 5),
          };
          return acc;
        }, {}),
      );
      setError(null);
    } catch (loadError) {
      setError(toErrorMessage(loadError));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo(() => data?.sequences || [], [data]);
  const summaryRows = useMemo(() => {
    const rank = (sequence: DocumentNumberingSequence) => {
      const key = `${sequence.key} ${sequence.document_type} ${sequence.name}`.toUpperCase();
      const index = SUMMARY_ORDER.findIndex((item) => key.includes(item));
      return index === -1 ? SUMMARY_ORDER.length : index;
    };
    return [...rows].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [rows]);
  const summary = data?.summary || {};
  const missingRows = rows.filter((row) => !row.configured);
  const blockingRows = rows.filter((row) => row.status === "blocked" || row.status === "duplicate_risk");

  async function save(sequence: DocumentNumberingSequence) {
    const draft = drafts[sequence.key];
    if (!draft) return;
    try {
      setSavingKey(sequence.key);
      setError(null);
      setNotice(null);
      const minSafeNext = sequence.min_safe_next_number || 1;
      const nextNumber = Number(draft.next_number || "0");
      const padding = Number(draft.padding || "0");
      if (!draft.prefix.trim()) {
        setError("Prefix cannot be empty.");
        return;
      }
      if (!Number.isFinite(padding) || padding < 1 || padding > 12) {
        setError("Padding must be between 1 and 12.");
        return;
      }
      if (!Number.isFinite(nextNumber) || nextNumber < minSafeNext) {
        setError(`Next number cannot be below the last issued safe value (${minSafeNext}).`);
        return;
      }
      const livePrefixChanged = sequence.configured && Number(sequence.issued_count || 0) > 0 && draft.prefix.trim().toUpperCase() !== (sequence.prefix || "").trim().toUpperCase();
      if (livePrefixChanged && !window.confirm("Changing numbering affects future documents only. Existing documents are never renumbered. Continue with this prefix change?")) {
        return;
      }
      const response = await updateDocumentNumbering({
        key: sequence.key,
        prefix: draft.prefix,
        pattern: draft.pattern,
        suffix: draft.suffix,
        reset_policy: draft.reset_policy,
        next_number: nextNumber,
        padding,
      });
      setData(response);
      setDrafts(
        response.sequences.reduce<DraftState>((acc, row) => {
          acc[row.key] = {
            prefix: row.prefix || row.default_prefix || "",
            pattern: row.pattern || row.default_pattern || "{PREFIX}-{number}",
            suffix: row.suffix || "",
            reset_policy: row.reset_policy || "YEARLY",
            next_number: String(row.next_number || row.min_safe_next_number || 1),
            padding: String(row.padding || row.default_padding || 5),
          };
          return acc;
        }, {}),
      );
      setNotice(`${sequence.name} numbering updated. Existing issued documents were not changed.`);
      await invalidateAfterDocumentNumberingMutation(queryClient);
    } catch (saveError) {
      setError(toErrorMessage(saveError));
    } finally {
      setSavingKey(null);
    }
  }

  async function seedMissingDefaults() {
    if (!missingRows.length) return;
    try {
      setSeeding(true);
      setError(null);
      setNotice(null);
      let latest: DocumentNumberingState | null = data;
      for (const sequence of missingRows) {
        latest = await updateDocumentNumbering({
          key: sequence.key,
          prefix: sequence.default_prefix || sequence.prefix,
          pattern: sequence.default_pattern || sequence.pattern || "{PREFIX}-{number}",
          suffix: sequence.suffix || "",
          reset_policy: sequence.reset_policy || "YEARLY",
          next_number: Math.max(1, sequence.min_safe_next_number || 1),
          padding: sequence.default_padding || sequence.padding || 5,
        });
      }
      if (latest) {
        setData(latest);
        setDrafts(
          latest.sequences.reduce<DraftState>((acc, row) => {
            acc[row.key] = {
              prefix: row.prefix || row.default_prefix || "",
              pattern: row.pattern || row.default_pattern || "{PREFIX}-{number}",
              suffix: row.suffix || "",
              reset_policy: row.reset_policy || "YEARLY",
              next_number: String(row.next_number || row.min_safe_next_number || 1),
              padding: String(row.padding || row.default_padding || 5),
            };
            return acc;
          }, {}),
        );
      }
      setNotice(`Seeded ${missingRows.length} missing numbering row(s) with safe defaults.`);
      await invalidateAfterDocumentNumberingMutation(queryClient);
    } catch (seedError) {
      setError(toErrorMessage(seedError));
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Document Numbering"
        description="Control invoice, receipt, direct-sale, EMI, and rent/lease document sequences before live billing."
        actions={
          <button
            type="button"
            onClick={() => void seedMissingDefaults()}
            disabled={seeding || missingRows.length === 0}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {seeding ? "Seeding..." : missingRows.length ? `Seed missing defaults (${missingRows.length})` : "Defaults configured"}
          </button>
        }
      />
      <BusinessSetupLinks />

      <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Changing numbering affects future documents only. Existing documents are never renumbered.
      </section>

      {data?.setup_blockers?.length ? (
        <section className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
          <div className="font-semibold">Readiness blockers</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {data.setup_blockers.map((item, index) => <li key={`setup-blocker-${index}`}>{item}</li>)}
          </ul>
        </section>
      ) : null}

      {notice ? <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</section> : null}
      {error ? <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</section> : null}

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <div className="text-sm font-semibold text-foreground">Sequence summary</div>
          <p className="mt-1 text-sm text-muted-foreground">Preview the next future number and verify where each sequence is used before editing details below.</p>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
          {summaryRows.length === 0 ? <div className="text-sm text-muted-foreground">No numbering rows returned by the backend.</div> : null}
          {summaryRows.map((sequence) => (
            <article key={`summary-${sequence.key}`} className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">{sequence.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{workflowLabel(sequence)} · {sequence.document_type || sequence.key}</p>
                </div>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass(sequence.status)}`}>{statusLabel(sequence.status)}</span>
              </div>
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <div><span className="text-muted-foreground">Prefix</span><div className="font-semibold text-foreground">{sequence.prefix || "Missing"}</div></div>
                <div><span className="text-muted-foreground">Next preview</span><div className="font-semibold text-foreground">{sequence.preview_number || sequence.next_number_preview || "Not configured"}</div></div>
                <div><span className="text-muted-foreground">Last issued</span><div className="font-semibold text-foreground">{sequence.last_issued_number || "None"}</div></div>
                <div><span className="text-muted-foreground">Fiscal year mode</span><div className="font-semibold text-foreground">{sequence.reset_policy || "YEARLY"}</div></div>
              </div>
              <div className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Used for: {sequence.description || `${sequence.doc_kind || "document"} workflow in ${workflowLabel(sequence)}.`}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Financial year</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{data?.active_financial_year_code || data?.financial_year || "…"}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {data?.active_financial_year_date_range?.start_date && data?.active_financial_year_date_range?.end_date
              ? `${data.active_financial_year_date_range.start_date} to ${data.active_financial_year_date_range.end_date}`
              : "No active FY configured"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Ready</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{Number(summary.ready_count || 0)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Needs setup</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{Number(summary.needs_setup_count || missingRows.length)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Blocked</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{Number(summary.blocked_count || blockingRows.length)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Current period</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{data?.current_period?.status || "…"}</div>
          <div className="mt-1 text-xs text-muted-foreground">{data?.current_period?.name || "No period for today"}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Issued docs</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{Number(summary.issued_document_count || 0)}</div>
        </div>
      </section>

      {data?.operator_rules?.length ? (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm font-semibold text-foreground">Operator rules</div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {data.operator_rules.map((rule, index) => (
              <div key={`operator-rule-${index}`} className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                {rule}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <div className="text-sm font-semibold text-foreground">Numbering register</div>
          <p className="mt-1 text-sm text-muted-foreground">Required rows affect go-live. Future rent/lease rows may be prepared now without enabling collection execution.</p>
        </div>
        <div className="divide-y divide-border">
          {rows.length === 0 ? (
            <div className="px-5 py-8 text-sm text-muted-foreground">No numbering rows returned by the backend.</div>
          ) : null}
          {rows.map((sequence) => {
            const draft = drafts[sequence.key];
            const minSafeNext = sequence.min_safe_next_number || 1;
            const draftNext = Number(draft?.next_number || "0");
            const draftPadding = Number(draft?.padding || "0");
            const draftInvalid = !draft || !draft.prefix.trim() || draftNext < minSafeNext || draftPadding < 1 || draftPadding > 12;
            return (
              <div key={sequence.key} className="space-y-4 px-5 py-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-foreground">{sequence.name}</h2>
                      <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold uppercase text-muted-foreground">{workflowLabel(sequence)}</span>
                      {sequence.required_for_go_live === false ? (
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold uppercase text-blue-800">Future / optional</span>
                      ) : (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase text-amber-800">Required</span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{sequence.series_code} · {sequence.document_type || sequence.key} · {sequence.active_financial_year_code || sequence.financial_year} · {sequence.doc_kind || "document"}</div>
                    {sequence.description ? <p className="mt-2 text-sm text-muted-foreground">{sequence.description}</p> : null}
                  </div>
                  <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(sequence.status)}`}>
                    {statusLabel(sequence.status)}
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-border bg-background p-3">
                    <div className="text-xs uppercase text-muted-foreground">Last issued</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">{sequence.last_issued_number || "—"}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3">
                    <div className="text-xs uppercase text-muted-foreground">Issued count</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">{Number(sequence.issued_count || 0)}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3">
                    <div className="text-xs uppercase text-muted-foreground">Min safe next</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">{minSafeNext}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3">
                    <div className="text-xs uppercase text-muted-foreground">Duplicate issues</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">{Number(sequence.duplicate_count || 0)}</div>
                  </div>
                </div>

                {[...(sequence.blockers || []), ...(sequence.warnings || [])].length ? (
                  <div className="grid gap-2">
                    {(sequence.blockers || []).map((item, index) => (
                      <div key={`${sequence.key}-blocker-${index}`} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{item}</div>
                    ))}
                    {(sequence.warnings || []).map((item, index) => (
                      <div key={`${sequence.key}-warning-${index}`} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{item}</div>
                    ))}
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-6">
                  <label className="text-xs text-muted-foreground md:col-span-2">
                    Prefix
                    <input
                      value={draft?.prefix || ""}
                      onChange={(event) => setDrafts((prev) => ({ ...prev, [sequence.key]: { ...(prev[sequence.key] || emptyDraft), prefix: event.target.value.toUpperCase() } }))}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                    />
                    {sequence.can_edit_prefix === false ? <span className="mt-1 block text-[11px] text-amber-700">Existing documents use this series. Change prefix only when intentionally starting a new future series.</span> : null}
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Next number
                    <input
                      type="number"
                      min={minSafeNext}
                      value={draft?.next_number || ""}
                      onChange={(event) => setDrafts((prev) => ({ ...prev, [sequence.key]: { ...(prev[sequence.key] || emptyDraft), next_number: event.target.value } }))}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                    />
                    <span className="mt-1 block text-[11px] text-muted-foreground">Must be ≥ {minSafeNext}</span>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Padding
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={draft?.padding || ""}
                      onChange={(event) => setDrafts((prev) => ({ ...prev, [sequence.key]: { ...(prev[sequence.key] || emptyDraft), padding: event.target.value } }))}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                  <div className="text-xs text-muted-foreground">
                    Current preview
                    <div className="mt-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground">{sequence.preview_number || sequence.next_number_preview || "Not configured"}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Draft preview
                    <div className={`mt-1 rounded-lg border px-3 py-2 text-sm ${draftInvalid ? "border-rose-200 bg-rose-50 text-rose-800" : "border-border bg-muted text-foreground"}`}>
                      {draft ? nextPreview(draft.pattern, draft.prefix, draft.suffix, sequence.active_financial_year_code || sequence.financial_year, sequence.document_type || sequence.key, draft.next_number, draft.padding) : "—"}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-6">
                  <label className="text-xs text-muted-foreground md:col-span-3">
                    Pattern
                    <input
                      value={draft?.pattern || ""}
                      onChange={(event) => setDrafts((prev) => ({ ...prev, [sequence.key]: { ...(prev[sequence.key] || emptyDraft), pattern: event.target.value } }))}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                    />
                    <span className="mt-1 block text-[11px] text-muted-foreground">Tokens: {"{FY}"}, {"{YYYY}"}, {"{YY}"}, {"{DOC}"}, {"{number}"}</span>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Suffix
                    <input
                      value={draft?.suffix || ""}
                      onChange={(event) => setDrafts((prev) => ({ ...prev, [sequence.key]: { ...(prev[sequence.key] || emptyDraft), suffix: event.target.value.toUpperCase() } }))}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                  <label className="text-xs text-muted-foreground md:col-span-2">
                    Reset policy
                    <select
                      value={draft?.reset_policy || "YEARLY"}
                      onChange={(event) => setDrafts((prev) => ({ ...prev, [sequence.key]: { ...(prev[sequence.key] || emptyDraft), reset_policy: event.target.value } }))}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                    >
                      <option value="YEARLY">Yearly</option>
                      <option value="MONTHLY">Monthly</option>
                      <option value="NEVER">Never</option>
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  {sequence.can_seed_default ? (
                    <button
                      type="button"
                      onClick={() => setDrafts((prev) => ({ ...prev, [sequence.key]: { prefix: sequence.default_prefix || sequence.prefix, pattern: sequence.default_pattern || sequence.pattern || "{PREFIX}-{number}", suffix: sequence.suffix || "", reset_policy: sequence.reset_policy || "YEARLY", next_number: String(sequence.min_safe_next_number || 1), padding: String(sequence.default_padding || 5) } }))}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-accent"
                    >
                      Fill default
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void save(sequence)}
                    disabled={savingKey === sequence.key || draftInvalid}
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {savingKey === sequence.key ? "Saving..." : sequence.configured ? "Save future numbering" : "Create numbering row"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
