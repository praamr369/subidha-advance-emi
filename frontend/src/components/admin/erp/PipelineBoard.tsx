"use client";

import type { ErpCard } from "@/services/admin-erp";
import { QueueCard } from "./QueueCard";

export function PipelineBoard({
  title,
  cards,
}: {
  title: string;
  cards: ErpCard[];
}) {
  return (
    <section className="rounded-xl border border-border bg-[#fffaf5] p-5 shadow-[0_20px_34px_-28px_rgba(120,53,15,0.35)]">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <QueueCard key={card.key} card={card} />
        ))}
      </div>
    </section>
  );
}
