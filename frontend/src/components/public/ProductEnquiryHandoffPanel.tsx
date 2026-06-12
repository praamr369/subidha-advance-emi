import Link from "next/link";
import { ArrowRight, BadgeCheck, ClipboardCheck, PackageCheck, ReceiptText, ShieldCheck, type LucideIcon } from "lucide-react";

import { formatCurrency } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import type { PublicProduct } from "@/services/public";

export type ProductPlanInterest = "NOT_SURE" | "LUCKY_PLAN" | "RENT" | "LEASE" | "DIRECT_SALE";

const planOptions: Array<{
  value: ProductPlanInterest;
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    value: "LUCKY_PLAN",
    title: "Lucky Plan EMI",
    description: "Ask about batch, Lucky ID, monthly EMI, and future-EMI-only winner benefit.",
    icon: BadgeCheck,
  },
  {
    value: "RENT",
    title: "Rent enquiry",
    description: "Ask about short-term usage, deposit, monthly dues, and return inspection.",
    icon: PackageCheck,
  },
  {
    value: "LEASE",
    title: "Lease enquiry",
    description: "Ask about longer tenure, deposit, renewal, upgrade, and handover checks.",
    icon: ClipboardCheck,
  },
  {
    value: "DIRECT_SALE",
    title: "Direct sale",
    description: "Ask about invoice, receipt, delivery, warranty, and ownership handover.",
    icon: ReceiptText,
  },
];

const safetyPoints = [
  "Catalogue enquiry does not reserve stock.",
  "Listed price is not a final EMI/rent/lease quote.",
  "Branch review is required before contract or delivery.",
  "Public page does not create payments, receipts, invoices, deposits, or accounting records.",
] as const;

export function buildProductEnquiryHref(product: PublicProduct, planInterest: ProductPlanInterest = "NOT_SURE") {
  const params = new URLSearchParams();
  params.set("product", String(product.id));
  params.set("product_name", product.name);
  params.set("product_code", product.product_code);
  params.set("price", product.base_price);
  params.set("plan_interest", planInterest);
  params.set("source", "product_detail");

  return `${ROUTES.public.apply}?${params.toString()}`;
}

type ProductEnquiryHandoffPanelProps = {
  product: PublicProduct;
};

export default function ProductEnquiryHandoffPanel({ product }: ProductEnquiryHandoffPanelProps) {
  return (
    <aside className="grid gap-5">
      <section className="public-card p-6 shadow-[0_26px_62px_-40px_rgba(15,23,42,0.22)] dark:shadow-none">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Catalogue base price
        </div>
        <div className="mt-2 text-4xl font-semibold tracking-tight text-foreground">
          {formatCurrency(product.base_price)}
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This price comes from live public product records. Final stock, discount, invoice, EMI, rent, lease, taxes, and delivery terms are confirmed only through branch workflow.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={buildProductEnquiryHref(product)} className="public-action-primary h-12 justify-center gap-2 !min-h-0 px-6">
            Enquire now
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href={ROUTES.public.contact} className="public-action-secondary h-12 justify-center gap-2 !min-h-0 px-6">
            Contact branch
          </Link>
        </div>
      </section>

      <section className="public-card p-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Choose enquiry path</div>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Carry this product into the right workflow</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          These buttons prefill the public enquiry form only. They do not approve, reserve, post, or generate any operational record.
        </p>

        <div className="mt-5 grid gap-3">
          {planOptions.map((option) => (
            <Link
              key={option.value}
              href={buildProductEnquiryHref(product, option.value)}
              className="public-card-sm public-card-animated flex items-start gap-3 px-4 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45 focus-visible:ring-offset-2"
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--primary)_12%,var(--surface-card-elevated)_88%)] text-primary shadow-[inset_0_1px_0_var(--hairline-shine)]">
                <option.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{option.title}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.description}</span>
              </span>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-primary" />
            </Link>
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
