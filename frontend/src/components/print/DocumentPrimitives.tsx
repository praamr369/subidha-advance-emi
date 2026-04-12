import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type PrintField = {
  label: string;
  value: ReactNode;
  emphasize?: boolean;
};

export function PrintFieldCard({
  label,
  value,
  emphasize = false,
  className,
}: PrintField & { className?: string }) {
  return (
    <div
      className={cn(
        "print-doc-card rounded-xl border border-slate-300 px-3.5 py-2.5",
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
  if (fields.length === 0) return null;

  return (
    <section className={cn("print-doc-section space-y-2.5", className)}>
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
        {title}
      </h3>
      <div className={cn("grid gap-2.5", columns)}>
        {fields.map((field, index) => (
          <PrintFieldCard key={`${field.label}-${index}`} {...field} />
        ))}
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
