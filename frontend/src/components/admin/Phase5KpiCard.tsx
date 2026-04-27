"use client";

import Link from "next/link";

export default function Phase5KpiCard({
  card,
}: {
  card: {
    label: string;
    value: string | number;
    source?: string;
    severity?: string;
    detail_url?: string;
    empty_reason?: string | null;
  };
}) {
  const content = (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-foreground">{card.label}</span>
        <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold">{card.severity || "INFO"}</span>
      </div>
      <div className="mt-2 text-lg font-bold text-foreground">{String(card.value)}</div>
      <div className="mt-1 text-xs text-muted-foreground">Source: {card.source || "unknown"}</div>
      {card.empty_reason ? <div className="mt-1 text-xs text-muted-foreground">{card.empty_reason}</div> : null}
    </div>
  );
  if (card.detail_url) {
    return (
      <Link href={card.detail_url} className="block">
        {content}
      </Link>
    );
  }
  return content;
}

