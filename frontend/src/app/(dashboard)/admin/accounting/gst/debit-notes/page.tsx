"use client";

import { useEffect, useState, type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import {
  AccountingNotice,
  AccountingRefreshButton,
  accountingDate,
  accountingErrorMessage,
  accountingFieldClassName,
  accountingMoney,
} from "@/components/accounting/shared";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  approveDebitNote,
  cancelDebitNote,
  createDebitNote,
  listDebitNotes,
  listTaxInvoices,
  postDebitNote,
  type GstNote,
  type TaxInvoice,
} from "@/services/accounting";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";

const today = new Date().toISOString().slice(0, 10);

export default function AccountingDebitNotesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notes, setNotes] = useState<GstNote[]>([]);
  const [invoices, setInvoices] = useState<TaxInvoice[]>([]);
  const [form, setForm] = useState({
    original_invoice: "",
    note_date: today,
    reason: "",
    taxable_adjustment: "0.00",
    tax_adjustment: "0.00",
  });

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const [notesPayload, invoicesPayload] = await Promise.all([
        listDebitNotes(),
        listTaxInvoices(),
      ]);
      setNotes(notesPayload.results);
      setInvoices(invoicesPayload.results);
      setError(null);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load debit notes."));
      if (mode === "initial") {
        setNotes([]);
        setInvoices([]);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createDebitNote({
        original_invoice: Number(form.original_invoice),
        note_date: form.note_date,
        reason: form.reason,
        taxable_adjustment: form.taxable_adjustment,
        tax_adjustment: form.tax_adjustment,
        total_adjustment: (
          Number(form.taxable_adjustment || 0) + Number(form.tax_adjustment || 0)
        ).toFixed(2),
      });
      setNotice("Debit note draft created.");
      setForm({
        original_invoice: "",
        note_date: today,
        reason: "",
        taxable_adjustment: "0.00",
        tax_adjustment: "0.00",
      });
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, "Failed to create the debit note."));
    }
  }

  async function handleApprove(id: number) {
    try {
      await approveDebitNote(id);
      setNotice("Debit note approved.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, "Failed to approve the debit note."));
    }
  }

  async function handlePost(id: number) {
    try {
      await postDebitNote(id);
      setNotice("Debit note posted.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, "Failed to post the debit note."));
    }
  }

  async function handleCancel(id: number) {
    try {
      await cancelDebitNote(id, "Cancelled from GST debit note workspace.");
      setNotice("Debit note cancelled through reversal journal.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, "Failed to cancel the debit note."));
    }
  }

  return (
    <ERPPageShell
      title="Debit Notes"
      subtitle="Controlled GST debit notes for upward adjustments against an original invoice, posted through the accounting subsystem only."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Debit Notes" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingTaxInvoices, label: "Tax Invoices", variant: "secondary" },
        { href: ROUTES.admin.accountingCreditNotes, label: "Credit Notes", variant: "secondary" },
      ]}
      stats={[
        { label: "Debit Notes", value: String(notes.length), tone: "info" },
        { label: "Approved", value: String(notes.filter((item) => item.status === "APPROVED").length), tone: "warning" },
        { label: "Posted", value: String(notes.filter((item) => item.status === "POSTED").length), tone: "success" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <AccountingRefreshButton
            loading={loading}
            refreshing={refreshing}
            onClick={() => void loadPage("refresh")}
          />
        </div>

        {notice ? <AccountingNotice message={notice} /> : null}
        {loading ? <LoadingBlock label="Loading debit notes..." /> : null}

        {!loading && error ? (
          <ErrorState title="Unable to load debit notes" description={error} onRetry={() => void loadPage("initial")} />
        ) : null}

        {!loading && !error ? (
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <WorkspaceSection title="Debit note register" description="Posted debit notes increase receivables and revenue through the separate accounting books.">
              {notes.length === 0 ? (
                <EmptyState title="No debit notes yet" description="Create a draft debit note when an approved invoice needs an upward adjustment." />
              ) : (
                <div className="space-y-3">
                  {notes.map((note) => (
                    <div key={note.id} className="rounded-xl border border-white/75 bg-white/75 px-4 py-4">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                          <div className="font-semibold text-foreground">{note.note_no || `Draft Debit Note #${note.id}`}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {accountingDate(note.note_date)} • Invoice {note.original_invoice_no || note.original_invoice}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Adjustment {accountingMoney(note.total_adjustment)} • Journal {note.posted_journal_entry_no || "—"}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {note.status === "DRAFT" ? (
                            <ConfirmActionButton
                              label="Approve"
                              title={`Approve ${note.note_no || `debit note ${note.id}`}?`}
                              description="Approval freezes the note draft for controlled posting."
                              onConfirm={async () => {
                                await handleApprove(note.id);
                              }}
                              variant="secondary"
                            />
                          ) : null}
                          {note.status === "APPROVED" ? (
                            <ConfirmActionButton
                              label="Post"
                              title={`Post ${note.note_no || `debit note ${note.id}`}?`}
                              description="Posting creates the GST adjustment journal and keeps the note immutable."
                              onConfirm={async () => {
                                await handlePost(note.id);
                              }}
                              variant="primary"
                            />
                          ) : null}
                          {note.status === "POSTED" ? (
                            <ConfirmActionButton
                              label="Cancel"
                              title={`Cancel ${note.note_no || `debit note ${note.id}`}?`}
                              description="Cancellation creates a reversal journal while preserving the original note."
                              onConfirm={async () => {
                                await handleCancel(note.id);
                              }}
                              variant="destructive"
                            />
                          ) : null}
                          <span className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground">
                            {note.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </WorkspaceSection>

            <WorkspaceSection title="Create draft debit note" description="Use this when a previously issued invoice needs a controlled upward adjustment with a fresh document trail.">
              <form className="grid gap-3" onSubmit={handleCreate}>
                <label className="text-sm text-muted-foreground">
                  Original invoice
                  <select
                    value={form.original_invoice}
                    onChange={(event) => setForm((current) => ({ ...current, original_invoice: event.target.value }))}
                    className={accountingFieldClassName()}
                  >
                    <option value="">Select invoice</option>
                    {invoices.map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        {invoice.invoice_no || `Draft #${invoice.id}`} • {invoice.recipient_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-muted-foreground">
                  Note date
                  <input type="date" value={form.note_date} onChange={(event) => setForm((current) => ({ ...current, note_date: event.target.value }))} className={accountingFieldClassName()} />
                </label>
                <label className="text-sm text-muted-foreground">
                  Reason
                  <textarea value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} className={accountingFieldClassName()} />
                </label>
                <label className="text-sm text-muted-foreground">
                  Taxable adjustment
                  <input value={form.taxable_adjustment} onChange={(event) => setForm((current) => ({ ...current, taxable_adjustment: event.target.value }))} className={accountingFieldClassName()} />
                </label>
                <label className="text-sm text-muted-foreground">
                  Tax adjustment
                  <input value={form.tax_adjustment} onChange={(event) => setForm((current) => ({ ...current, tax_adjustment: event.target.value }))} className={accountingFieldClassName()} />
                </label>
                <button type="submit" className="rounded-xl border border-slate-900/10 bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                  Create Draft Debit Note
                </button>
              </form>
            </WorkspaceSection>
          </div>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
