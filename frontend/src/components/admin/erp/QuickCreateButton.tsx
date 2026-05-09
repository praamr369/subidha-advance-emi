"use client";

import Link from "next/link";

export function QuickCreateButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center rounded-xl border border-amber-900/20 bg-amber-900 px-4 text-sm font-semibold text-white transition hover:bg-amber-800"
    >
      {label}
    </Link>
  );
}
