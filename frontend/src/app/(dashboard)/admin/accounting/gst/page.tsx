"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { accountingErrorMessage } from "@/components/accounting/shared";
import { listCreditNotes, listDebitNotes, listTaxInvoices } from "@/services/accounting";

export default function AccountingGstHubPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    invoices: 0,
    postedInvoices: 0,
    creditNotes: 0,
    debitNotes: 0,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setLoading(true);
      try {
        const [invoicePayload, creditPayload, debitPayload] = await Promise.all([
          listTaxInvoices(),
          listCreditNotes(),
          listDebitNotes(),
        ]);
        if (cancelled) return;
        setStats({
          invoices: invoicePayload.count,
          postedInvoices: invoicePayload.results.filter((row) => row.status === "POSTED").length,
          creditNotes: creditPayload.count,
          debitNotes: debitPayload.count,
        });
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(accountingErrorMessage(err, "Failed to load GST document controls."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPage();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ERPPageShell
      eyebrow="Accounting · GST"
      title="GST Documents"
      subtitle="GST-ready invoice and note lifecycle controls with consecutive numbering, controlled posting, and additive cancellation through reversal journals."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "GST" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingTaxInvoices, label: "Tax Invoices", variant: "primary" },
        { href: ROUTES.admin.accountingCreditNotes, label: "Credit Notes", variant: "secondary" },
        { href: ROUTES.admin.accountingDebitNotes, label: "Debit Notes", variant: "secondary" },
      ]}
      stats={[
        { label: "Invoices", value: String(stats.invoices), tone: "info" },
        { label: "Posted Invoices", value: String(stats.postedInvoices), tone: "success" },
        { label: "Credit Notes", value: String(stats.creditNotes), tone: "warning" },
        { label: "Debit Notes", value: String(stats.debitNotes) },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      {loading ? <LoadingBlock label="Loading GST document controls..." /> : null}
      {!loading && error ? <ErrorState title="GST controls unavailable" description={error} /> : null}
      {!loading && !error ? (
        <WorkspaceSection
          title="GST Control Surface"
          description="Use the linked registers for draft, approve, post, and cancel flows. Cancellation remains additive through reversal journals only."
          contentClassName="grid gap-3 md:grid-cols-3"
        >
          <Link href={ROUTES.admin.accountingTaxInvoices} className="rounded-xl border border-border bg-background px-4 py-4 text-sm font-medium text-foreground transition hover:-translate-y-0.5 hover:bg-muted/40">
            Tax invoices and posting lifecycle
          </Link>
          <Link href={ROUTES.admin.accountingCreditNotes} className="rounded-xl border border-border bg-background px-4 py-4 text-sm font-medium text-foreground transition hover:-translate-y-0.5 hover:bg-muted/40">
            Credit note register and reversals
          </Link>
          <Link href={ROUTES.admin.accountingDebitNotes} className="rounded-xl border border-border bg-background px-4 py-4 text-sm font-medium text-foreground transition hover:-translate-y-0.5 hover:bg-muted/40">
            Debit note register and reversals
          </Link>
        </WorkspaceSection>
      ) : null}
    </ERPPageShell>
  );
}
