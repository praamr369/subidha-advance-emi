"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  DocumentAuditFooter,
  DocumentHeader,
  DocumentMetadataGrid,
  DocumentPage,
  DocumentPartyPanel,
  DocumentSignatureBlock,
  DocumentTitleStrip,
} from "@/components/documents/document-shell";
import { PrintToolbar } from "@/components/documents/print-toolbar";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import { formatDocumentDate, formatDocumentDateTime, joinDocumentLines, safeDocumentText } from "@/lib/documents/formatters";
import { getAdminAmendment, type AmendmentRecord } from "@/services/amendments";
import { type DocumentCopyLabel } from "@/lib/documents/document-theme";

function CardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="document-card my-4 rounded-2xl border border-[#e6d6bd] bg-white p-4">
      <div className="text-[11px] font-black uppercase tracking-[0.12em] text-[#8a5a22]">{title}</div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function KeyValueGrid({ items }: { items: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item, index) => (
        <div key={index}>
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">{item.label}</div>
          <div className="mt-1 text-sm font-semibold text-[#2f2418]">{item.value || "—"}</div>
        </div>
      ))}
    </div>
  );
}

function safeJson(value?: Record<string, unknown> | null) {
  return JSON.stringify(value && Object.keys(value).length > 0 ? value : {}, null, 2);
}

function valueOrDash(value?: string | number | null): string {
  return value === undefined || value === null || value === "" ? "—" : String(value);
}

export default function DecisionSheetPrintPage({ id }: { id: number }) {
  const [amendment, setAmendment] = useState<AmendmentRecord | null>(null);
  const [copyLabel, setCopyLabel] = useState<DocumentCopyLabel>("Original");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generatedAt = useMemo(() => new Date().toISOString(), []);

  useEffect(() => {
    let mounted = true;
    getAdminAmendment(id)
      .then((payload) => {
        if (!mounted) return;
        setAmendment(payload);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load decision sheet.");
        setAmendment(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) return <ERPLoadingState label="Loading decision sheet..." />;
  if (error || !amendment) {
    return <ERPErrorState title="Unable to load decision sheet" description={error || "The amendment could not be loaded."} />;
  }

  const backHref = `/admin/contract-amendments/${amendment.id}`;
  const printRoute = `/admin/contract-amendments/${amendment.id}/decision-sheet/print`;
  
  const summary = (amendment.decision_sheet_summary as Record<string, unknown>) || {};
  const category = (summary.workflow_category as string) || amendment.workflow_capability?.category || "UNKNOWN";
  
  return (
    <>
      <PrintToolbar copyLabel={copyLabel} onCopyLabelChange={setCopyLabel} backHref={backHref} />
      <DocumentPage>
        <DocumentHeader
          copyLabel={copyLabel}
          documentNo={amendment.amendment_no || `AMD-${amendment.id}`}
          documentDate={formatDocumentDate(amendment.updated_at || amendment.created_at)}
        />

        <DocumentTitleStrip
          title="CONTRACT AMENDMENT DECISION SHEET"
          subtitle="Read-only audit evidence of amendment request, review decision, and workflow capabilities."
          status={amendment.status}
        />

        <DocumentMetadataGrid
          items={[
            { label: "Amendment Ref", value: safeDocumentText(amendment.amendment_no) || `#${amendment.id}` },
            { label: "Contract Ref", value: amendment.subscription_number || amendment.rent_lease_contract_number || "—" },
            { label: "Amendment Type", value: safeDocumentText(amendment.amendment_type) },
            { label: "Workflow Category", value: category },
            { label: "Decision Status", value: amendment.status },
            { label: "Approved/Rejected By", value: valueOrDash(amendment.approved_by_username) },
            { label: "Decision Date", value: formatDocumentDateTime(amendment.approved_at) },
          ]}
        />

        <DocumentPartyPanel
          parties={[
            {
              title: "Customer",
              name: amendment.customer_name,
              phone: amendment.customer_phone,
              address: joinDocumentLines([`Customer ID: ${valueOrDash(amendment.customer)}`]),
            },
            {
              title: "Business",
            },
          ]}
        />

        <CardSection title="Request Summary">
          <p className="text-sm font-medium text-[#2f2418]">{safeDocumentText(amendment.reason)}</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255] mb-1">Requested Values</div>
              <pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-xs">{safeJson(amendment.requested_values || amendment.new_values)}</pre>
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255] mb-1">Approved Decision Values</div>
              <pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-xs">{safeJson(amendment.approved_values)}</pre>
            </div>
          </div>
        </CardSection>

        <CardSection title="Workflow Capability Summary">
          <KeyValueGrid
            items={[
              { label: "Can Execute Directly", value: amendment.workflow_capability?.can_execute_directly ? "Yes" : "No" },
              { label: "Requires Recontract Workflow", value: amendment.workflow_capability?.requires_recontract_workflow ? "Yes" : "No" },
              { label: "Requires Accounting Bridge", value: amendment.workflow_capability?.requires_accounting_bridge ? "Yes" : "No" },
              { label: "Requires Reconciliation Bridge", value: amendment.workflow_capability?.requires_reconciliation_bridge ? "Yes" : "No" },
            ]}
          />
          {summary.blocked_reason ? (
            <p className="mt-3 text-sm font-semibold text-red-700">Blocked Reason: {String(summary.blocked_reason)}</p>
          ) : null}
        </CardSection>

        {category === "PRODUCT_RECONTRACT" && summary.product_recontract_evidence ? (
          <CardSection title="Product Recontract Evidence Summary">
            <pre className="overflow-auto text-xs font-mono bg-muted p-2 rounded">{safeJson(summary.product_recontract_evidence as Record<string, unknown>)}</pre>
          </CardSection>
        ) : null}

        {category === "LUCKY_ID_BATCH_PREVIEW" && summary.lucky_batch_preview ? (
          <CardSection title="Lucky Batch Preview Summary">
            <pre className="overflow-auto text-xs font-mono bg-muted p-2 rounded">{safeJson(summary.lucky_batch_preview as Record<string, unknown>)}</pre>
          </CardSection>
        ) : null}

        {category === "RENT_LEASE_PREVIEW" && summary.rent_lease_preview ? (
          <CardSection title="Rent / Lease Preview Summary">
            <pre className="overflow-auto text-xs font-mono bg-muted p-2 rounded">{safeJson(summary.rent_lease_preview as Record<string, unknown>)}</pre>
          </CardSection>
        ) : null}

        {category === "DEPOSIT_SECURITY_PREVIEW" && summary.deposit_security_preview ? (
          <CardSection title="Deposit / Security Preview Summary">
            <pre className="overflow-auto text-xs font-mono bg-muted p-2 rounded">{safeJson(summary.deposit_security_preview as Record<string, unknown>)}</pre>
          </CardSection>
        ) : null}

        <CardSection title="Protection Statement">
          <p className="text-sm leading-6 text-[#6f5c46]">
            This document is read-only evidence. It does not create payment, receipt, accounting, reconciliation, stock, delivery, lucky draw, waiver, commission, payout, rent/lease demand, deposit, or contract mutation.
          </p>
        </CardSection>

        <DocumentSignatureBlock labels={["Authorized Reviewer Signature", "Date"]} />

        <div className="document-screen-only mt-5 flex justify-between gap-4 text-xs text-[#7c6a56]">
          <Link href={backHref} className="font-semibold text-[#6f4e27] underline-offset-4 hover:underline">
            Back to amendment record
          </Link>
          <span>Source route: {printRoute}</span>
        </div>

        <DocumentAuditFooter generatedAt={generatedAt} />
      </DocumentPage>
    </>
  );
}
