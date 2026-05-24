import type { ReactNode } from "react";

import { subidhaDocumentTheme, type DocumentCopyLabel } from "@/lib/documents/document-theme";
import { formatDocumentDateTime, safeDocumentText } from "@/lib/documents/formatters";

type MetadataItem = {
  label: string;
  value: ReactNode;
};

type PartyPanel = {
  title: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gstin?: string | null;
};

type AmountRow = {
  label: string;
  value: ReactNode;
  strong?: boolean;
  danger?: boolean;
};

export type DocumentLineItem = {
  key: string | number;
  description: ReactNode;
  code?: ReactNode;
  quantity?: ReactNode;
  rate?: ReactNode;
  discount?: ReactNode;
  tax?: ReactNode;
  total?: ReactNode;
};

export function DocumentPage({
  children,
  watermark,
}: {
  children: ReactNode;
  watermark?: string | null;
}) {
  return (
    <main className="document-screen fixed inset-0 z-[1000] min-h-screen overflow-y-auto bg-[#f4eadb] px-4 pb-8 pt-24 print:static print:z-auto print:overflow-visible print:bg-white print:p-0">
      <style jsx global>{`
        @page {
          size: A4;
          margin: 12mm;
        }
        .document-screen,
        .document-screen * {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .document-screen-only {
          display: block;
        }
        @media print {
          html,
          body {
            width: 210mm;
            min-height: 297mm;
            background: #ffffff !important;
          }
          .print-toolbar,
          .document-screen-only,
          header:not(.document-header),
          nav,
          aside,
          [data-document-link-strip],
          [data-dashboard-shell],
          [data-dashboard-sidebar],
          [data-dashboard-topbar],
          [data-operational-action],
          [data-print-hidden] {
            display: none !important;
            visibility: hidden !important;
          }
          body * {
            visibility: hidden !important;
          }
          .document-screen,
          .document-screen *,
          .print-document,
          .print-document * {
            visibility: visible !important;
          }
          .document-screen {
            display: block !important;
            position: static !important;
            inset: auto !important;
            width: auto !important;
            min-height: auto !important;
            overflow: visible !important;
            background: #ffffff !important;
          }
          .print-document {
            position: static !important;
            width: 186mm !important;
            max-width: 186mm !important;
            margin: 0 auto !important;
            box-shadow: none !important;
            color: #2f2418 !important;
            background: #ffffff !important;
          }
          .document-no-break,
          .document-card,
          .document-signature,
          .document-amount-summary,
          tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          thead {
            display: table-header-group;
          }
          tfoot {
            display: table-footer-group;
          }
          th {
            color: #2f2418 !important;
            background: #f5ead8 !important;
          }
          .document-card,
          .document-amount-summary,
          .document-signature {
            background: #ffffff !important;
            border-color: #d9c39c !important;
          }
          .document-print-footer {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: #ffffff !important;
          }
          .document-watermark {
            color: rgba(185, 28, 28, 0.12) !important;
            border-color: rgba(254, 202, 202, 0.35) !important;
          }
        }
      `}</style>
      <section className="print-document relative mx-auto w-full max-w-[210mm] overflow-hidden rounded-[18px] border border-[#e6d6bd] bg-[#fffaf0] text-[#2f2418] shadow-2xl print:max-w-none print:rounded-none print:border-0 print:bg-white print:shadow-none">
        {watermark ? (
          <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden" aria-hidden="true">
            <div className="document-watermark rotate-[-28deg] select-none border-[6px] border-red-200 px-12 py-5 text-7xl font-black uppercase tracking-[0.22em] text-red-200/40 print:text-red-200/30">
              {watermark}
            </div>
          </div>
        ) : null}
        <div className="relative z-10 p-8 print:p-0">{children}</div>
      </section>
    </main>
  );
}

export function DocumentHeader({
  copyLabel,
  documentNo,
  documentDate,
}: {
  copyLabel: DocumentCopyLabel;
  documentNo?: string | null;
  documentDate?: string | null;
}) {
  const theme = subidhaDocumentTheme;
  return (
    <header className="document-header document-no-break border-b-4 border-[#8a5a22] pb-5">
      <div className="flex items-start justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#d9c39c] bg-white text-xl font-black text-[#7b4c1f]">
            SF
          </div>
          <div>
            <div className="text-2xl font-black uppercase tracking-[0.08em] text-[#5e3818]">
              {theme.businessName}
            </div>
            <div className="mt-1 whitespace-pre-line text-sm leading-5 text-[#6f5c46]">
              {theme.addressLines.join("\n")}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-[#6f5c46]">
              <span>Phone: {theme.phone}</span>
              <span>Email: {theme.email}</span>
              <span>Web: {theme.website}</span>
            </div>
          </div>
        </div>
        <div className="min-w-[190px] rounded-2xl border border-[#d9c39c] bg-white p-4 text-right">
          <div className="inline-flex rounded-full border border-[#c99a47] bg-[#fff2cf] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#6f4e27]">
            {copyLabel}
          </div>
          <div className="mt-3 text-xs uppercase text-[#7c6a56]">Document No.</div>
          <div className="font-bold text-[#2f2418]">{safeDocumentText(documentNo)}</div>
          <div className="mt-2 text-xs uppercase text-[#7c6a56]">Date</div>
          <div className="font-semibold text-[#2f2418]">{safeDocumentText(documentDate)}</div>
        </div>
      </div>
    </header>
  );
}

export function DocumentTitleStrip({
  title,
  subtitle,
  status,
}: {
  title: string;
  subtitle?: string;
  status?: string | null;
}) {
  return (
    <div className="document-no-break my-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#6f4e27] bg-[#6f4e27] px-5 py-4 text-white">
      <div>
        <h1 className="text-xl font-black uppercase tracking-[0.16em]">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-white/90">{subtitle}</p> : null}
      </div>
      {status ? (
        <span className="rounded-full border border-white/40 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide">
          {status}
        </span>
      ) : null}
    </div>
  );
}

export function DocumentMetadataGrid({ items }: { items: MetadataItem[] }) {
  return (
    <section className="document-card grid gap-3 rounded-2xl border border-[#e6d6bd] bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">{item.label}</div>
          <div className="mt-1 text-sm font-semibold text-[#2f2418]">{item.value || "—"}</div>
        </div>
      ))}
    </section>
  );
}

