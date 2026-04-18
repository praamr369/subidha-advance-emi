import type { ReactNode } from "react";

import { brandConfig } from "@/config/brand";
import { isDisplayEmpty } from "@/lib/print/formatters";
import { cn } from "@/lib/utils";

export type DocumentField = {
  label: string;
  value: ReactNode;
  emphasize?: boolean;
};

export type DocumentLineItem = {
  description: ReactNode;
  quantity?: ReactNode;
  rate?: ReactNode;
  amount?: ReactNode;
  note?: ReactNode;
};

type Tone = "default" | "success" | "warning" | "danger" | "info";

function toneClassName(tone: Tone): string {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "danger":
      return "border-red-200 bg-red-50 text-red-800";
    case "info":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "default":
    default:
      return "border-slate-300 bg-slate-100 text-slate-800";
  }
}

function filterVisibleFields(fields: DocumentField[]): DocumentField[] {
  return fields.filter((field) => !isDisplayEmpty(field.value));
}

export function PrintablePaper({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("document-workspace w-full", className)}>
      <div className="document-workspace-inner mx-auto w-full max-w-[940px]">{children}</div>
    </div>
  );
}

export function DocumentShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "receipt-document document-shell print-doc-shell rounded-[1.4rem] border border-slate-300 bg-white",
        className
      )}
    >
      <div className="space-y-4 p-4 sm:p-6">{children}</div>
    </section>
  );
}

export function StatusBadge({
  label,
  tone = "default",
  className,
}: {
  label: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "print-doc-status inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
        toneClassName(tone),
        className
      )}
    >
      {label}
    </span>
  );
}

export function BrandMasthead({
  branchLabel,
  className,
}: {
  branchLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-start gap-3", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={brandConfig.publicLogoSrc}
        alt={brandConfig.publicLogoAlt}
        className="h-12 w-12 rounded-xl border border-slate-300 bg-white object-contain p-2"
      />
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
          {brandConfig.companyName}
        </div>
        <div className="text-[12px] font-medium text-slate-900">
          {brandConfig.publicProgramName}
        </div>
        <div className="text-[11px] text-slate-600">
          {branchLabel || brandConfig.publicBranchLocation}
        </div>
      </div>
    </div>
  );
}

export function DocumentTitleBar({
  title,
  subtitle,
  status,
}: {
  title: string;
  subtitle?: string;
  status?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-[1.34rem] font-semibold tracking-tight text-slate-950 sm:text-[1.48rem]">
          {title}
        </h2>
        {status ? <div>{status}</div> : null}
      </div>
      {subtitle ? <p className="mt-1.5 text-[13px] leading-5 text-slate-700">{subtitle}</p> : null}
    </div>
  );
}

export function DocumentMetaGrid({
  fields,
  className,
}: {
  fields: DocumentField[];
  className?: string;
}) {
  const visibleFields = filterVisibleFields(fields);
  if (visibleFields.length === 0) return null;

  return (
    <div
      className={cn(
        "print-doc-meta rounded-xl border border-slate-300 bg-white px-3.5 py-3",
        className
      )}
    >
      <div className="grid gap-1.5">
        {visibleFields.map((field) => (
          <SafeValueRow key={field.label} label={field.label} value={field.value} compact />
        ))}
      </div>
    </div>
  );
}

export function DocumentHeader({
  title,
  subtitle,
  status,
  metaFields = [],
  branchLabel,
  className,
}: {
  title: string;
  subtitle?: string;
  status?: ReactNode;
  metaFields?: DocumentField[];
  branchLabel?: string;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "print-doc-section grid gap-4 border-b border-slate-300 pb-4",
        className
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <BrandMasthead branchLabel={branchLabel} />
          <DocumentTitleBar title={title} subtitle={subtitle} status={status} />
        </div>
        <DocumentMetaGrid fields={metaFields} className="lg:min-w-[290px]" />
      </div>
    </header>
  );
}

