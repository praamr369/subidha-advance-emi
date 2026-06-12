"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import { CheckCircle2, ClipboardCheck, PackageCheck, ShieldCheck } from "lucide-react";

import ApplyEnquiryHero from "@/components/public/ApplyEnquiryHero";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import ActionButton from "@/components/ui/ActionButton";
import { ROUTES } from "@/lib/routes";
import { submitPublicLead } from "@/services/public";

const PLAN_OPTIONS = [
  { value: "NOT_SURE", label: "Not sure yet", description: "Branch can guide the right path." },
  { value: "LUCKY_PLAN", label: "Lucky Plan Advance EMI", description: "Ownership path with Lucky ID and future EMI waiver rules." },
  { value: "RENT", label: "Rent", description: "Flexible usage access, no Lucky ID." },
  { value: "LEASE", label: "Lease", description: "Longer-term contract-backed access, no Lucky ID." },
  { value: "DIRECT_SALE", label: "Direct Sale", description: "Standard invoice and receipt purchase path." },
] as const;

type PlanInterest = (typeof PLAN_OPTIONS)[number]["value"];

const handoffCards = [
  {
    icon: ClipboardCheck,
    title: "1. Enquiry captured",
    description: "The public form records your interest and contact details only.",
  },
  {
    icon: PackageCheck,
    title: "2. Branch confirms fit",
    description: "Staff check product, plan suitability, stock posture, documents, and monthly comfort.",
  },
  {
    icon: ShieldCheck,
    title: "3. Controlled workflow",
    description: "Contracts, payments, receipts, Lucky IDs, deposits, and deliveries stay inside authenticated workflows.",
  },
] as const;

function toOptionalString(value: string | null): string {
  return value?.trim() || "";
}

function buildInitialInterestedProduct(
  searchParams: Pick<ReadonlyURLSearchParams, "get">
): string {
  return (
    toOptionalString(searchParams.get("product_name")) ||
    toOptionalString(searchParams.get("product_code")) ||
    toOptionalString(searchParams.get("interested_product"))
  );
}

