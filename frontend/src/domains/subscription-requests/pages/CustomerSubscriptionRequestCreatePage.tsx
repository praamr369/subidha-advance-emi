"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import PublicProductMedia from "@/components/public/PublicProductMedia";
import ActionButton from "@/components/ui/ActionButton";
import FormActions from "@/components/ui/FormActions";
import FormSection from "@/components/ui/FormSection";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceNotice } from "@/components/ui/role-workspace";
import { DetailItem, WorkspaceSection } from "@/components/ui/workspace";
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
    return searchParamKey
      ? `/customer/subscription-requests/create?${searchParamKey}`
      : "/customer/subscription-requests/create";
  }, [searchParamKey]);

  const [options, setOptions] = useState<SubscriptionRequestOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] =
    useState<SubscriptionRequestCreateResponse | null>(null);

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
    <ERPPageShell
      eyebrow="Customer Intake"
      title={variant === "drawer" ? "Create request" : "Create Subscription Request"}
      subtitle="Submit a self-service intake request that stays pending until admin approval creates the real subscription."
      helperNote="Requests are intake-only. Approval creates the real contract, EMI schedule, and audit records through the controlled backend workflow."
      helperTone="info"
      breadcrumbs={
        variant === "drawer"
          ? []
          : [
              { label: "Customer", href: "/customer" },
              {
                label: "Subscription Requests",
                href: "/customer/subscription-requests",
              },
              { label: "Create" },
            ]
      }
      actions={
        variant === "drawer"
          ? [
              {
                href: canonicalSelfHref,
                label: "Open full page",
                variant: "secondary",
              },
              {
                href: "/customer/subscription-requests",
                label: "Request register",
                variant: "ghost",
              },
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
      statusBadge={{ label: "Customer self-request", tone: "info" }}
      stats={
        variant === "drawer"
          ? []
          : [
              { label: "Products", value: options?.products.length ?? 0 },
              { label: "Open batches", value: options?.batches.length ?? 0 },
              {
                label: "Lucky numbers",
                value: batchId
                  ? options?.lucky_numbers.length ?? 0
                  : "Select batch",
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
        {loading ? <ERPLoadingState label="Loading request form..." /> : null}

        {!loading && error ? (
          <ERPErrorState
            title="Unable to load request form"
            description={error}
            onRetry={() => void loadOptions(batchId || undefined)}
          />
        ) : null}

        {!loading && !error && options ? (
          <>
            {success ? (
              <WorkspaceNotice
                tone="success"
                title="Subscription request submitted."
                action={
                  <ActionButton
                    href={`/customer/subscription-requests/${success.request.id}`}
                    variant="outline"
                  >
                    Open Request
                  </ActionButton>
                }
              >
                Request #{success.request.id} is now pending admin approval and remains separate from live subscription records until approval completes.
              </WorkspaceNotice>
            ) : null}

            {submitError ? (
              <WorkspaceNotice tone="danger" title="Unable to submit request">
                {submitError}
              </WorkspaceNotice>
            ) : null}

            <div
              className={
                showAside
                  ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"
                  : "grid gap-6"
              }
            >
              <WorkspaceSection
                title="Request details"
                description="Choose the product and batch first. Lucky numbers stay constrained to the selected batch."
              >
                <form onSubmit={handleSubmit}>
                  <div className="space-y-5">
                    <FormSection
                      title="Product and batch"
                      description="The selected batch determines available lucky numbers and the request tenure snapshot."
                      columns={2}
                    >
                      <div className="space-y-2">
                        <label htmlFor="product_id" className="text-sm font-semibold text-foreground">
                          Product
                        </label>
                        <select
                          id="product_id"
                          value={productId}
                          onChange={(event) => setProductId(event.target.value)}
                          className="h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                        >
                          <option value="">Select product</option>
                          {options.products.map((item) => (
                            <option key={item.id} value={String(item.id)}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="batch_id" className="text-sm font-semibold text-foreground">
                          Batch
                        </label>
                        <select
                          id="batch_id"
                          value={batchId}
                          onChange={(event) => setBatchId(event.target.value)}
                          className="h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                        >
                          <option value="">Select batch</option>
                          {options.batches.map((item) => (
                            <option key={item.id} value={String(item.id)}>
                              {item.batch_code} · {item.duration_months} months
                            </option>
                          ))}
                        </select>
                      </div>
                    </FormSection>

                    <FormSection
                      title="Allocation and notes"
                      description="Lucky numbers are validated against the selected batch. Notes help the admin team review the request."
                      columns={2}
                    >
                      <div className="space-y-2">
                        <label htmlFor="lucky_number" className="text-sm font-semibold text-foreground">
                          Lucky number
                        </label>
                        <select
                          id="lucky_number"
                          value={luckyNumber}
                          onChange={(event) => setLuckyNumber(event.target.value)}
                          className="h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                          disabled={!batchId}
                        >
                          <option value="">Select lucky</option>
                          {options.lucky_numbers.map((item) => (
                            <option key={item} value={String(item)}>
                              #{String(item).padStart(2, "0")}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                          Lucky numbers are allocated by batch. Admin approval confirms availability before contract creation.
                        </p>
                      </div>

                      <div className="rounded-2xl border border-border bg-[var(--surface-card-elevated)] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
                        <div className="enterprise-eyebrow">Request summary</div>
                        <div className="mt-2 text-sm font-medium text-foreground">
                          {derivedMonthly ? `${money(derivedMonthly)} / month` : "Monthly amount pending"}
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          {selectedBatch
                            ? `${selectedBatch.duration_months} months`
                            : "Select a batch to load tenure"}
                        </div>
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <label htmlFor="notes" className="text-sm font-semibold text-foreground">
                          Notes
                        </label>
                        <textarea
                          id="notes"
                          value={notes}
                          onChange={(event) => setNotes(event.target.value)}
                          rows={4}
                          className="w-full resize-none rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                          placeholder="Optional notes for the admin team"
                        />
                      </div>
                    </FormSection>

                    <FormActions
                      submitLabel="Submit Request"
                      submitLoadingLabel="Submitting..."
                      submitting={submitting}
                      sticky={variant === "drawer"}
                      cancel={
                        variant === "page"
                          ? {
                              label: "Back to register",
                              href: "/customer/subscription-requests",
                            }
                          : null
                      }
                    />
                  </div>
                </form>
              </WorkspaceSection>

              {showAside ? (
                <aside className="space-y-6">
                  <WorkspaceSection
                    title="Selection summary"
                    description="Current request snapshot based on the selected product and batch."
                  >
                    <div className="grid gap-4">
                      <DetailItem label="Product" value={selectedProduct?.name ?? "—"} />
                      <DetailItem label="Batch" value={selectedBatch?.batch_code ?? "—"} />
                      <DetailItem label="Plan" value="EMI request" />
                      <DetailItem
                        label="Monthly"
                        value={derivedMonthly ? money(derivedMonthly) : "—"}
                      />
                    </div>
                  </WorkspaceSection>

                  <WorkspaceSection
                    title="Product preview"
                    description="Live product media stays read-only until approval creates a real subscription."
                  >
                    {selectedProduct ? (
                      <PublicProductMedia
                        src={selectedProduct.image}
                        alt={selectedProduct.name}
                        sizes="(max-width: 1280px) 100vw, 360px"
                        fallbackLabel="Product media pending"
                        badge={selectedProduct.product_code ?? null}
                      />
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Select a product
                      </div>
                    )}
                  </WorkspaceSection>
                </aside>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
