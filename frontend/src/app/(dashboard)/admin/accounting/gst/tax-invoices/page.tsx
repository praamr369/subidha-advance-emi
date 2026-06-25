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
  approveTaxInvoice,
  cancelTaxInvoice,
  createTaxInvoice,
  listTaxInvoices,
  postTaxInvoice,
  type TaxInvoice,
} from "@/services/accounting";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";

const today = new Date().toISOString().slice(0, 10);

export default function AccountingTaxInvoicesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<TaxInvoice[]>([]);
  const [form, setForm] = useState({
    invoice_date: today,
    supplier_name: "Subidha Furniture",
    supplier_gstin: "",
    supplier_address: "Main showroom",
    supplier_state_code: "18",
    recipient_name: "",
    recipient_address: "",
    recipient_gstin: "",
    place_of_supply_state_code: "18",
    supply_kind: "INTRA" as "INTRA" | "INTER",
    subtotal_taxable: "0.00",
    cgst_amount: "0.00",
    sgst_amount: "0.00",
    igst_amount: "0.00",
    notes: "",
    line_description: "Furniture supply",
    hsn_sac: "",
  });

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const payload = await listTaxInvoices();
      setInvoices(payload.results);
      setError(null);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load tax invoices."));
      if (mode === "initial") setInvoices([]);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  async function handleCreateInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const totalAmount = (
      Number(form.subtotal_taxable || 0) +
      Number(form.cgst_amount || 0) +
      Number(form.sgst_amount || 0) +
      Number(form.igst_amount || 0)
    ).toFixed(2);

    try {
      await createTaxInvoice({
        invoice_date: form.invoice_date,
        supplier_name: form.supplier_name,
        supplier_gstin: form.supplier_gstin,
        supplier_address: form.supplier_address,
        supplier_state_code: form.supplier_state_code,
        recipient_name: form.recipient_name,
        recipient_address: form.recipient_address,
        recipient_gstin: form.recipient_gstin,
        place_of_supply_state_code: form.place_of_supply_state_code,
        supply_kind: form.supply_kind,
        subtotal_taxable: form.subtotal_taxable,
        cgst_amount: form.cgst_amount,
        sgst_amount: form.sgst_amount,
        igst_amount: form.igst_amount,
        total_amount: totalAmount,
        notes: form.notes,
        lines: [
          {
            description: form.line_description,
            hsn_sac: form.hsn_sac,
            taxable_value: form.subtotal_taxable,
            gst_rate: "0.00",
            cgst_amount: form.cgst_amount,
            sgst_amount: form.sgst_amount,
            igst_amount: form.igst_amount,
            line_total: totalAmount,
          },
        ],
      });
      setNotice("Tax invoice draft created.");
      setForm((current) => ({
        ...current,
        recipient_name: "",
        recipient_address: "",
        recipient_gstin: "",
        subtotal_taxable: "0.00",
        cgst_amount: "0.00",
        sgst_amount: "0.00",
        igst_amount: "0.00",
        notes: "",
      }));
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, "Failed to create the tax invoice."));
    }
  }

  async function handleApprove(id: number) {
    try {
      await approveTaxInvoice(id);
      setNotice("Tax invoice approved.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, "Failed to approve the tax invoice."));
    }
  }

  async function handlePost(id: number) {
    try {
      await postTaxInvoice(id);
      setNotice("Tax invoice posted to accounting.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, "Failed to post the tax invoice."));
    }
  }

  async function handleCancel(id: number) {
    try {
      await cancelTaxInvoice(id, "Cancelled from GST tax invoice workspace.");
      setNotice("Tax invoice cancelled through reversal journal.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, "Failed to cancel the tax invoice."));
    }
  }

  return (
    <ERPPageShell
      title="Tax Invoices"
      subtitle="GST-ready invoice skeletons with controlled numbering and accounting posting. This is additive document handling only, not a tax engine."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Tax Invoices" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingCreditNotes, label: "Credit Notes", variant: "secondary" },
        { href: ROUTES.admin.accountingDebitNotes, label: "Debit Notes", variant: "secondary" },
      ]}
      stats={[
        { label: "Invoices", value: String(invoices.length), tone: "info" },
        { label: "Approved", value: String(invoices.filter((item) => item.status === "APPROVED").length), tone: "warning" },
        { label: "Posted", value: String(invoices.filter((item) => item.status === "POSTED").length), tone: "success" },
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
        {loading ? <LoadingBlock label="Loading tax invoices..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load tax invoices"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <WorkspaceSection
              title="Tax invoice register"
              description="Real tax invoice drafts, approvals, and postings from the accounting module."
            >
              {invoices.length === 0 ? (
                <EmptyState title="No tax invoices yet" description="Create a GST-ready invoice draft to start the document trail." />
              ) : (
                <div className="space-y-3">
                  {invoices.map((invoice) => (
                    <div key={invoice.id} className="rounded-xl border border-border bg-card px-4 py-4">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                          <div className="font-semibold text-foreground">
                            {invoice.invoice_no || `Draft Invoice #${invoice.id}`}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {accountingDate(invoice.invoice_date)} • {invoice.recipient_name} • {invoice.doc_series_code || "Auto series"}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Total {accountingMoney(invoice.total_amount)} • Journal {invoice.posted_journal_entry_no || "—"}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {invoice.status === "DRAFT" ? (
                            <ConfirmActionButton
                              label="Approve"
                              title={`Approve ${invoice.invoice_no || `invoice ${invoice.id}`}?`}
                              description="Approval issues or confirms the document number and freezes the draft for posting."
                              onConfirm={async () => {
                                await handleApprove(invoice.id);
                              }}
                              variant="secondary"
                            />
                          ) : null}
                          {invoice.status === "APPROVED" ? (
                            <ConfirmActionButton
                              label="Post"
                              title={`Post ${invoice.invoice_no || `invoice ${invoice.id}`}?`}
                              description="Posting creates the GST journal and makes the document immutable except through controlled cancellation."
                              onConfirm={async () => {
                                await handlePost(invoice.id);
                              }}
                              variant="primary"
                            />
                          ) : null}
                          {invoice.status === "POSTED" ? (
                            <ConfirmActionButton
                              label="Cancel"
                              title={`Cancel ${invoice.invoice_no || `invoice ${invoice.id}`}?`}
                              description="Cancellation keeps the original document immutable and creates a reversal journal."
                              onConfirm={async () => {
                                await handleCancel(invoice.id);
                              }}
                              variant="destructive"
                            />
                          ) : null}
                          <span className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground">
                            {invoice.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </WorkspaceSection>

            <WorkspaceSection
              title="Create draft invoice"
              description="Document numbering is issued only at approval time so drafts stay editable and controlled."
            >
              <form className="grid gap-3" onSubmit={handleCreateInvoice}>
                <label className="text-sm text-muted-foreground">
                  Invoice date
                  <input
                    type="date"
                    value={form.invoice_date}
                    onChange={(event) => setForm((current) => ({ ...current, invoice_date: event.target.value }))}
                    className={accountingFieldClassName()}
                  />
                </label>
                <label className="text-sm text-muted-foreground">
                  Recipient name
                  <input
                    value={form.recipient_name}
                    onChange={(event) => setForm((current) => ({ ...current, recipient_name: event.target.value }))}
                    className={accountingFieldClassName()}
                  />
                </label>
                <label className="text-sm text-muted-foreground">
                  Recipient address
                  <textarea
                    value={form.recipient_address}
                    onChange={(event) => setForm((current) => ({ ...current, recipient_address: event.target.value }))}
                    className={accountingFieldClassName()}
                  />
                </label>
                <label className="text-sm text-muted-foreground">
                  Recipient GSTIN
                  <input
                    value={form.recipient_gstin}
                    onChange={(event) => setForm((current) => ({ ...current, recipient_gstin: event.target.value }))}
                    className={accountingFieldClassName()}
                  />
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-sm text-muted-foreground">
                    Taxable value
                    <input
                      value={form.subtotal_taxable}
                      onChange={(event) => setForm((current) => ({ ...current, subtotal_taxable: event.target.value }))}
                      className={accountingFieldClassName()}
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Supply kind
                    <select
                      value={form.supply_kind}
                      onChange={(event) => setForm((current) => ({ ...current, supply_kind: event.target.value as "INTRA" | "INTER" }))}
                      className={accountingFieldClassName()}
                    >
                      <option value="INTRA">INTRA</option>
                      <option value="INTER">INTER</option>
                    </select>
                  </label>
                  <label className="text-sm text-muted-foreground">
                    CGST
                    <input
                      value={form.cgst_amount}
                      onChange={(event) => setForm((current) => ({ ...current, cgst_amount: event.target.value }))}
                      className={accountingFieldClassName()}
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    SGST
                    <input
                      value={form.sgst_amount}
                      onChange={(event) => setForm((current) => ({ ...current, sgst_amount: event.target.value }))}
                      className={accountingFieldClassName()}
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    IGST
                    <input
                      value={form.igst_amount}
                      onChange={(event) => setForm((current) => ({ ...current, igst_amount: event.target.value }))}
                      className={accountingFieldClassName()}
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    HSN/SAC
                    <input
                      value={form.hsn_sac}
                      onChange={(event) => setForm((current) => ({ ...current, hsn_sac: event.target.value }))}
                      className={accountingFieldClassName()}
                    />
                  </label>
                </div>
                <label className="text-sm text-muted-foreground">
                  Line description
                  <input
                    value={form.line_description}
                    onChange={(event) => setForm((current) => ({ ...current, line_description: event.target.value }))}
                    className={accountingFieldClassName()}
                  />
                </label>
                <label className="text-sm text-muted-foreground">
                  Notes
                  <textarea
                    value={form.notes}
                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                    className={accountingFieldClassName()}
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-xl border border-slate-900/10 bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                >
                  Create Draft Invoice
                </button>
              </form>
            </WorkspaceSection>
          </div>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
