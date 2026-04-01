"use client";

import { useMemo, useState } from "react";
import { CircleDollarSign } from "lucide-react";

import CollectPaymentDrawer from "@/features/collections/components/CollectPaymentDrawer";

export type CollectionQueueItem = {
  id: number;
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

type CollectionsWorkspaceProps = {
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

export default function CollectionsWorkspace({
  items = [],
  title = "Collections Workspace",
  subtitle = "Review due EMIs and record collections through the hardened payment workflow.",
}: CollectionsWorkspaceProps) {
  const [selectedItem, setSelectedItem] = useState<CollectionQueueItem | null>(null);

  const normalizedItems = useMemo(() => items ?? [], [items]);

  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-500">{subtitle}</p>
          </div>
          <div className="rounded-xl bg-slate-100 p-2 text-slate-700">
            <CircleDollarSign className="h-5 w-5" />
          </div>
        </div>

        {normalizedItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
            No collection items available.
          </div>
        ) : (
          <div className="space-y-3">
            {normalizedItems.map((item) => {
              const emiId = item.emi_id ?? item.id;

              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="text-sm font-semibold text-slate-900">
                      {item.customer_name || "Unknown customer"}
                    </div>
                    <div className="text-sm text-slate-500">
                      EMI #{emiId} · Subscription #{item.subscription_id ?? "—"}
                    </div>
                    <div className="text-sm text-slate-500">
                      Batch {item.batch_code || "—"} · Lucky #{item.lucky_number ?? "—"}
                    </div>
                    <div className="text-sm text-slate-500">
                      Phone: {item.customer_phone || "—"} · Due: {formatDate(item.due_date)}
                    </div>
                    <div className="text-sm text-slate-500">
                      Status: {item.status || "—"}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 md:min-w-[220px] md:justify-end">
                    <div className="text-right">
                      <div className="text-xs uppercase tracking-wide text-slate-500">
                        Amount Due
                      </div>
                      <div className="text-base font-semibold text-slate-900">
                        ₹ {formatAmount(item.amount_due)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedItem(item)}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
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
        emiId={selectedItem?.emi_id ?? selectedItem?.id ?? null}
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
