"use client";

import { useMemo, useState } from "react";

import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  ProductSchemePricing,
  PublicScheme,
  SchemePricingRules,
  SchemeQuote,
  SchemeTenureQuote,
} from "@/services/public";

const SCHEME_ORDER: PublicScheme[] = ["CASH", "EMI", "RENT", "LEASE"];

const SCHEME_LABEL: Record<PublicScheme, string> = {
  CASH: "Buy outright",
  EMI: "Advance EMI",
  RENT: "Rent",
  LEASE: "Lease",
};

const SCHEME_BLURB: Record<PublicScheme, string> = {
  CASH: "Pay the full amount once. No tenure, no deposit.",
  EMI: "Spread the same total across monthly instalments.",
  RENT: "Monthly rent plus a refundable security deposit.",
  LEASE: "Longer commitment with a refundable security deposit.",
};

function money(value: string | null | undefined): string {
  if (value == null) return "—";
  return formatCurrency(Number(value));
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Mirrors growth.services.scheme_pricing_service.deposit_percent_for_price so a
 * typed tenure updates instantly without a round trip and still matches the
 * server. Bands come from the API, never hardcoded here.
 */
function depositPercentForPrice(price: number, rules: SchemePricingRules): number {
  for (const band of rules.deposit_bands) {
    if (band.up_to == null) return Number(band.percent);
    const limit = Number(band.up_to);
    // First band is exclusive of its bound, later bands inclusive — matching the server.
    const isFirst = band === rules.deposit_bands[0];
    if (isFirst ? price < limit : price <= limit) return Number(band.percent);
  }
  return Number(rules.deposit_bands[rules.deposit_bands.length - 1]?.percent ?? 20);
}

/** Client-side twin of quote_tenure for the customer-entered value. */
function quoteTenureLocally(
  scheme: PublicScheme,
  effectivePrice: number,
  tenureMonths: number,
  rules: SchemePricingRules,
): SchemeTenureQuote {
  const monthly = round2(effectivePrice / tenureMonths);
  const takesDeposit = rules.deposit_schemes.includes(scheme);
  const percent = takesDeposit ? depositPercentForPrice(effectivePrice, rules) : null;
  const depositAmount = percent != null ? round2((effectivePrice * percent) / 100) : null;
  return {
    tenure_months: tenureMonths,
    monthly_amount: String(monthly),
    security_deposit_percent: percent != null ? percent.toFixed(2) : null,
    security_deposit_amount: depositAmount != null ? String(depositAmount) : null,
    upfront_total: String(round2((depositAmount ?? 0) + monthly)),
    template_code: "",
  };
}

export default function PublicProductSchemePricing({
  pricing,
}: {
  pricing?: ProductSchemePricing | null;
}) {
  const available = useMemo(
    () =>
      SCHEME_ORDER.map((s) => pricing?.schemes?.[s]).filter(
        (q): q is SchemeQuote => Boolean(q?.available),
      ),
    [pricing],
  );

  const [activeScheme, setActiveScheme] = useState<PublicScheme | null>(
    available[0]?.scheme ?? null,
  );
  const [tenureByScheme, setTenureByScheme] = useState<Partial<Record<PublicScheme, number>>>({});
  const [tenureDraft, setTenureDraft] = useState<string>("");

  if (!pricing || available.length === 0) return null;

  const rules = pricing.rules;
  const active = available.find((q) => q.scheme === (activeScheme ?? available[0].scheme)) ?? available[0];
  const selectedTenure =
    tenureByScheme[active.scheme] ?? active.tenures[0]?.tenure_months ?? null;

  // A tenure the customer typed that is not one of the presets is priced locally
  // using the same rules the server applies.
  const presetMatch = active.tenures.find((t) => t.tenure_months === selectedTenure);
  const tenure: SchemeTenureQuote | null =
    presetMatch ??
    (selectedTenure != null && rules
      ? quoteTenureLocally(active.scheme, Number(active.effective_price), selectedTenure, rules)
      : (active.tenures[0] ?? null));

  const applyTypedTenure = (raw: string) => {
    setTenureDraft(raw);
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= rules.tenure_min && n <= rules.tenure_max) {
      setTenureByScheme((prev) => ({ ...prev, [active.scheme]: n }));
    }
  };

  const draftInvalid =
    tenureDraft.trim() !== "" &&
    !(
      Number.isFinite(Number.parseInt(tenureDraft, 10)) &&
      Number.parseInt(tenureDraft, 10) >= rules.tenure_min &&
      Number.parseInt(tenureDraft, 10) <= rules.tenure_max
    );

  return (
    <section
      className="rounded-[1.5rem] border border-border bg-card p-5 shadow-sm sm:p-6"
      aria-labelledby="scheme-pricing-heading"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="scheme-pricing-heading" className="text-sm font-semibold text-foreground">
          Choose how you want to pay
        </h2>
        {active.has_discount && active.discount ? (
          <span className="rounded-full bg-green-500/10 px-3 py-1 text-[11px] font-semibold text-green-700 dark:text-green-400">
            {active.discount.package_name} · save {money(active.discount.amount_off)}
          </span>
        ) : null}
      </div>

      {/* Scheme tabs */}
      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Payment schemes">
        {available.map((q) => {
          const isActive = q.scheme === active.scheme;
          return (
            <button
              key={q.scheme}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveScheme(q.scheme)}
              className={cn(
                "rounded-xl border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45",
                isActive
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {SCHEME_LABEL[q.scheme]}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">{SCHEME_BLURB[active.scheme]}</p>

      {/* Price headline */}
      <div className="mt-4 flex flex-wrap items-baseline gap-2">
        <span className="text-2xl font-bold text-foreground">{money(active.effective_price)}</span>
        {active.has_discount ? (
          <span className="text-sm font-medium text-muted-foreground line-through">
            {money(active.base_price)}
          </span>
        ) : null}
        <span className="text-xs text-muted-foreground">total payable</span>
      </div>

      {/* Tenure: preset shortcuts plus free entry */}
      {active.scheme !== "CASH" ? (
        <div className="mt-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Tenure
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Tenure options">
            {active.tenures.map((t) => {
              const isSel = t.tenure_months === tenure?.tenure_months;
              return (
                <button
                  key={`${active.scheme}-${t.tenure_months}`}
                  type="button"
                  aria-pressed={isSel}
                  onClick={() => {
                    setTenureDraft("");
                    setTenureByScheme((prev) => ({ ...prev, [active.scheme]: t.tenure_months }));
                  }}
                  className={cn(
                    "rounded-xl border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45",
                    isSel
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  {t.tenure_months} months
                </button>
              );
            })}

            <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-1.5">
              <span className="text-xs text-muted-foreground">Or enter</span>
              <input
                type="number"
                inputMode="numeric"
                min={rules.tenure_min}
                max={rules.tenure_max}
                value={tenureDraft}
                onChange={(e) => applyTypedTenure(e.target.value)}
                placeholder={String(rules.tenure_min)}
                aria-label={`Tenure in months, ${rules.tenure_min} to ${rules.tenure_max}`}
                aria-invalid={draftInvalid}
                className="w-16 bg-transparent text-sm font-medium text-foreground outline-none"
              />
              <span className="text-xs text-muted-foreground">months</span>
            </label>
          </div>
          <p
            className={cn(
              "mt-2 text-[11px]",
              draftInvalid ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {draftInvalid
              ? `Enter a tenure between ${rules.tenure_min} and ${rules.tenure_max} months.`
              : `Any tenure from ${rules.tenure_min} to ${rules.tenure_max} months.`}
          </p>
        </div>
      ) : null}

      {/* Breakdown */}
      {tenure ? (
        <dl className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-background p-4">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Monthly
            </dt>
            <dd className="mt-1 text-lg font-bold text-primary">{money(tenure.monthly_amount)}</dd>
            <p className="mt-1 text-[11px] text-muted-foreground">
              × {tenure.tenure_months} months
            </p>
          </div>

          {tenure.security_deposit_amount != null ? (
            <div className="rounded-xl border border-border bg-background p-4">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Security deposit
              </dt>
              <dd className="mt-1 text-lg font-bold text-foreground">
                {money(tenure.security_deposit_amount)}
              </dd>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {tenure.security_deposit_percent}% · refundable
              </p>
            </div>
          ) : null}

          <div className="rounded-xl border border-border bg-background p-4">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Pay upfront
            </dt>
            <dd className="mt-1 text-lg font-bold text-foreground">{money(tenure.upfront_total)}</dd>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {tenure.security_deposit_amount != null
                ? "Deposit + first month"
                : "First month"}
            </p>
          </div>
        </dl>
      ) : null}

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        Indicative figures based on the published price and currently active offers. Final amounts,
        eligibility and documents are confirmed by the branch before any contract is signed.
      </p>
    </section>
  );
}
