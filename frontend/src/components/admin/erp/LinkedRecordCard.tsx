"use client";

import Link from "next/link";

export function LinkedRecordCard({
  title,
  subtitle,
  status,
  href,
}: {
  title: string;
  subtitle: string;
  status: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-white/80 bg-white/80 px-4 py-3 transition hover:-translate-y-0.5 hover:bg-white"
    >
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
      <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">{status}</div>
    </Link>
  );
}
