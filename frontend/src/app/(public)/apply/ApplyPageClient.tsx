"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";

import PublicPageShell from "@/components/public/PublicPageShell";
import ActionButton from "@/components/ui/ActionButton";
import { ROUTES } from "@/lib/routes";
import { submitPublicLead } from "@/services/public";

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
  const [preferredEmiAmount, setPreferredEmiAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setInterestedProduct(initialInterestedProduct);
  }, [initialInterestedProduct]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
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
        notes: notes.trim(),
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

  return (
    <PublicPageShell
      title="Apply / Enquire"
      subtitle="Share your product preference, preferred monthly comfort, and contact details so the branch can guide you on Lucky Plan Advance EMI (and any rent/lease availability)."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Apply" },
      ]}
      actions={[
        { label: "Browse Products", href: ROUTES.public.products, variant: "secondary" },
        { label: "Contact", href: ROUTES.public.contact, variant: "secondary" },
      ]}
    >
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
              <div className="text-xs text-muted-foreground">Catalog Ref</div>
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
        </section>
      ) : null}

      <section className="public-surface p-6">
        <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-foreground">Name</span>
            <input
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter your full name"
              required
              className="h-11 rounded-xl border border-border bg-white/80 px-4 text-sm outline-none transition focus:border-ring"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-foreground">Phone</span>
            <input
              name="phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="10-digit phone number"
              required
              pattern="[0-9]{10}"
              className="h-11 rounded-xl border border-border bg-white/80 px-4 text-sm outline-none transition focus:border-ring"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-foreground">City / Area</span>
            <input
              name="city"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="Where should the branch contact you?"
              className="h-11 rounded-xl border border-border bg-white/80 px-4 text-sm outline-none transition focus:border-ring"
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
              className="h-11 rounded-xl border border-border bg-white/80 px-4 text-sm outline-none transition focus:border-ring"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-foreground">Interested Product</span>
            <input
              name="interested_product"
              value={interestedProduct}
              onChange={(event) => setInterestedProduct(event.target.value)}
              placeholder="Product name, code, or preferred category"
              className="h-11 rounded-xl border border-border bg-white/80 px-4 text-sm outline-none transition focus:border-ring"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-foreground">Preferred EMI Amount</span>
            <input
              name="preferred_emi_amount"
              type="number"
              min="0"
              value={preferredEmiAmount}
              onChange={(event) => setPreferredEmiAmount(event.target.value)}
              placeholder="Optional monthly comfort range"
              className="h-11 rounded-xl border border-border bg-white/80 px-4 text-sm outline-none transition focus:border-ring"
            />
          </label>

          <div className="hidden lg:block" />

          <label className="grid gap-2 lg:col-span-2">
            <span className="text-sm font-medium text-foreground">Notes</span>
            <textarea
              name="notes"
              rows={5}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Tell us what you want to buy, your preferred branch follow-up time, or any product questions."
              className="rounded-xl border border-border bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-ring"
            />
          </label>

          <div className="lg:col-span-2 flex flex-wrap gap-3">
            <ActionButton
              type="submit"
              variant="secondary"
              loading={loading}
              size="lg"
              className="border-slate-950/10 bg-slate-950 text-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.82)] hover:bg-slate-900 hover:border-slate-950/10"
            >
              {loading ? "Submitting..." : "Submit Application"}
            </ActionButton>

            <ActionButton
              href={ROUTES.public.products}
              variant="outline"
              size="lg"
            >
              Back to Products
            </ActionButton>
          </div>
        </form>

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
