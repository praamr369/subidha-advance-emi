"use client";

import Link from "next/link";

import PublicProductMedia from "@/components/public/PublicProductMedia";
import StatusBadge from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { SubscriptionRequestRecord } from "@/services/subscription-requests";

type SubscriptionRequestCardProps = {
  request: SubscriptionRequestRecord;
  href?: string;
  className?: string;
  showRequester?: boolean;
};

function text(value?: string | null, fallback = "—"): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function luckyLabel(value?: number | null): string {
  return typeof value === "number" ? `#${String(value).padStart(2, "0")}` : "—";
}

function customerLabel(request: SubscriptionRequestRecord): string {
  return (
    request.customer_name ||
    request.requested_customer_name ||
    "Customer pending"
  );
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CardBody({
  request,
  showRequester,
}: {
  request: SubscriptionRequestRecord;
  showRequester: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-[140px_minmax(0,1fr)]">
      <PublicProductMedia
        src={request.product_image}
        alt={request.product_name || "Requested product"}
        sizes="140px"
        className="h-32 w-full rounded-[24px]"
        fallbackLabel="Product media pending"
        badge={request.product_code || "Product"}
      />

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Subscription request
            </p>
            <h3 className="mt-2 truncate text-lg font-semibold text-slate-950">
              {request.product_name || "Requested product"}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {customerLabel(request)}
            </p>
          </div>
          <StatusBadge status={request.status} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Batch
            </div>
            <div className="mt-2 text-sm font-medium text-slate-900">
              {text(request.batch_code)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Lucky number
            </div>
            <div className="mt-2 text-sm font-medium text-slate-900">
              {luckyLabel(request.preferred_lucky_number)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Tenure
            </div>
            <div className="mt-2 text-sm font-medium text-slate-900">
              {request.requested_tenure_months_snapshot
                ? `${request.requested_tenure_months_snapshot} months`
                : "—"}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Approved subscription
            </div>
            <div className="mt-2 text-sm font-medium text-slate-900">
              {text(request.approved_subscription_number)}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/90 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Requested customer
            </div>
            <div className="mt-2 text-sm text-slate-900">
              {customerLabel(request)}
              <span className="block text-slate-600">
                {text(request.customer_phone || request.requested_customer_phone)}
              </span>
              <span className="block text-slate-600">
                {text(request.customer_email || request.requested_customer_email)}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/90 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Notes
            </div>
            <div className="mt-2 text-sm text-slate-900">
              {text(request.notes, "No request note provided.")}
            </div>
            {showRequester ? (
              <div className="mt-3 text-xs text-slate-500">
                Requester: {text(request.requester_username)}
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/90 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Submitted
            </div>
            <div className="mt-2 text-sm text-slate-900">
              {formatDateTime(request.created_at)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/90 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Last review update
            </div>
            <div className="mt-2 text-sm text-slate-900">
              {formatDateTime(request.reviewed_at || request.updated_at)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SubscriptionRequestCard({
  request,
  href,
  className,
  showRequester = false,
}: SubscriptionRequestCardProps) {
  const rootClassName = cn(
    "rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-4 shadow-[0_24px_72px_-46px_rgba(15,23,42,0.34)] transition",
    href ? "hover:border-slate-300 hover:shadow-[0_28px_84px_-48px_rgba(15,23,42,0.42)]" : "",
    className
  );

  if (href) {
    return (
      <Link href={href} className={rootClassName}>
        <CardBody request={request} showRequester={showRequester} />
        <div className="mt-4 border-t border-slate-200/80 pt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Open request detail
        </div>
      </Link>
    );
  }

  return (
    <section className={rootClassName}>
      <CardBody request={request} showRequester={showRequester} />
    </section>
  );
}
