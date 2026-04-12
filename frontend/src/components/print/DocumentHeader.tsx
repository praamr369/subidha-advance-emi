import { brandConfig } from "@/config/brand";
import type { ReactNode } from "react";

type DocumentHeaderMetaRow = {
  label: string;
  value: ReactNode;
};

type DocumentHeaderProps = {
  title: string;
  subtitle?: string;
  reference?: string;
  meta?: string;
  metaRows?: DocumentHeaderMetaRow[];
};

export default function DocumentHeader({
  title,
  subtitle,
  reference,
  meta,
  metaRows,
}: DocumentHeaderProps) {
  const fallbackRows: DocumentHeaderMetaRow[] = [];
  if (reference) fallbackRows.push({ label: "Document Reference", value: reference });
  if (meta) fallbackRows.push({ label: "Issued On", value: meta });
  const resolvedMetaRows = metaRows ?? fallbackRows;

  return (
    <div className="print-doc-section flex flex-col gap-4 border-b border-slate-300 pb-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={brandConfig.publicLogoSrc}
          alt={brandConfig.publicLogoAlt}
          className="h-12 w-12 rounded-xl border border-slate-300 bg-white object-contain p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]"
        />
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
            {brandConfig.companyName} · {brandConfig.publicProgramName}
          </div>
          <h2 className="mt-1.5 text-[1.36rem] font-semibold tracking-tight text-slate-950 sm:text-[1.5rem]">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-slate-700">
              {subtitle}
            </p>
          ) : null}
          <p className="mt-1.5 text-[11px] text-slate-600">
            {brandConfig.publicBranchLocation}
          </p>
        </div>
      </div>

      {resolvedMetaRows.length > 0 ? (
        <div className="print-doc-meta rounded-xl border border-slate-300 p-3 lg:min-w-[270px]">
          <div className="space-y-1.5">
            {resolvedMetaRows.map((row, index) => (
              <div key={`${row.label}-${index}`} className="flex items-start justify-between gap-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  {row.label}
                </span>
                <span className="text-right text-[12px] font-medium text-slate-900">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