export function DocumentPartyPanel({ parties }: { parties: PartyPanel[] }) {
  return (
    <section className="my-4 grid gap-4 md:grid-cols-2">
      {parties.map((party) => (
        <div key={party.title} className="document-card rounded-2xl border border-[#e6d6bd] bg-white p-4">
          <div className="text-[11px] font-black uppercase tracking-[0.12em] text-[#8a5a22]">{party.title}</div>
          <div className="mt-2 text-base font-bold text-[#2f2418]">{safeDocumentText(party.name)}</div>
          <div className="mt-1 text-sm text-[#6f5c46]">{safeDocumentText(party.phone)}</div>
          {party.email ? <div className="text-sm text-[#6f5c46]">{party.email}</div> : null}
          {party.address ? <div className="mt-2 whitespace-pre-line text-sm leading-5 text-[#6f5c46]">{party.address}</div> : null}
          {party.gstin ? <div className="mt-2 text-xs font-semibold text-[#6f4e27]">GSTIN: {party.gstin}</div> : null}
        </div>
      ))}
    </section>
  );
}

export function DocumentLineItemsTable({ items }: { items: DocumentLineItem[] }) {
  return (
    <section className="document-card my-4 overflow-hidden rounded-2xl border border-[#d9c39c] bg-white">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[#f0dfbd] text-left text-[11px] uppercase tracking-[0.1em] text-[#5e3818]">
            <th className="px-3 py-3">Item</th>
            <th className="px-3 py-3 text-right">Qty</th>
            <th className="px-3 py-3 text-right">Rate</th>
            <th className="px-3 py-3 text-right">Discount</th>
            <th className="px-3 py-3 text-right">Tax</th>
            <th className="px-3 py-3 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.key} className="border-t border-[#eadcc6] align-top">
              <td className="px-3 py-3">
                <div className="font-semibold text-[#2f2418]">{item.description}</div>
                {item.code ? <div className="mt-1 text-xs text-[#7c6a56]">{item.code}</div> : null}
              </td>
              <td className="px-3 py-3 text-right">{item.quantity || "—"}</td>
              <td className="px-3 py-3 text-right">{item.rate || "—"}</td>
              <td className="px-3 py-3 text-right">{item.discount || "—"}</td>
              <td className="px-3 py-3 text-right">{item.tax || "—"}</td>
              <td className="px-3 py-3 text-right font-bold">{item.total || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function DocumentAmountSummary({ rows }: { rows: AmountRow[] }) {
  return (
    <section className="document-amount-summary document-card ml-auto w-full max-w-sm rounded-2xl border border-[#d9c39c] bg-white p-4">
      {rows.map((row) => (
        <div
          key={row.label}
          className={`flex items-center justify-between border-b border-[#eadcc6] py-2 last:border-0 ${
            row.strong ? "text-base font-black" : "text-sm"
          } ${row.danger ? "text-red-700" : "text-[#2f2418]"}`}
        >
          <span>{row.label}</span>
          <span>{row.value}</span>
        </div>
      ))}
    </section>
  );
}

export function DocumentTermsBlock({ terms }: { terms?: string[] }) {
  const finalTerms = terms?.length ? terms : subidhaDocumentTheme.defaultTerms;
  return (
    <section className="document-card my-5 rounded-2xl border border-[#e6d6bd] bg-[#fff6e4] p-4">
      <div className="text-xs font-black uppercase tracking-[0.12em] text-[#6f4e27]">Terms & Notes</div>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5 text-[#6f5c46]">
        {finalTerms.map((term) => (
          <li key={term}>{term}</li>
        ))}
      </ol>
    </section>
  );
}

export function DocumentSignatureBlock({ labels }: { labels: string[] }) {
  return (
    <section className="document-no-break mt-8 grid gap-6 sm:grid-cols-2">
      {labels.map((label) => (
        <div key={label} className="document-signature pt-10 text-center">
          <div className="border-t border-[#8a7255] pt-2 text-xs font-bold uppercase tracking-[0.12em] text-[#6f4e27]">
            {label}
          </div>
        </div>
      ))}
    </section>
  );
}

export function DocumentAuditFooter({ generatedAt }: { generatedAt?: string }) {
  return (
    <footer className="document-print-footer mt-6 border-t border-[#e6d6bd] bg-white pt-3 text-center text-[10px] leading-4 text-[#7c6a56]">
      Generated by SUBIDHA CORE · {formatDocumentDateTime(generatedAt || new Date())} · Audit copy for business records
    </footer>
  );
}
