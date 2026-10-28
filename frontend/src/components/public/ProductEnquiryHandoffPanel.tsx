"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, ClipboardCheck, PackageCheck, ReceiptText, ShieldCheck, type LucideIcon } from "lucide-react";

import { formatCurrency } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import type { PublicProduct } from "@/services/public";
import { type ProductPlanInterest, buildProductEnquiryHref } from "./product-enquiry-utils";

const safetyPoints = [
  "Catalogue enquiry does not reserve stock.",
  "Listed price is not a final EMI/rent/lease quote.",
  "Branch review is required before contract or delivery.",
  "Public page does not create payments, receipts, invoices, deposits, or accounting records.",
] as const;

type ProductEnquiryHandoffPanelProps = {
  product: PublicProduct;
  dict: any;
};

function PriceDisplay({ product }: { product: PublicProduct }) {
  const price = Number(product.base_price ?? 0);
  const hasVariants = (product.pim_variants?.length ?? 0) > 0;
  const range = product.price_range;

  // Blueprint product: base_price=0, pricing on variant SKUs
  if (price === 0 && hasVariants) {
    if (range) {
      const minFmt = formatCurrency(range.min);
      const maxFmt = formatCurrency(range.max);
      const isSingle = range.min === range.max;
      return (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {isSingle ? "Price" : "Starting from"}
          </div>
          <div className="mt-2 text-4xl font-semibold tracking-tight text-foreground">
            {isSingle ? minFmt : minFmt}
          </div>
          {!isSingle && (
            <div className="mt-1 text-sm text-muted-foreground">
              up to {maxFmt} · {range.count} variant{range.count !== 1 ? "s" : ""}
            </div>
          )}
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400 font-medium">
            Select options above to see the exact price for your chosen variant.
          </p>
        </div>
      );
    }
    return (
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Price</div>
        <div className="mt-2 text-2xl font-semibold tracking-tight text-muted-foreground">Price on enquiry</div>
        <p className="mt-2 text-xs text-muted-foreground">Select a variant above or contact branch for pricing.</p>
      </div>
    );
  }

  // Normal product or matched variant — show exact price
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {hasVariants ? "Selected variant price" : "Catalogue base price"}
      </div>
      <div className="mt-2 text-4xl font-semibold tracking-tight text-foreground">
        {formatCurrency(product.base_price)}
      </div>
    </div>
  );
}

export default function ProductEnquiryHandoffPanel({ product, dict }: ProductEnquiryHandoffPanelProps) {
  const [rentTenure, setRentTenure] = useState<string>("6");
  const [leaseTenure, setLeaseTenure] = useState<string>("12");

  const hasAdvanceEmiBatch = product.scheme_pricing?.has_active_batches ?? false;
  const yields = product.rent_yield_estimates;

  const planOptions: Array<{
    value: ProductPlanInterest;
    title: string;
    description: string;
    icon: LucideIcon;
    showTenure?: boolean;
    tenureValue?: string;
    onTenureChange?: (v: string) => void;
  }> = [
    {
      value: "LUCKY_PLAN",
      title: hasAdvanceEmiBatch 
        ? ((dict.public as any).ProductEnquiryHandoffPanel_prop1 || "SFEMI Advance EMI")
        : "Request Advance EMI",
      description: hasAdvanceEmiBatch
        ? ((dict.public as any).ProductEnquiryHandoffPanel_prop2 || "Enquire about SFEMI ID enrollment, promotional terms, and a transparent contract.")
        : "No active batches currently. Register your interest for the next batch.",
      icon: BadgeCheck,
    },
    {
      value: "RENT",
      title: (dict.public as any).ProductEnquiryHandoffPanel_prop3 || "Short-Term Rent",
      description: (dict.public as any).ProductEnquiryHandoffPanel_prop4 || "Enquire about rental availability, deposit terms, and monthly rent options without ownership.",
      icon: PackageCheck,
      showTenure: true,
      tenureValue: rentTenure,
      onTenureChange: setRentTenure,
    },
    {
      value: "LEASE",
      title: (dict.public as any).ProductEnquiryHandoffPanel_prop5 || "Long-Term Lease",
      description: (dict.public as any).ProductEnquiryHandoffPanel_prop6 || "Enquire about longer fixed-term lease arrangements, checkpoints, and transition to ownership.",
      icon: ClipboardCheck,
      showTenure: true,
      tenureValue: leaseTenure,
      onTenureChange: setLeaseTenure,
    },
    {
      value: "DIRECT_SALE",
      title: (dict.public as any).ProductEnquiryHandoffPanel_prop7 || "Direct Sale Quote",
      description: (dict.public as any).ProductEnquiryHandoffPanel_prop8 || "Enquire about direct upfront payment quote, standard warranty, and immediate branch delivery.",
      icon: ReceiptText,
    },
  ];

  return (
    <aside className="grid gap-5">
      <section className="public-card p-6 shadow-[0_26px_62px_-40px_rgba(15,23,42,0.22)] dark:shadow-none">
        <PriceDisplay product={product} />
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This price comes from live public product records. Final stock, discount, invoice, EMI, rent, lease, taxes, and delivery terms are confirmed only through branch workflow.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={buildProductEnquiryHref(product, "NOT_SURE", product.product_code, product.stock_status)} className="public-action-primary h-12 justify-center gap-2 min-h-0! px-6">
            Enquire now
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href={ROUTES.public.contact} className="public-action-secondary h-12 justify-center gap-2 min-h-0! px-6">
            Contact branch
          </Link>
        </div>
      </section>

      <section className="public-card p-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{(dict.public as any).ProductEnquiryHandoffPanel_text13 || "Specific Plan Enquiry"}</div>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{(dict.public as any).ProductEnquiryHandoffPanel_text14 || "Select your intent"}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          These buttons prefill the public enquiry form only. They do not approve, reserve, post, or generate any operational record.
        </p>

        <div className="mt-5 grid gap-3">
          {planOptions.map((option) => (
            <div key={option.value} className="public-card-sm public-card-animated flex flex-col gap-3 px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--primary)_12%,var(--surface-card-elevated)_88%)] text-primary shadow-[inset_0_1px_0_var(--hairline-shine)]">
                  <option.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">{option.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.description}</span>
                  {option.showTenure && yields && (
                    <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
                      <select 
                        value={option.tenureValue} 
                        onChange={(e) => option.onTenureChange?.(e.target.value)}
                        className="h-8 rounded-lg border border-border bg-white px-2 text-xs"
                      >
                        <option value="3">3 Months</option>
                        <option value="6">6 Months</option>
                        <option value="12">12 Months</option>
                        <option value="24">24 Months</option>
                      </select>
                      <span className="text-[11px] font-medium text-primary">
                        Security Deposit: 20-30% • Est. Monthly: ₹
                        {Number(option.tenureValue) <= 12 ? yields.short_tenure_max : yields.long_tenure_max}
                      </span>
                    </div>
                  )}
                </span>
              </div>
              <Link
                href={buildProductEnquiryHref(product, option.value, product.product_code, product.stock_status, option.tenureValue)}
                className="mt-2 flex items-center gap-1 self-end text-xs font-semibold text-primary hover:underline focus-visible:outline-none"
              >
                Proceed with {option.title.split(' ')[0]} <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="public-card-sm p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Public handoff safety
        </div>
        <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
          {safetyPoints.map((point) => (
            <li key={point} className="rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_76%,transparent)] px-3 py-2">
              {point}
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
