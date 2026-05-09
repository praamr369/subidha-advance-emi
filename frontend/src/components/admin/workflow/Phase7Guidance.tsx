"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";

type GuidanceItem = {
  label: string;
  href: string;
  note: string;
  warning?: string;
};

export default function Phase7Guidance({
  title = "Next step",
  items,
}: {
  title?: string;
  items: GuidanceItem[];
}) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-2xl border border-amber-200/80 bg-[#fffaf5] p-4 shadow-[0_18px_34px_-30px_rgba(120,53,15,0.35)]">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <CheckCircle2 className="h-4 w-4 text-emerald-700" />
        {title}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <Link
            key={`${item.href}:${item.label}`}
            href={item.href}
            className="group rounded-xl border border-border bg-white px-3 py-3 transition hover:border-amber-300 hover:bg-amber-50/70"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">{item.label}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{item.note}</div>
              </div>
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
            </div>
            {item.warning ? (
              <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-900">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {item.warning}
              </div>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}
