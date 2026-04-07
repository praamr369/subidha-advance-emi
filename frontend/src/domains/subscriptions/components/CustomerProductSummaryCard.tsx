"use client";

import Link from "next/link";

import PublicProductMedia from "@/components/public/PublicProductMedia";
import StatusBadge from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { CustomerSubscription } from "@/services/customer";

type CustomerProductSummaryCardProps = {
  subscription: CustomerSubscription;
  href?: string;
  className?: string;
  compact?: boolean;
};

function money(value?: string | number | null): string {
  return `₹${Number(value ?? 0).toFixed(2)}`;
}

function text(value?: string | null, fallback = "—"): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function luckyLabel(value?: number | null): string {
  return typeof value === "number" ? `#${value}` : "—";
}

function winnerWaiverSummary(subscription: CustomerSubscription): string {
  const winnerMonth =
    subscription.winner_summary?.winner_month ?? subscription.winner_month;
  const waivedAmount =
    subscription.winner_summary?.waived_amount ??
    subscription.financial_summary?.waived_amount ??
    subscription.waived_amount;
  const waivedCount =
    subscription.winner_summary?.waived_emi_count ??
    subscription.waived_emi_count ??
    0;

  if (winnerMonth != null && winnerMonth !== undefined) {
    return `Winner month ${winnerMonth}${Number(waivedAmount ?? 0) > 0 ? ` · Waived ${money(waivedAmount)}` : ""}`;
  }

  if (Number(waivedAmount ?? 0) > 0 || Number(waivedCount) > 0) {
    return `Waiver recorded · ${waivedCount} EMI · ${money(waivedAmount)}`;
  }

  return "No winner or waiver recorded";
}

function CardBody({
  subscription,
  compact,
}: {
  subscription: CustomerSubscription;
  compact: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        compact ? "md:grid-cols-[112px_minmax(0,1fr)]" : "lg:grid-cols-[180px_minmax(0,1fr)]"
      )}
    >
      <PublicProductMedia
        src={subscription.product_image}
        alt={subscription.product_name || "Customer product"}
        sizes={compact ? "112px" : "(min-width: 1024px) 180px, 100vw"}
        className={cn(
          "w-full",
          compact ? "h-28 rounded-[20px]" : "h-44 rounded-[24px]"
        )}
        fallbackLabel="Product media pending"
        badge={subscription.product_code || "Product"}
      />

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Product summary
            </p>
            <h3 className="mt-2 truncate text-lg font-semibold text-slate-950">
              {subscription.product_name || "Linked product"}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {subscription.product_code || "Product code pending"}
            </p>
          </div>
          <StatusBadge status={subscription.status} size={compact ? "sm" : "md"} />
        </div>

        <div
          className={cn(
            "grid gap-3",
            compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4"
          )}
        >
          <div className="rounded-2xl border border-slate-200/80 bg-white/75 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Batch
            </div>
            <div className="mt-2 text-sm font-medium text-slate-900">
              {text(subscription.batch_code)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/75 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Lucky number
            </div>
            <div className="mt-2 text-sm font-medium text-slate-900">
              {luckyLabel(
                subscription.winner_summary?.lucky_number ?? subscription.lucky_number
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/75 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Outstanding
            </div>
            <div className="mt-2 text-sm font-medium text-slate-900">
              {money(
                subscription.financial_summary?.outstanding_amount ??
                  subscription.outstanding_amount
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/75 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Winner / waiver
            </div>
            <div className="mt-2 text-sm font-medium text-slate-900">
              {winnerWaiverSummary(subscription)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CustomerProductSummaryCard({
  subscription,
  href,
  className,
  compact = false,
}: CustomerProductSummaryCardProps) {
  const cardClassName = cn(
    "rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-4 shadow-[0_24px_72px_-46px_rgba(15,23,42,0.34)] transition",
    href ? "hover:border-slate-300 hover:shadow-[0_28px_84px_-48px_rgba(15,23,42,0.42)]" : "",
    className
  );

  if (href) {
    return (
      <Link href={href} className={cardClassName}>
        <CardBody subscription={subscription} compact={compact} />
      </Link>
    );
  }

  return (
    <section className={cardClassName}>
      <CardBody subscription={subscription} compact={compact} />
    </section>
  );
}
