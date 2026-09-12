"use client";

import { formatRupee } from "@/lib/utils/currency";

// Mirrors backend customers.services.customer_account_service.build_customer_product_posture.
// One money summary per product line so Advance EMI, rent/lease and direct-sale
// customers all show the same detail (admin customer page + customer portal).

type PostureLine = {
  count: number;
  value: string;
  paid: string;
  due: string;
  overdue: string;
  next_due_date: string | null;
  last_collection_date: string | null;
};

export type ProductPosture = {
  advance_emi: PostureLine;
  rent_lease: PostureLine & {
    rent_count: number;
    lease_count: number;
    deposit_held: string;
  };
  direct_sale: PostureLine & { last_sale_date: string | null };
  totals: {
    active_count: number;
    value: string;
    paid: string;
    due: string;
    overdue: string;
    next_due_date: string | null;
    last_collection_date: string | null;
  };
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asMoney(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function asCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asDate(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function normalizeLine(raw: unknown): PostureLine {
  const line = asObject(raw);
  return {
    count: asCount(line.count),
    value: asMoney(line.value),
    paid: asMoney(line.paid),
    due: asMoney(line.due),
    overdue: asMoney(line.overdue),
    next_due_date: asDate(line.next_due_date),
    last_collection_date: asDate(line.last_collection_date),
  };
}

export function normalizeProductPosture(raw: unknown): ProductPosture | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const rentLease = asObject(value.rent_lease);
  const directSale = asObject(value.direct_sale);
  const totals = asObject(value.totals);
  return {
    advance_emi: normalizeLine(value.advance_emi),
    rent_lease: {
      ...normalizeLine(rentLease),
      rent_count: asCount(rentLease.rent_count),
      lease_count: asCount(rentLease.lease_count),
      deposit_held: asMoney(rentLease.deposit_held),
    },
    direct_sale: {
      ...normalizeLine(directSale),
      last_sale_date: asDate(directSale.last_sale_date),
    },
    totals: {
      active_count: asCount(totals.active_count),
      value: asMoney(totals.value),
      paid: asMoney(totals.paid),
      due: asMoney(totals.due),
      overdue: asMoney(totals.overdue),
      next_due_date: asDate(totals.next_due_date),
      last_collection_date: asDate(totals.last_collection_date),
    },
  };
}

function formatShortDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={tone === "danger" ? "text-sm font-semibold text-rose-600" : "text-sm font-semibold text-foreground"}>
        {value}
      </div>
    </div>
  );
}

type LineProps = {
  icon: string;
  title: string;
  subtitle?: string;
  line: PostureLine;
  paidLabel: string;
  extra?: { label: string; value: string }[];
};

function PostureRow({ icon, title, subtitle, line, paidLabel, extra = [] }: LineProps) {
  const overdue = Number(line.overdue) > 0;
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">
          {icon} {title}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {line.count} active{subtitle ? ` · ${subtitle}` : ""}
          </span>
        </div>
        {overdue ? (
          <span className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-600">
            Overdue {formatRupee(line.overdue)}
          </span>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Value" value={formatRupee(line.value)} />
        <Stat label={paidLabel} value={formatRupee(line.paid)} />
        <Stat label="Due" value={formatRupee(line.due)} />
        <Stat label="Next due" value={formatShortDate(line.next_due_date)} />
        <Stat label="Last collection" value={formatShortDate(line.last_collection_date)} />
        {extra.map((item) => (
          <Stat key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
    </div>
  );
}

export default function ProductPostureCard({
  posture,
  title = "Contracts & money by product",
}: {
  posture: ProductPosture;
  title?: string;
}) {
  const { advance_emi: emi, rent_lease: rentLease, direct_sale: directSale, totals } = posture;
  const nothingActive = emi.count === 0 && rentLease.count === 0 && directSale.count === 0;
  const rentLeaseMix = [
    rentLease.rent_count ? `Rent ${rentLease.rent_count}` : "",
    rentLease.lease_count ? `Lease ${rentLease.lease_count}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="flex flex-wrap gap-4 text-right">
          <Stat label="Total value" value={formatRupee(totals.value)} />
          <Stat label="Paid" value={formatRupee(totals.paid)} />
          <Stat label="Total due" value={formatRupee(totals.due)} />
          {Number(totals.overdue) > 0 ? (
            <Stat label="Overdue" value={formatRupee(totals.overdue)} tone="danger" />
          ) : null}
        </div>
      </div>

      {nothingActive ? (
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          No active Advance EMI, rent/lease or direct-sale contracts.
        </div>
      ) : null}
      {emi.count > 0 ? (
        <PostureRow icon="💳" title="Advance EMI" line={emi} paidLabel="Paid" />
      ) : null}
      {rentLease.count > 0 ? (
        <PostureRow
          icon="🏠"
          title="Rent / Lease"
          subtitle={rentLeaseMix}
          line={rentLease}
          paidLabel="Received"
          extra={[{ label: "Deposit held", value: formatRupee(rentLease.deposit_held) }]}
        />
      ) : null}
      {directSale.count > 0 ? (
        <PostureRow
          icon="🛒"
          title="Direct sale"
          line={directSale}
          paidLabel="Received"
          extra={[{ label: "Last sale", value: formatShortDate(directSale.last_sale_date) }]}
        />
      ) : null}
    </div>
  );
}
