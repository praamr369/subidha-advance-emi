"use client";

import { QuickCreateButton } from "@/components/admin/erp/QuickCreateButton";

export function ActionDrawer({
  actions,
  title = "Solo Admin Mode",
}: {
  title?: string;
  actions: Array<{ label: string; href: string }>;
}) {
  return (
    <section className="sticky top-3 z-10 rounded-xl border border-amber-200 bg-amber-50/80 p-4 backdrop-blur">
      <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-900">{title}</h2>
      <p className="mt-1 text-xs text-amber-900/80">
        Urgent actions first for single-admin operation. Advanced accounting and reports remain available.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((action) => (
          <QuickCreateButton key={`${action.label}-${action.href}`} href={action.href} label={action.label} />
        ))}
      </div>
    </section>
  );
}