function buildLeadNotes({
  planInterest,
  selectedProductId,
  selectedProductCode,
  selectedProductPrice,
  notes,
}: {
  planInterest: PlanInterest;
  selectedProductId: string;
  selectedProductCode: string;
  selectedProductPrice: string;
  notes: string;
}): string {
  const selectedPlan = PLAN_OPTIONS.find((option) => option.value === planInterest);
  const lines = [
    `Plan interest: ${selectedPlan?.label ?? "Not sure yet"}`,
    selectedProductId ? `Selected product ID: ${selectedProductId}` : "",
    selectedProductCode ? `Selected product code: ${selectedProductCode}` : "",
    selectedProductPrice ? `Listed catalogue price: ${selectedProductPrice}` : "",
    notes.trim() ? `Customer notes: ${notes.trim()}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

export default function ApplyPageClient() {
  const searchParams = useSearchParams();

  const initialInterestedProduct = useMemo(
    () => buildInitialInterestedProduct(searchParams),
    [searchParams]
  );

  const selectedProductId = toOptionalString(searchParams.get("product"));
  const selectedProductName = toOptionalString(searchParams.get("product_name"));
  const selectedProductCode = toOptionalString(searchParams.get("product_code"));
  const selectedProductPrice = toOptionalString(searchParams.get("price"));

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [interestedProduct, setInterestedProduct] = useState(initialInterestedProduct);
  const [planInterest, setPlanInterest] = useState<PlanInterest>("NOT_SURE");
  const [preferredEmiAmount, setPreferredEmiAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setInterestedProduct(initialInterestedProduct);
  }, [initialInterestedProduct]);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const trimmedPreferredEmiAmount = preferredEmiAmount.trim();
      const parsedProductId =
        /^\d+$/.test(selectedProductId) ? Number(selectedProductId) : undefined;
      const response = await submitPublicLead({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        city: city.trim(),
        ...(typeof parsedProductId === "number" ? { product_id: parsedProductId } : {}),
        interested_product: interestedProduct.trim(),
        ...(trimmedPreferredEmiAmount
          ? { preferred_emi_amount: trimmedPreferredEmiAmount }
          : {}),
        notes: buildLeadNotes({
          planInterest,
          selectedProductId,
          selectedProductCode,
          selectedProductPrice,
          notes,
        }),
      });

      const referenceSuffix =
        typeof response.lead_id === "number" ? ` Reference #${response.lead_id}.` : "";

      setSuccessMessage(
        `${response.message || "Application submitted successfully."}${referenceSuffix}`
      );
      setName("");
      setPhone("");
      setEmail("");
      setCity("");
      setInterestedProduct(initialInterestedProduct);
      setPlanInterest("NOT_SURE");
      setPreferredEmiAmount("");
      setNotes("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to submit right now. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  const hasProductContext =
    Boolean(selectedProductId) || Boolean(selectedProductName) || Boolean(selectedProductCode);

  const selectedPlan = PLAN_OPTIONS.find((option) => option.value === planInterest) ?? PLAN_OPTIONS[0];

  return (
    <PublicPageShell
      title="Apply / Enquire"
      subtitle="Share your product preference, preferred monthly comfort, and contact details so the branch can guide you on Lucky Plan Advance EMI, rent, lease, or direct-sale availability."
      heroSlot={<ApplyEnquiryHero />}
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Apply" },
      ]}
      actions={[
        { label: "Browse Products", href: ROUTES.public.products, variant: "secondary" },
        { label: "Contact", href: ROUTES.public.contact, variant: "secondary" },
      ]}
    >
      <PublicMarketingBanner
        eyebrow="Safe enquiry handoff"
        title="One form for product interest, not financial posting"
        description="The public apply page captures lead context only. It does not create subscriptions, rent/lease contracts, Lucky IDs, payments, receipts, deposits, journal entries, or delivery records."
        items={[
          { title: "Product context", description: "Catalogue product details can prefill the enquiry so staff know what to discuss." },
          { title: "Plan interest", description: "Customer can indicate Lucky Plan, rent, lease, direct sale, or ask for guidance." },
          { title: "Branch-controlled next step", description: "Staff review eligibility, documents, stock posture, and financial terms before any operational record." },
        ]}
      />

      <section className="grid gap-4 md:grid-cols-3">
        {handoffCards.map((card) => (
          <article key={card.title} className="public-card-sm public-card-animated p-5">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--primary)_13%,var(--surface-card-elevated)_87%)] text-primary shadow-[inset_0_1px_0_var(--hairline-shine)]">
              <card.icon className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-base font-semibold text-foreground">{card.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.description}</p>
          </article>
        ))}
      </section>

      {hasProductContext ? (
        <section className="public-card p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Selected Product Context
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">Product</div>
              <div className="text-sm font-medium text-foreground">
                {selectedProductName || interestedProduct || "Product selected"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Catalogue Ref</div>
              <div className="text-sm font-medium text-foreground">
                {selectedProductCode || (selectedProductId ? `Product #${selectedProductId}` : "—")}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Listed Price</div>
              <div className="text-sm font-medium text-foreground">
                {selectedProductPrice ? `₹${selectedProductPrice}` : "—"}
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            This context is sent with your enquiry. It does not reserve stock, lock price, create EMI, or confirm rent/lease availability.
          </p>
        </section>
      ) : null}

      <section className="public-surface p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <form onSubmit={onSubmit} className="grid gap-6">
            <fieldset className="grid gap-4 rounded-2xl border border-[color-mix(in_oklab,var(--border)_80%,transparent)] bg-[color-mix(in_oklab,white_92%,var(--surface-muted)_8%)] p-4 sm:p-5 lg:grid-cols-2">
              <legend className="px-1 text-sm font-semibold text-foreground">Your details</legend>
              <p className="text-xs leading-relaxed text-muted-foreground lg:col-span-2">
                We use this only to respond to your enquiry. Do not share card PINs, passwords, OTPs, or banking secrets here.
              </p>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-foreground">Name</span>
                <input
                  name="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Enter your full name"
                  required
                  disabled={loading}
                  autoComplete="name"
                  className="public-control-focus h-11 rounded-xl border border-border bg-white/80 px-4 text-sm"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-foreground">Phone</span>
                <input
                  name="phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit phone number"
                  required
                  pattern="[0-9]{10}"
                  disabled={loading}
                  autoComplete="tel"
                  className="public-control-focus h-11 rounded-xl border border-border bg-white/80 px-4 text-sm"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-foreground">City / Area</span>
                <input
                  name="city"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  placeholder="Where should the branch contact you?"
                  disabled={loading}
                  autoComplete="address-level2"
                  className="public-control-focus h-11 rounded-xl border border-border bg-white/80 px-4 text-sm"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-foreground">Email (optional)</span>
                <input
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="If you prefer email follow-up"
                  disabled={loading}
                  autoComplete="email"
                  className="public-control-focus h-11 rounded-xl border border-border bg-white/80 px-4 text-sm"
                />
              </label>
            </fieldset>

            <fieldset className="grid gap-4 rounded-2xl border border-[color-mix(in_oklab,var(--border)_80%,transparent)] bg-[color-mix(in_oklab,white_92%,var(--surface-muted)_8%)] p-4 sm:p-5 lg:grid-cols-2">
              <legend className="px-1 text-sm font-semibold text-foreground">Product &amp; plan interest</legend>

              <label className="grid gap-2 lg:col-span-2">
                <span className="text-sm font-medium text-foreground">Interested product</span>
                <input
                  name="interested_product"
                  value={interestedProduct}
                  onChange={(event) => setInterestedProduct(event.target.value)}
                  placeholder="Product name, code, or preferred category"
                  disabled={loading}
                  className="public-control-focus h-11 rounded-xl border border-border bg-white/80 px-4 text-sm"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-foreground">Plan interest</span>
                <select
                  name="plan_interest"
                  value={planInterest}
                  onChange={(event) => setPlanInterest(event.target.value as PlanInterest)}
                  disabled={loading}
                  className="public-control-focus h-11 rounded-xl border border-border bg-white/80 px-4 text-sm"
                >
                  {PLAN_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs leading-5 text-muted-foreground">{selectedPlan.description}</span>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-foreground">Preferred monthly amount (optional)</span>
                <input
                  name="preferred_emi_amount"
                  type="number"
                  min="0"
                  value={preferredEmiAmount}
                  onChange={(event) => setPreferredEmiAmount(event.target.value)}
                  placeholder="Comfort hint, not a binding quote"
                  disabled={loading}
                  className="public-control-focus h-11 rounded-xl border border-border bg-white/80 px-4 text-sm"
                />
              </label>

              <label className="grid gap-2 lg:col-span-2">
                <span className="text-sm font-medium text-foreground">Notes</span>
                <textarea
                  name="notes"
                  rows={5}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Tell us your preferred follow-up time, product questions, or whether you need EMI, rent, lease, or direct-sale guidance."
                  disabled={loading}
                  className="public-control-focus rounded-xl border border-border bg-white/80 px-4 py-3 text-sm"
                />
              </label>
            </fieldset>

            <div className="flex flex-wrap gap-3">
              <ActionButton
                type="submit"
                variant="primary"
                loading={loading}
                size="lg"
              >
                {loading ? "Submitting..." : "Submit Enquiry"}
              </ActionButton>

              <ActionButton href={ROUTES.public.products} variant="outline" size="lg" className={loading ? "pointer-events-none opacity-60" : ""}>
                Back to Products
              </ActionButton>
            </div>
          </form>

          <aside className="grid gap-4 self-start rounded-[2rem] border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_84%,transparent)] p-5 shadow-[0_24px_70px_-50px_rgba(87,54,31,0.58)]">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">What this form does</div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Creates a public lead only</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Branch staff must review the enquiry before any customer, contract, EMI, rent, lease, receipt, deposit, delivery, or accounting workflow is created.
              </p>
            </div>
            <div className="grid gap-2 text-sm leading-6 text-muted-foreground">
              {[
                "No automatic Lucky ID assignment",
                "No automatic EMI schedule",
                "No automatic rent/lease deposit",
                "No public payment collection",
                "No receipt or invoice generation",
              ].map((item) => (
                <div key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>

        {successMessage ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}
      </section>
    </PublicPageShell>
  );
}
