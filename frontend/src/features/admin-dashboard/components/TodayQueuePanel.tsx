"use client";

import { useMemo, useState } from "react";
import { CircleDollarSign } from "lucide-react";

import ErrorState from "@/components/feedback/ErrorState";
import EmptyState from "@/components/feedback/EmptyState";
import CollectPaymentDrawer from "@/features/collections/components/CollectPaymentDrawer";
import { useTodayQueue } from "@/features/admin-dashboard/hooks/useTodayQueue";

export type CollectionQueueItem = {
  id?: number | string | null;
  emi_id?: number | null;
  subscription_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  amount_due?: number | string | null;
  due_date?: string | null;
  batch_code?: string | null;
  lucky_number?: number | null;
  status?: string | null;
};

type TodayQueuePanelProps = {
  items?: CollectionQueueItem[];
  title?: string;
  subtitle?: string;
};

function formatAmount(value?: number | string | null): string {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  return numeric.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function buildQueueItemKey(item: CollectionQueueItem, index: number): string {
  return [
    item.id ?? "no-id",
    item.emi_id ?? "no-emi",
    item.subscription_id ?? "no-sub",
    item.customer_name ?? "no-customer",
    item.due_date ?? "no-date",
    index,
  ].join(":");
}

export default function TodayQueuePanel({
  items,
  title = "Today Queue",
  subtitle = "EMIs available for collection workflow.",
}: TodayQueuePanelProps) {
  const [selectedItem, setSelectedItem] = useState<CollectionQueueItem | null>(null);
  const { data, isLoading, isError, error } = useTodayQueue();

  const normalizedItems = useMemo(() => items ?? data ?? [], [items, data]);

  return (
    <>
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <div className="rounded-xl bg-muted p-2 text-foreground">
            <CircleDollarSign className="h-5 w-5" />
          </div>
        </div>

        {isLoading && !items ? (
          <div className="rounded-xl border border-border bg-muted/40 px-4 py-8 text-sm text-muted-foreground">
            Loading today queue...
          </div>
        ) : isError && !items ? (
          <ErrorState
            title="Unable to load today queue"
            description={error instanceof Error ? error.message : "Request failed."}
          />
        ) : normalizedItems.length === 0 ? (
          <EmptyState
            title="No collection items"
            description="No collection queue items are available right now."
          />
        ) : (
          <div className="space-y-3">
            {normalizedItems.map((item, index) => {
              const emiId = item.emi_id ?? item.id ?? null;
              const rowKey = buildQueueItemKey(item, index);

              return (
                <div
                  key={rowKey}
                  className="flex flex-col gap-4 rounded-2xl border border-border bg-background p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="text-sm font-semibold text-foreground">
                      {item.customer_name || "Unknown customer"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      EMI #{emiId ?? "—"} · Subscription #{item.subscription_id ?? "—"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Batch {item.batch_code || "—"} · Lucky #{item.lucky_number ?? "—"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Phone: {item.customer_phone || "—"} · Due: {formatDate(item.due_date)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Status: {item.status || "—"}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 md:min-w-[220px] md:justify-end">
                    <div className="text-right">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Amount Due
                      </div>
                      <div className="text-base font-semibold text-foreground">
                        ₹ {formatAmount(item.amount_due)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedItem(item)}
                      className="rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90"
                    >
                      Collect
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <CollectPaymentDrawer
        open={Boolean(selectedItem)}
        emiId={
          selectedItem?.emi_id ??
          (typeof selectedItem?.id === "number" ? selectedItem.id : null)
        }
        suggestedAmount={selectedItem?.amount_due ?? null}
        customerName={selectedItem?.customer_name ?? undefined}
        subscriptionLabel={
          selectedItem?.subscription_id
            ? `#${selectedItem.subscription_id}`
            : undefined
        }
        onClose={() => setSelectedItem(null)}
        onCollected={() => setSelectedItem(null)}
      />
    </>
  );
}
