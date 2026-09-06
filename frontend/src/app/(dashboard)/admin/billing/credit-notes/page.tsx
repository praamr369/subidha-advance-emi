"use client";

import { useCallback, useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { BILLING_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import ERPPageShell from "@/components/erp/ERPPageShell";
import BillingPrintDocument from "@/components/print/BillingPrintDocument";
import PrintActionBanner from "@/components/print/PrintActionBanner";
import { ROUTES } from "@/lib/routes";
import { accountingDate, accountingErrorMessage, accountingMoney } from "@/components/accounting/shared";
import type { BillingCreditNote, CreditNoteAvailableBalance } from "@/services/billing";
import {
  approveBillingCreditNote,
  applyCreditNoteToInvoice,
  getCreditNoteAvailableBalance,
  listBillingCreditNotes,
  postBillingCreditNote,
} from "@/services/billing";
import { apiFetch } from "@/lib/api";

type InvoiceOption = {
  id: number;
  document_no: string | null;
  balance_total: string;
  customer_name_snapshot?: string;
};

function ApplyCreditNoteDialog({
  creditNote,
  onClose,
  onSuccess,
}: {
  creditNote: BillingCreditNote;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [balance, setBalance] = useState<CreditNoteAvailableBalance | null>(null);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const bal = await getCreditNoteAvailableBalance(creditNote.id);
        setBalance(bal);
        const origInv = await apiFetch<{ customer?: number }>(`/billing/invoices/${creditNote.original_invoice}/`).catch(() => null);
        const customerId = origInv?.customer;
        if (customerId) {
          const invResp = await apiFetch<{ results: InvoiceOption[] }>(
            `/billing/invoices/?customer=${customerId}&page_size=200`
          ).catch(() => ({ results: [] as InvoiceOption[] }));
          setInvoices((invResp.results || []).filter((i) => Number(i.balance_total || 0) > 0));
        }
      } catch {
        setDialogError("Failed to load credit note details.");
      }
    }
    void load();
  }, [creditNote.id, creditNote.original_invoice]);

  async function handleApply() {
    if (!selectedInvoice || !amount) return;
    setSubmitting(true);
    setDialogError(null);
    try {
      const result = await applyCreditNoteToInvoice({
        credit_note_id: creditNote.id,
        invoice_id: Number(selectedInvoice),
        amount,
        notes,
      });
      setSuccess(result.message);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "Failed to apply credit note.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">
          Apply Credit Note {creditNote.note_no || `#${creditNote.id}`}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Total: {accountingMoney(creditNote.total_adjustment)} | Available:{" "}
          {balance ? accountingMoney(balance.available_balance) : "Loading..."}
        </p>

        {balance && balance.applications.length > 0 ? (
          <div className="mt-3 rounded-xl border border-border bg-muted/50 p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Previous Applications</div>
            {balance.applications.map((a) => (
              <div key={a.id} className="mt-1 text-sm text-foreground">
                INV {a.invoice_no || a.invoice_id} — {accountingMoney(a.amount)} on {a.applied_date}
              </div>
            ))}
          </div>
        ) : null}

        {dialogError ? (
          <div className="mt-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive">
            {dialogError}
          </div>
        ) : null}

        {success ? (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
            {success}
          </div>
        ) : null}

        {!success ? (
          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="f-invoice" className="mb-1 block text-sm font-medium text-foreground">Invoice</label>
              <select id="f-invoice"
                value={selectedInvoice}
                onChange={(e) => setSelectedInvoice(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-sky-400"
                disabled={submitting}
              >
                <option value="">Select invoice...</option>
                {invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.document_no || `INV #${inv.id}`} — Balance: {accountingMoney(inv.balance_total)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-amount" className="mb-1 block text-sm font-medium text-foreground">Amount</label>
              <input id="f-amount"
                type="number"
                step="0.01"
                min="0.01"
                max={balance?.available_balance || undefined}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount to apply"
                className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-sky-400"
                disabled={submitting}
              />
            </div>
            <div>
              <label htmlFor="f-notes-optional" className="mb-1 block text-sm font-medium text-foreground">Notes (optional)</label>
              <input id="f-notes-optional"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Application notes"
                className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-sky-400"
                disabled={submitting}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleApply}
                disabled={submitting || !selectedInvoice || !amount}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Applying..." : "Apply Credit"}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function BillingCreditNotesPage() {
  const [rows, setRows] = useState<BillingCreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applyingNote, setApplyingNote] = useState<BillingCreditNote | null>(null);

  const loadPage = useCallback(async () => {
    try {
      const payload = await listBillingCreditNotes();
      setRows(payload.results);
      setError(null);
    } catch (err) {
      setRows([]);
      setError(accountingErrorMessage(err, "Failed to load billing credit notes."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const columns: EnterpriseColumnDef<BillingCreditNote>[] = [
    { key: "note_date", header: "Date", render: (row) => accountingDate(row.note_date) },
    { key: "note_no", header: "Credit Note" },
    { key: "original_invoice_no", header: "Invoice" },
    { key: "status", header: "Status" },
    { key: "stock_effect", header: "Stock", render: (row) => (row.stock_effect ? "Yes" : "No") },
    { key: "total_adjustment", header: "Adjustment", render: (row) => accountingMoney(row.total_adjustment) },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {row.status === "DRAFT" ? (
            <ConfirmActionButton
              label="Approve"
              title={`Approve ${row.note_no || `credit note ${row.id}`}?`}
              description="Approval freezes the credit note before posting."
              onConfirm={async () => {
                await approveBillingCreditNote(row.id);
                await loadPage();
              }}
              variant="secondary"
            />
          ) : null}
          {row.status === "APPROVED" ? (
            <ConfirmActionButton
              label="Post"
              title={`Post ${row.note_no || `credit note ${row.id}`}?`}
              description="Posting will write the accounting reversal and any stock return movements."
              onConfirm={async () => {
                await postBillingCreditNote(row.id);
                await loadPage();
              }}
              variant="primary"
            />
          ) : null}
          {row.status === "POSTED" ? (
            <button
              type="button"
              onClick={() => setApplyingNote(row)}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition hover:border-ring hover:bg-muted"
            >
              Apply to Invoice
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  const latestPosted = rows.find((row) => row.status === "POSTED");
  const creditNoteStats = {
    pending: rows.filter((row) => ["DRAFT", "APPROVED"].includes(String(row.status || "").toUpperCase())).length,
    posted: rows.filter((row) => String(row.status || "").toUpperCase() === "POSTED").length,
    postedValue: rows
      .filter((row) => String(row.status || "").toUpperCase() === "POSTED")
      .reduce((sum, row) => sum + Number(row.total_adjustment || 0), 0),
  };

  return (
    <ERPPageShell
      className="receipt-print-page"
      eyebrow="Billing Adjustment Control"
      title="Billing Credit Notes"
      subtitle="Returns and allowances linked back to original invoices with optional stock effect."
      helperNote="Credit notes remain explicit billing adjustments with separate approve/post posture. They do not silently rewrite invoices, receipts, or stock history."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Billing", href: ROUTES.admin.billing },
        { label: "Credit Notes" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
      stats={[
        { label: "Credit Notes", value: loading ? "—" : rows.length, tone: "info" },
        { label: "Pending", value: loading ? "—" : creditNoteStats.pending, tone: !loading && creditNoteStats.pending > 0 ? "warning" : "success" },
        { label: "Posted", value: loading ? "—" : creditNoteStats.posted, tone: "default" },
        { label: "Posted Value", value: loading ? "—" : accountingMoney(creditNoteStats.postedValue), tone: "default" },
      ]}
    >
      <WorkspaceDirectory
        className="receipt-print-hide"
        title="Billing route map"
        description="Use the shared billing directory to move from credit-note review into invoices, documents, contract mirrors, and related billing books."
        groups={BILLING_CONTROL_DIRECTORY_GROUPS}
      />

      <div className="receipt-print-hide">
        <EnterpriseDataTable
          data={rows}
          columns={columns}
          loading={loading}
          error={error}
          emptyTitle="No credit notes found"
          emptyDescription="Create a credit note when you need a controlled return or allowance adjustment."
        />
      </div>
      <PrintActionBanner
        className="mb-4"
        title="Credit Note Print / PDF"
        description="Print this posted credit-note preview for adjustment records or save it as PDF."
      />
      <BillingPrintDocument
        title="Credit Note"
        subtitle="Printable credit-note preview for approved return and allowance adjustments."
        reference={latestPosted?.note_no || "No posted credit note"}
        meta={
          latestPosted
            ? `Original invoice ${latestPosted.original_invoice_no || "—"}`
            : "Waiting for a posted credit note"
        }
        statusLabel={latestPosted?.status}
        statusToneClassName={
          latestPosted?.status === "POSTED"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : latestPosted?.status === "APPROVED"
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-border bg-muted text-foreground"
        }
        partyFields={[
          {
            label: "Adjusted Invoice",
            value: latestPosted?.original_invoice_no || "—",
            emphasize: true,
          },
          {
            label: "Stock Effect",
            value: latestPosted?.stock_effect ? "Yes" : "No",
          },
          { label: "Status", value: latestPosted?.status || "—" },
        ]}
        referenceFields={[
          { label: "Note Date", value: latestPosted?.note_date || "—" },
          { label: "Note Number", value: latestPosted?.note_no || "—" },
          { label: "Note Type", value: "Credit Note" },
          { label: "Posting State", value: latestPosted?.status || "—" },
        ]}
        summaryFields={[
          { label: "Taxable Adjustment", value: accountingMoney(latestPosted?.taxable_adjustment || 0) },
          { label: "Tax Adjustment", value: accountingMoney(latestPosted?.tax_adjustment || 0) },
          { label: "Total Adjustment", value: accountingMoney(latestPosted?.total_adjustment || 0), emphasize: true },
          { label: "Line Count", value: String(latestPosted?.lines?.length || 0) },
        ]}
        detailFields={[
          { label: "Reason", value: latestPosted?.reason || "—" },
          { label: "Original Invoice", value: latestPosted?.original_invoice_no || "—" },
          { label: "Document Status", value: latestPosted?.status || "—" },
        ]}
        lineItems={(latestPosted?.lines || []).map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPrice: accountingMoney(line.taxable_value),
          lineTotal: accountingMoney(line.line_total),
          note: line.inventory_item_sku || undefined,
        }))}
      />
      {applyingNote ? (
        <ApplyCreditNoteDialog
          creditNote={applyingNote}
          onClose={() => setApplyingNote(null)}
          onSuccess={() => void loadPage()}
        />
      ) : null}
    </ERPPageShell>
  );
}
