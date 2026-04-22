// frontend/src/domains/subscription-requests/pages/CustomerSubscriptionRequestCreatePage.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PublicProductMedia from "@/components/public/PublicProductMedia";
import PortalPage from "@/components/ui/PortalPage";
import {
  createCustomerSubscriptionRequest,
  getSubscriptionRequestOptions,
  type SubscriptionRequestBatchOption,
  type SubscriptionRequestCreateResponse,
  type SubscriptionRequestOptions,
  type SubscriptionRequestProductOption,
} from "@/services/subscription-requests";

type CustomerSubscriptionRequestCreateVariant = "page" | "drawer";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load request form.";
}

function money(value?: string | number | null): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function deriveMonthlyAmount(params: {
  product: SubscriptionRequestProductOption | null;
  batch: SubscriptionRequestBatchOption | null;
}): string | null {
  const basePrice = toNumber(params.product?.base_price);
  const months = toNumber(params.batch?.duration_months);
  if (basePrice <= 0 || months <= 0) return null;
  return (basePrice / months).toFixed(2);
}

export default function CustomerSubscriptionRequestCreatePage({
  variant = "page",
  queryString,
  onCreated,
}: {
  variant?: CustomerSubscriptionRequestCreateVariant;
  queryString?: string;
  onCreated?: (requestId: number) => void;
} = {}) {
  const runtimeSearchParams = useSearchParams();
  const searchParamKey = useMemo(() => {
    const raw = (queryString ?? "").trim();
    if (raw) return raw.replace(/^\?/, "");
    return runtimeSearchParams.toString();
  }, [queryString, runtimeSearchParams]);

  const canonicalSelfHref = useMemo(() => {
    return searchParamKey ? `/customer/subscription-requests/create?${searchParamKey}` : "/customer/subscription-requests/create";
  }, [searchParamKey]);

  const [options, setOptions] = useState<SubscriptionRequestOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SubscriptionRequestCreateResponse | null>(null);

  const [productId, setProductId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [luckyNumber, setLuckyNumber] = useState("");
  const [notes, setNotes] = useState("");

  const loadOptions = useCallback(async (selectedBatchId?: string) => {
    const payload = await getSubscriptionRequestOptions("customer", {
      batchId: selectedBatchId || undefined,
    });
    setOptions(payload);
  }, []);

  useEffect(() => {
    async function run() {
      setLoading(true);
      try {
        await loadOptions();
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        setOptions(null);
      } finally {
        setLoading(false);
      }
    }

    void run();
  }, [loadOptions]);

  useEffect(() => {
    async function run() {
      if (!batchId) {
        setLuckyNumber("");
        return;
      }

      try {
        const payload = await getSubscriptionRequestOptions("customer", {
          batchId,
        });
        setOptions(payload);
        const nextLucky = payload.lucky_numbers[0];
        setLuckyNumber((current) =>
          current && payload.lucky_numbers.includes(Number(current))
            ? current
            : nextLucky !== undefined
              ? String(nextLucky)
              : ""
        );
      } catch (err) {
        setSubmitError(toErrorMessage(err));
      }
    }

    void run();
  }, [batchId]);

  const selectedProduct = useMemo<SubscriptionRequestProductOption | null>(
    () => options?.products.find((item) => String(item.id) === productId) ?? null,
    [options, productId]
  );

  const selectedBatch = useMemo<SubscriptionRequestBatchOption | null>(
    () => options?.batches.find((item) => String(item.id) === batchId) ?? null,
    [options, batchId]
  );
  const derivedMonthly = useMemo(
    () => deriveMonthlyAmount({ product: selectedProduct, batch: selectedBatch }),
    [selectedBatch, selectedProduct]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!productId || !batchId || !luckyNumber) {
      setSubmitError("Product, batch, and lucky number are required.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSuccess(null);

    try {
      const response = await createCustomerSubscriptionRequest({
        product_id: Number(productId),
        batch_id: Number(batchId),
        preferred_lucky_number: Number(luckyNumber),
        notes: notes.trim() || undefined,
      });
      setSuccess(response);
      setNotes("");

      const requestId = response.request?.id;
      if (typeof requestId === "number" && Number.isFinite(requestId)) {
        onCreated?.(requestId);
      }
    } catch (err) {
      setSubmitError(toErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const showAside = variant === "page";

  return (
    <PortalPage
      title={variant === "drawer" ? "Create request" : "Create Subscription Request"}
      subtitle="Submit a self-service EMI request that stays pending until admin approval creates the real subscription."
      helperNote="Requests are intake-only. Approval creates the real contract, EMI schedule, and audit records."
      helperTone="info"
      breadcrumbs={
        variant === "drawer"
          ? []
          : [
              { label: "Customer", href: "/customer" },
              { label: "Subscription Requests", href: "/customer/subscription-requests" },
              { label: "Create" },
            ]
      }
      actions={
        variant === "drawer"
          ? [
              { href: canonicalSelfHref, label: "Open full page", variant: "secondary" },
              { href: "/customer/subscription-requests", label: "Request register", variant: "ghost" },
            ]
          : [
              {
                href: "/customer/subscription-requests",
                label: "Request Register",
                variant: "secondary",
              },
              {
                href: "/customer/subscriptions",
                label: "My Subscriptions",
                variant: "ghost",
              },
            ]
      }
      statusBadge={{ label: "Customer Self-Request", tone: "info" }}
      stats={
        variant === "drawer"
          ? []
          : [
              { label: "Products", value: options?.products.length ?? 0 },
              { label: "Open Batches", value: options?.batches.length ?? 0 },
              {
                label: "Lucky Numbers",
                value: batchId ? options?.lucky_numbers.length ?? 0 : "Select batch",
              },
              {
                label: "Approval",
                value: "Admin required",
                tone: "warning",
              },
            ]
      }
      presentation={variant === "drawer" ? "popup" : "page"}
      maxWidth={variant === "drawer" ? "100%" : undefined}
    >
      <div className="space-y-6">
        {loading ? <LoadingBlock label="Loading request form..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load request form"
            description={error}
            onRetry={() => void loadOptions(batchId || undefined)}
          />
        ) : null}

        {!loading && !error && options ? (
          <>
            {success ? (
              <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800 shadow-sm">
                <p className="font-semibold">Subscription request submitted.</p>
                <p className="mt-1">Request #{success.request.id} is now pending admin approval.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/customer/subscription-requests/${success.request.id}`}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100"
                  >
                    Open request
                  </Link>
                  <Link
                    href="/customer/subscription-requests"
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100"
                  >
                    Back to register
                  </Link>
                </div>
              </section>
            ) : null}

            {submitError ? <ErrorState title="Unable to submit request" description={submitError} /> : null}

            <div className={showAside ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]" : "grid gap-6"}>
              <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-foreground">Request details</h2>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Choose the product and batch. Lucky numbers stay constrained to the selected batch.
                  </p>
                </div>

                <div className="mt-6 grid gap-4">
                  <div>
                    <label htmlFor="product_id" className="block text-sm font-semibold text-foreground">Product</label>
                    <select
                      id="product_id"
                      value={productId}
                      onChange={(event) => setProductId(event.target.value)}
                      className="mt-2 h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                    >
                      <option value="">Select product</option>
                      {options.products.map((item) => (
                        <option key={item.id} value={String(item.id)}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="batch_id" className="block text-sm font-semibold text-foreground">Batch</label>
                    <select
                      id="batch_id"
                      value={batchId}
                      onChange={(event) => setBatchId(event.target.value)}
                      className="mt-2 h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                    >
                      <option value="">Select batch</option>
                      {options.batches.map((item) => (
                        <option key={item.id} value={String(item.id)}>
                          {item.batch_code} · {item.duration_months} months
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="lucky_number" className="block text-sm font-semibold text-foreground">Lucky number</label>
                    <select
                      id="lucky_number"
                      value={luckyNumber}
                      onChange={(event) => setLuckyNumber(event.target.value)}
                      className="mt-2 h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                      disabled={!batchId}
                    >
                      <option value="">Select lucky</option>
                      {options.lucky_numbers.map((item) => (
                        <option key={item} value={String(item)}>
                          #{String(item).padStart(2, "0")}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Lucky numbers are allocated by batch. Admin approval confirms availability before contract creation.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="notes" className="block text-sm font-semibold text-foreground">Notes</label>
                    <textarea
                      id="notes"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      rows={3}
                      className="mt-2 w-full resize-none rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                      placeholder="Optional notes for the admin team"
                    />
                  </div>

                  <div className={variant === "drawer" ? "popup-action-bar items-center" : ""}>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-primary/80 bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_18px_34px_-24px_rgba(30,64,175,0.62)] transition hover:bg-[color-mix(in_oklab,var(--primary)_90%,black_10%)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? "Submitting..." : "Submit Request"}
                    </button>
                  </div>
                </div>
              </form>

              {showAside ? (
                <aside className="space-y-4">
                  <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Selection summary</h3>
                    <dl className="mt-4 space-y-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <dt className="text-muted-foreground">Product</dt>
                        <dd className="font-medium text-foreground">{selectedProduct?.name ?? "—"}</dd>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <dt className="text-muted-foreground">Batch</dt>
                        <dd className="font-medium text-foreground">{selectedBatch?.batch_code ?? "—"}</dd>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <dt className="text-muted-foreground">Plan</dt>
                        <dd className="font-medium text-foreground">EMI request</dd>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <dt className="text-muted-foreground">Monthly</dt>
                        <dd className="font-medium text-foreground">{derivedMonthly ? money(derivedMonthly) : "—"}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Product preview</h3>
                    <div className="mt-4">
                      {selectedProduct ? (
                        <PublicProductMedia
                          src={selectedProduct.image}
                          alt={selectedProduct.name}
                          sizes="(max-width: 1280px) 100vw, 360px"
                          fallbackLabel="Product media pending"
                          badge={selectedProduct.product_code ?? null}
                        />
                      ) : (
                        <div className="text-sm text-muted-foreground">Select a product</div>
                      )}
                    </div>
                  </div>
                </aside>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