export function SafeValueRow({
  label,
  value,
  emphasize = false,
  className,
  compact = false,
}: DocumentField & {
  className?: string;
  compact?: boolean;
}) {
  if (isDisplayEmpty(value)) return null;

  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
        {label}
      </span>
      <span
        className={cn(
          "text-right text-slate-900",
          compact ? "text-[12px]" : "text-[13px]",
          emphasize ? "print-doc-amount font-semibold" : "font-medium"
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function ReceiptFieldGrid({
  title,
  fields,
  className,
  columns = "sm:grid-cols-2",
}: {
  title: string;
  fields: DocumentField[];
  className?: string;
  columns?: string;
}) {
  const visibleFields = filterVisibleFields(fields);
  if (visibleFields.length === 0) return null;

  return (
    <section className={cn("print-doc-section space-y-2.5", className)}>
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
        {title}
      </h3>
      <div className={cn("receipt-document-grid grid gap-2.5", columns)}>
        {visibleFields.map((field) => (
          <div key={field.label} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              {field.label}
            </div>
            <div
              className={cn(
                "mt-1 text-[13px] leading-5 text-slate-900",
                field.emphasize ? "print-doc-amount font-semibold" : "font-medium"
              )}
            >
              {field.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PartyInfoBlock({
  fields,
  title = "Party Information",
  className,
}: {
  fields: DocumentField[];
  title?: string;
  className?: string;
}) {
  return <ReceiptFieldGrid title={title} fields={fields} className={className} />;
}

export function CustomerInfoBlock({
  fields,
  title = "Customer Information",
  className,
}: {
  fields: DocumentField[];
  title?: string;
  className?: string;
}) {
  return <ReceiptFieldGrid title={title} fields={fields} className={className} />;
}

export function LineItemsTable({
  items,
  title = "Item Summary",
  className,
  amountColumnLabel = "Amount",
}: {
  items: DocumentLineItem[];
  title?: string;
  className?: string;
  amountColumnLabel?: string;
}) {
  const visibleItems = items.filter((item) => !isDisplayEmpty(item.description));
  if (visibleItems.length === 0) return null;

  return (
    <section className={cn("print-doc-section space-y-2.5", className)}>
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
        {title}
      </h3>
      <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white">
        <table className="min-w-full border-collapse text-[12px] leading-5">
          <thead className="print-doc-accent">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                Description
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                Qty
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                Rate
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                {amountColumnLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item, index) => (
              <tr key={`${index}-${String(item.description)}`} className="border-t border-slate-200">
                <td className="px-3 py-2 text-slate-900">
                  <div className="font-medium">{item.description}</div>
                  {item.note && !isDisplayEmpty(item.note) ? (
                    <div className="mt-0.5 text-[11px] text-slate-600">{item.note}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right text-slate-700">{item.quantity ?? "—"}</td>
                <td className="px-3 py-2 text-right text-slate-700">{item.rate ?? "—"}</td>
                <td className="px-3 py-2 text-right font-semibold text-slate-900">
                  {item.amount ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function SummaryBlock({
  title = "Summary",
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("print-doc-section space-y-2.5", className)}>
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function AmountSummary({
  rows,
  title = "Amount Summary",
  className,
}: {
  rows: DocumentField[];
  title?: string;
  className?: string;
}) {
  const visibleRows = filterVisibleFields(rows);
  if (visibleRows.length === 0) return null;

  return (
    <SummaryBlock title={title} className={className}>
      <div className="overflow-hidden rounded-lg border border-slate-300 bg-white">
        <table className="w-full border-collapse text-[12px] leading-5">
          <tbody>
            {visibleRows.map((row, index) => (
              <tr key={`${row.label}-${index}`} className="border-t border-slate-200 first:border-t-0">
                <td className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  {row.label}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right text-slate-900",
                    row.emphasize ? "print-doc-amount text-[13px] font-semibold" : "font-medium"
                  )}
                >
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SummaryBlock>
  );
}

export function PaymentInfoBlock({
  fields,
  title = "Payment Information",
  className,
}: {
  fields: DocumentField[];
  title?: string;
  className?: string;
}) {
  return <ReceiptFieldGrid title={title} fields={fields} className={className} />;
}

export function BankQrBlock({
  bankFields = [],
  qrLabel,
  qrReference,
  className,
}: {
  bankFields?: DocumentField[];
  qrLabel?: string;
  qrReference?: string;
  className?: string;
}) {
  const visibleBankFields = filterVisibleFields(bankFields);
  const showQr = !isDisplayEmpty(qrLabel) || !isDisplayEmpty(qrReference);
  if (!showQr && visibleBankFields.length === 0) return null;

  return (
    <section className={cn("print-doc-section", className)}>
      <div className="grid gap-3 md:grid-cols-[1.5fr_1fr]">
        <ReceiptFieldGrid
          title="Bank / Transfer Reference"
          fields={visibleBankFields}
          columns="sm:grid-cols-2"
          className="m-0"
        />
        {showQr ? (
          <div className="rounded-xl border border-slate-300 bg-white p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              QR / Payment Reference
            </div>
            <div className="mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-[12px] text-slate-700">
              <div className="font-semibold text-slate-900">{qrLabel}</div>
              {!isDisplayEmpty(qrReference) ? (
                <div className="mt-1 text-[11px] text-slate-600">{qrReference}</div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function TermsBlock({
  terms,
  title = "Terms And Notes",
  className,
}: {
  terms: Array<ReactNode>;
  title?: string;
  className?: string;
}) {
  const visibleTerms = terms.filter((term) => !isDisplayEmpty(term));
  if (visibleTerms.length === 0) return null;

  return (
    <section
      className={cn(
        "print-doc-note print-doc-section rounded-xl border border-slate-300 bg-white px-3.5 py-3",
        className
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
        {title}
      </div>
      <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[12px] leading-5 text-slate-700">
        {visibleTerms.map((term, index) => (
          <li key={`term-${index}`}>{term}</li>
        ))}
      </ul>
    </section>
  );
}

export function SignatureBlock({
  leftLabel = "Customer Signature",
  rightLabel = "Authorized Signatory",
  leftHint = "Signature",
  rightHint = "Stamp / Signature",
  className,
}: {
  leftLabel?: string;
  rightLabel?: string;
  leftHint?: string;
  rightHint?: string;
  className?: string;
}) {
  return (
    <section className={cn("print-doc-section grid gap-4 sm:grid-cols-2", className)}>
      <div className="rounded-lg border border-slate-300 bg-white px-3.5 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
          {leftLabel}
        </div>
        <div className="mt-8 border-t border-slate-300 pt-2 text-[11px] text-slate-600">{leftHint}</div>
      </div>
      <div className="rounded-lg border border-slate-300 bg-white px-3.5 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
          {rightLabel}
        </div>
        <div className="mt-8 border-t border-slate-300 pt-2 text-[11px] text-slate-600">{rightHint}</div>
      </div>
    </section>
  );
}

export function DocumentFooter({
  leftText,
  rightText = "Authorized signatory: __________________",
  className,
}: {
  leftText: ReactNode;
  rightText?: ReactNode;
  className?: string;
}) {
  return (
    <footer
      className={cn(
        "print-doc-section flex items-end justify-between gap-3 border-t border-slate-300 pt-3 text-[11px] text-slate-600",
        className
      )}
    >
      <span>{leftText}</span>
      <span>{rightText}</span>
    </footer>
  );
}

