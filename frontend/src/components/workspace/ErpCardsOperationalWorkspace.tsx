"use client";

import { useMemo, useState } from "react";

import { QueueCard } from "@/components/admin/erp/QueueCard";
import EmptyState from "@/components/feedback/EmptyState";
import type { ErpCard } from "@/services/admin-erp";

import { cn } from "@/lib/utils";

import OperationalResizableWorkspace from "./OperationalResizableWorkspace";

export function ErpCardsOperationalWorkspace({
  storageKey,
  boardTitle,
  cards,
  persistLayout = true,
}: {
  storageKey: string;
  boardTitle: string;
  cards: ErpCard[];
  persistLayout?: boolean;
}) {
  const [userSelectedKey, setUserSelectedKey] = useState<string | null>(null);

  const activeKey = useMemo(() => {
    if (cards.length === 0) return null;
    if (userSelectedKey && cards.some((c) => c.key === userSelectedKey)) {
      return userSelectedKey;
    }
    return cards[0].key;
  }, [cards, userSelectedKey]);

  const selected = useMemo(
    () => (activeKey ? cards.find((c) => c.key === activeKey) ?? null : null),
    [cards, activeKey]
  );

  if (cards.length === 0) {
    return (
      <EmptyState
        title="No workspace cards"
        description={`${boardTitle} returned no operational cards.`}
        tone="info"
      />
    );
  }

  return (
    <OperationalResizableWorkspace
      storageKey={storageKey}
      persistLayout={persistLayout}
      defaultLeftPercent={34}
      minLeftPercent={22}
      minRightPercent={36}
      left={
        <section className="flex h-full min-h-[260px] flex-col rounded-xl border border-border bg-[#fffaf5] p-4 shadow-[0_14px_26px_-24px_rgba(120,53,15,0.25)]">
          <h2 className="text-base font-semibold text-foreground">{boardTitle}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Pick a lane to open the full operational card preview.
          </p>
          <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {cards.map((card) => {
              const active = card.key === activeKey;
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => setUserSelectedKey(card.key)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left text-sm transition",
                    active
                      ? "border-foreground bg-card shadow-sm"
                      : "border-transparent bg-card hover:bg-card"
                  )}
                >
                  <div className="font-semibold text-foreground">{card.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {(card.value ?? card.count) ?? "—"} · {card.severity}
                  </div>
                  <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                    {card.source}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      }
      right={
        <section className="min-h-[260px] rounded-xl border border-border bg-[#fffaf5] p-2 shadow-[0_14px_26px_-24px_rgba(120,53,15,0.25)]">
          {selected ? (
            <QueueCard card={selected} />
          ) : (
            <div className="p-4">
              <EmptyState
                title="Select a card"
                description="Choose an operational lane from the list."
                tone="info"
              />
            </div>
          )}
        </section>
      }
    />
  );
}
