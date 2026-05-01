"use client";

import { useEffect, useMemo, useState } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import {
  getDocumentNumberingState,
  updateDocumentNumbering,
  type DocumentNumberingSequence,
  type DocumentNumberingState,
} from "@/services/business-setup";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to load document numbering setup.";
}

type DraftState = Record<string, { prefix: string; next_number: string; padding: string }>;

export default function BusinessSetupDocumentNumberingPage() {
  const [data, setData] = useState<DocumentNumberingState | null>(null);
  const [drafts, setDrafts] = useState<DraftState>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function load() {
    try {
      const response = await getDocumentNumberingState();
      setData(response);
      setDrafts(
        response.sequences.reduce<DraftState>((acc, sequence) => {
          acc[sequence.key] = {
            prefix: sequence.prefix || "",
            next_number: String(sequence.next_number || 1),
            padding: String(sequence.padding || 5),
          };
          return acc;
        }, {})
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

  async function save(sequence: DocumentNumberingSequence) {
    const draft = drafts[sequence.key];
    if (!draft) return;
    try {
      setSavingKey(sequence.key);
      setError(null);
      setNotice(null);
      const response = await updateDocumentNumbering({
        key: sequence.key,
        prefix: draft.prefix,
        next_number: Number(draft.next_number || "0"),
        padding: Number(draft.padding || "0"),
      });
      setData(response);
      setNotice(`${sequence.name} numbering updated.`);
    } catch (saveError) {
      setError(toErrorMessage(saveError));
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Document Numbering"
        description="Configure invoice and receipt numbering readiness before live billing."
      />
      <BusinessSetupLinks />

      <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Changing prefix or next number affects future documents only. Existing invoices and receipts remain unchanged.
      </section>

      {notice ? <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</section> : null}
      {error ? <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</section> : null}

      <section className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4 text-sm font-medium text-muted-foreground">Numbering readiness</div>
        <div className="divide-y divide-border">
          {rows.map((sequence) => {
            const draft = drafts[sequence.key];
            return (
              <div key={sequence.key} className="space-y-4 px-5 py-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{sequence.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {sequence.series_code} ({sequence.financial_year})
                    </div>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                      sequence.status === "ready"
                        ? "bg-emerald-500/10 text-emerald-600"
                        : sequence.status === "duplicate_risk"
                          ? "bg-rose-500/10 text-rose-600"
                          : "bg-amber-500/10 text-amber-600"
                    }`}
                  >
                    {sequence.status === "ready"
                      ? "Ready"
                      : sequence.status === "duplicate_risk"
                        ? "Duplicate risk"
                        : "Needs setup"}
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-6">
                  <label className="text-xs text-muted-foreground md:col-span-2">
                    Prefix
                    <input
                      value={draft?.prefix || ""}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [sequence.key]: { ...(prev[sequence.key] || { prefix: "", next_number: "1", padding: "5" }), prefix: event.target.value },
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Next number
                    <input
                      value={draft?.next_number || ""}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [sequence.key]: {
                            ...(prev[sequence.key] || { prefix: "", next_number: "1", padding: "5" }),
                            next_number: event.target.value,
                          },
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Padding
                    <input
                      value={draft?.padding || ""}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [sequence.key]: {
                            ...(prev[sequence.key] || { prefix: "", next_number: "1", padding: "5" }),
                            padding: event.target.value,
                          },
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                  <div className="text-xs text-muted-foreground">
                    Next preview
                    <div className="mt-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground">
                      {sequence.next_number_preview || "Not available"}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Last issued
                    <div className="mt-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground">
                      {sequence.last_issued_number || "—"}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void save(sequence)}
                    disabled={savingKey === sequence.key}
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {savingKey === sequence.key ? "Saving..." : "Save"}
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
