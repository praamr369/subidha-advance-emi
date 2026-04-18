import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type PrintField = {
  label: string;
  value: ReactNode;
  emphasize?: boolean;
};

function isEmptyToken(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "number") return !Number.isFinite(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return true;
    return trimmed === "—" || trimmed === "-" || trimmed.toLowerCase() === "n/a";
  }
  return false;
}

function isEmptyFieldValue(value: ReactNode): boolean {
  if (isEmptyToken(value)) return true;

  // If a field value is an array, treat it as empty only when all entries are empty.
  if (Array.isArray(value)) {
    if (value.length === 0) return true;
    return value.every((item) => isEmptyFieldValue(item as ReactNode));
  }

  return false;
}

export function PrintFieldCard({
  label,
  value,
  emphasize = false,
  className,
}: PrintField & { className?: string }) {
  return (
    <div
      className={cn(
        "print-doc-card rounded-lg border border-slate-300 px-3.5 py-2.5",
        className
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-[13px] leading-5 text-slate-900",
          emphasize ? "print-doc-amount font-semibold" : "font-medium"
        )}
      >
        {value}
      </div>
    </div>
  );
}

type PrintFieldGridProps = {
  title: string;
  fields: PrintField[];
  columns?: string;
  className?: string;
};

export function PrintFieldGrid({
  title,
  fields,
  columns = "md:grid-cols-2 xl:grid-cols-4",
  className,
}: PrintFieldGridProps) {
  const visibleFields = fields.filter((field) => !isEmptyFieldValue(field.value));
  if (visibleFields.length === 0) return null;

  return (
    <section className={cn("print-doc-section space-y-2.5", className)}>
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
        {title}
      </h3>
      <div className={cn("grid gap-2.5", columns)}>
        {visibleFields.map((field, index) => (
          <PrintFieldCard key={`${field.label}-${index}`} {...field} />
        ))}
      </div>
    </section>
  );
}

export function PrintKeyValueGrid({
  title,
  rows,
  columns = "sm:grid-cols-2",
  className,
}: {
  title: string;
  rows: PrintField[];
  columns?: string;
  className?: string;
}) {
  const visibleRows = rows.filter((row) => !isEmptyFieldValue(row.value));
  if (visibleRows.length === 0) return null;

  return (
    <section className={cn("print-doc-section space-y-2.5", className)}>
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
        {title}
      </h3>
      <div className={cn("grid gap-2.5", columns)}>
        {visibleRows.map((row, index) => (
          <div
            key={`${row.label}-${index}`}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2.5"
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              {row.label}
            </div>
            <div
              className={cn(
                "mt-1 text-[13px] leading-5 text-slate-900",
                row.emphasize ? "print-doc-amount font-semibold" : "font-medium"
              )}
            >
              {row.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PrintAmountSummary({
  title = "Summary",
  rows,
  className,
}: {
  title?: string;
  rows: PrintField[];
  className?: string;
}) {
  const visibleRows = rows.filter((row) => !isEmptyFieldValue(row.value));
  if (visibleRows.length === 0) return null;

  return (
    <section className={cn("print-doc-section", className)}>
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
        {title}
      </h3>
      <div className="mt-2 overflow-hidden rounded-lg border border-slate-300 bg-white">
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
                    row.emphasize ? "print-doc-amount font-semibold" : "font-medium"
                  )}
                >
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PrintStatusBadge({
  label,
  toneClassName,
}: {
  label: string;
  toneClassName?: string;
}) {
  return (
    <span
      className={cn(
        "print-doc-status inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.13em]",
        toneClassName || "border-slate-300 bg-slate-100 text-slate-800"
      )}
    >
      {label}
    </span>
  );
}

export function PrintNote({
  title = "Notes",
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "print-doc-note print-doc-section rounded-xl border border-slate-300 px-3.5 py-3 text-sm text-slate-700",
        className
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
        {title}
      </div>
      <div className="mt-1 text-[13px] leading-5">{children}</div>
    </div>
  );
}

export function PrintFooter({
  leftText,
  rightText = "Authorized signatory: __________________",
  className,
}: {
  leftText: ReactNode;
  rightText?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "print-doc-section flex items-end justify-between gap-3 border-t border-slate-300 pt-3 text-[11px] text-slate-600",
        className
      )}
    >
      <span>{leftText}</span>
      <span>{rightText}</span>
    </div>
  );
}

export function PrintSignatureBlock({
  leftLabel = "Customer signature",
  rightLabel = "Authorized signatory",
  className,
}: {
  leftLabel?: string;
  rightLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("print-doc-section grid gap-4 sm:grid-cols-2", className)}>
      <div className="rounded-lg border border-slate-300 bg-white px-3.5 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
          {leftLabel}
        </div>
        <div className="mt-8 border-t border-slate-300 pt-2 text-[11px] text-slate-600">
          Signature
        </div>
      </div>
      <div className="rounded-lg border border-slate-300 bg-white px-3.5 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
          {rightLabel}
        </div>
        <div className="mt-8 border-t border-slate-300 pt-2 text-[11px] text-slate-600">
          Stamp / Signature
        </div>
      </div>
    </div>
  );
}
