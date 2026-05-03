"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import EmptyState from "@/components/feedback/EmptyState";

import OperationalResizableWorkspace from "./OperationalResizableWorkspace";

import { cn } from "@/lib/utils";

export type CrmWorkspaceSectionCard = {
  key: string;
  label: string;
  purpose: string;
  href: string;
  count: number | null;
  status: "loading" | "ready" | "error";
  statusMessage: string;
};

function CrmSectionCardDetail({ card }: { card: CrmWorkspaceSectionCard }) {
  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">{card.label}</h2>
        <span className="text-xs font-medium text-muted-foreground">
          {card.status === "loading"
            ? "Loading"
            : card.status === "error"
              ? "Error"
              : "Ready"}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{card.purpose}</p>
      <p className="mt-3 text-sm text-muted-foreground">{card.statusMessage}</p>
      <div className="mt-5 flex items-center justify-between gap-2">
        <span className="text-2xl font-semibold text-foreground">{card.count ?? "—"}</span>
        <Link
          href={card.href}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted"
        >
          Open
        </Link>
      </div>
    </article>
  );
}

export function CrmOperationalWorkspace({ cards }: { cards: CrmWorkspaceSectionCard[] }) {
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

  const leftPane = (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">CRM lanes</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Registered customers stay separated from CRM parties; pick a lane for detail.
      </p>
      <ul className="mt-4 flex max-h-[min(68vh,620px)] flex-col gap-3 overflow-y-auto pr-1">
        {cards.map((card) => {
          const active = card.key === activeKey;
          return (
            <li key={card.key}>
              <article
                className={cn(
                  "rounded-xl border p-4 transition",
                  active ? "border-foreground bg-muted/35 shadow-sm" : "border-border bg-background"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold text-foreground">{card.label}</div>
                  <span className="text-lg font-semibold text-foreground">{card.count ?? "—"}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{card.statusMessage}</p>
                <button
                  type="button"
                  onClick={() => setUserSelectedKey(card.key)}
                  aria-pressed={active}
                  className="mt-3 text-xs font-semibold text-primary underline-offset-4 hover:underline"
                >
                  Show detail
                </button>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );

  const rightPane = selected ? (
    <CrmSectionCardDetail card={selected} />
  ) : (
    <div className="rounded-xl border border-dashed border-border bg-card/60 p-6">
      <EmptyState
        title="Select a CRM lane"
        description="Choose a workspace card on the left to preview routing context."
        tone="info"
      />
    </div>
  );

  return (
    <OperationalResizableWorkspace
      storageKey="crm-operational-workspace-v1"
      defaultLeftPercent={38}
      minLeftPercent={26}
      minRightPercent={32}
      left={leftPane}
      right={rightPane}
    />
  );
}
