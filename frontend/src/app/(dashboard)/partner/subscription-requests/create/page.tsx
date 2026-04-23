"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import LoadingBlock from "@/components/feedback/LoadingBlock";
import PublicProductMedia from "@/components/public/PublicProductMedia";
import ActionButton from "@/components/ui/ActionButton";
import FormActions from "@/components/ui/FormActions";
import FormSection from "@/components/ui/FormSection";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceNotice } from "@/components/ui/role-workspace";
import { DetailItem, WorkspaceSection } from "@/components/ui/workspace";
import {
  createPartnerSubscriptionRequest,
  getSubscriptionRequestOptions,
  type SubscriptionRequestBatchOption,
  type SubscriptionRequestCreateResponse,
  type SubscriptionRequestCustomerOption,
  type SubscriptionRequestOptions,
  type SubscriptionRequestProductOption,
} from "@/services/subscription-requests";

type IntakeMode = "existing" | "new";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load partner request form.";
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

  if (basePrice <= 0 || months <= 0) {
    return null;
  }

  return (basePrice / months).toFixed(2);
}

export default function PartnerSubscriptionRequestCreatePage() {
  const [mode, setMode] = useState<IntakeMode>("existing");
  const [options, setOptions] = useState<SubscriptionRequestOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SubscriptionRequestCreateResponse | null>(null);

  const [customerQuery, setCustomerQuery] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [requestedCustomerName, setRequestedCustomerName] = useState("");
  const [requestedCustomerPhone, setRequestedCustomerPhone] = useState("");
  const [requestedCustomerEmail, setRequestedCustomerEmail] = useState("");
  const [requestedCustomerAddress, setRequestedCustomerAddress] = useState("");
  const [requestedCustomerCity, setRequestedCustomerCity] = useState("");

  const [productId, setProductId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [luckyNumber, setLuckyNumber] = useState("");
  const [notes, setNotes] = useState("");

  const loadOptions = useCallback(
    async (params?: { batchId?: string; customerQ?: string }) => {
      const payload = await getSubscriptionRequestOptions("partner", {
        batchId: params?.batchId || undefined,
        customerQ: params?.customerQ || undefined,
      });
      setOptions(payload);
    },
    []
  );

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
        const payload = await getSubscriptionRequestOptions("partner", {
          batchId,
          customerQ: customerQuery || undefined,
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
  }, [batchId, customerQuery]);

  const selectedProduct = useMemo<SubscriptionRequestProductOption | null>(
    () =>
      options?.products.find((item) => String(item.id) === productId) ?? null,
    [options, productId]
  );

  const selectedBatch = useMemo<SubscriptionRequestBatchOption | null>(
    () => options?.batches.find((item) => String(item.id) === batchId) ?? null,
    [options, batchId]
  );

  const selectedCustomer = useMemo<SubscriptionRequestCustomerOption | null>(
    () =>
      options?.customers?.find((item) => String(item.id) === customerId) ?? null,
    [options, customerId]
  );

  const derivedMonthly = useMemo(
    () => deriveMonthlyAmount({ product: selectedProduct, batch: selectedBatch }),
    [selectedBatch, selectedProduct]
  );

  async function handleRetryLoad() {
    try {
      await loadOptions({ batchId, customerQ: customerQuery });
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
    }
  }

  async function handleCustomerSearch() {
    try {
      await loadOptions({
        batchId: batchId || undefined,
        customerQ: customerQuery || undefined,
      });
      setSubmitError(null);
    } catch (err) {
      setSubmitError(toErrorMessage(err));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!productId || !batchId || !luckyNumber) {
      setSubmitError("Product, batch, and lucky number are required.");
      return;
    }

    if (mode === "existing" && !customerId) {
      setSubmitError("Select a partner-visible customer or switch to new customer mode.");
      return;
    }

    if (
      mode === "new" &&
      (!requestedCustomerName.trim() ||
        !requestedCustomerPhone.trim() ||
        !requestedCustomerEmail.trim())
    ) {
      setSubmitError("Name, phone, and email are required for a new customer snapshot.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSuccess(null);

    try {
      const response = await createPartnerSubscriptionRequest({
        customer_id: mode === "existing" ? Number(customerId) : undefined,
        requested_customer_name:
          mode === "new" ? requestedCustomerName.trim() : undefined,
        requested_customer_phone:
          mode === "new" ? requestedCustomerPhone.trim() : undefined,
        requested_customer_email:
          mode === "new" ? requestedCustomerEmail.trim() : undefined,
        requested_customer_address:
          mode === "new" ? requestedCustomerAddress.trim() : undefined,
        requested_customer_city:
          mode === "new" ? requestedCustomerCity.trim() : undefined,
        product_id: Number(productId),
        batch_id: Number(batchId),
        preferred_lucky_number: Number(luckyNumber),
        notes: notes.trim() || undefined,
      });

      setSuccess(response);
      setNotes("");
    } catch (err) {
      setSubmitError(toErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalPage
      eyebrow="Partner Intake"
      title="Create Partner Subscription Request"
      subtitle="Submit a partner-led intake request for an existing partner-visible customer or a new customer snapshot. Admin approval is still required before any live subscription exists."
      helperNote="This form creates an intake request only. Approval is the only path that creates the real subscription, EMI schedule, and related audit trail."
      helperTone="info"
      breadcrumbs={[
        { label: "Partner", href: "/partner" },
        { label: "Subscription Requests", href: "/partner/subscription-requests" },
        { label: "Create" },
      ]}
      actions={[
        {
          href: "/partner/subscription-requests",
          label: "Request Register",
          variant: "secondary",
        },
        {
          href: "/partner/subscriptions",
          label: "Partner Subscriptions",
          variant: "ghost",
        },
      ]}
      statusBadge={{ label: "Partner request intake", tone: "info" }}
      stats={[
        { label: "Products", value: options?.products.length ?? 0 },
        { label: "Open batches", value: options?.batches.length ?? 0 },
        { label: "Visible customers", value: options?.customers?.length ?? 0 },
        { label: "Approval", value: "Admin required", tone: "warning" },
      ]}
    >
      <div className="space-y-6">
        {loading ? <LoadingBlock label="Loading partner request form..." /> : null}

        {!loading && error ? (
          <WorkspaceSection
            title="Unable to load partner request form"
            description="The request form options could not be loaded from the current partner API scope."
          >
            <WorkspaceNotice tone="danger" title="Request form unavailable">
              {error}
            </WorkspaceNotice>
            <div className="mt-4">
              <ActionButton variant="outline" onClick={() => void handleRetryLoad()}>
                Retry
              </ActionButton>
            </div>
          </WorkspaceSection>
        ) : null}

        {!loading && !error && options ? (
          <>
            {success ? (
              <WorkspaceNotice
                tone="success"
                title="Partner request submitted."
                action={
                  <ActionButton
                    href={`/partner/subscription-requests/${success.request.id}`}
                    variant="outline"
                  >
                    Open Request
                  </ActionButton>
                }
              >
                Request #{success.request.id} is waiting for admin approval and has not created a live subscription yet.
              </WorkspaceNotice>
            ) : null}

            {submitError ? (
              <WorkspaceNotice tone="danger" title="Unable to submit partner request">
                {submitError}
              </WorkspaceNotice>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <WorkspaceSection
                title="Partner request intake"
                description="Choose whether this intake is for an existing partner-visible customer or a new customer snapshot, then lock product, batch, and lucky-number context from the live options API."
              >
                <form onSubmit={handleSubmit}>
                  <div className="space-y-5">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setMode("existing")}
                        className={`inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-medium transition ${
                          mode === "existing"
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-background text-foreground hover:bg-muted"
                        }`}
                      >
                        Existing Customer
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode("new")}
                        className={`inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-medium transition ${
                          mode === "new"
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-background text-foreground hover:bg-muted"
                        }`}
                      >
                        New Customer Snapshot
                      </button>
                    </div>

                    <WorkspaceNotice tone="info" title="Current intake mode">
                      {mode === "existing"
                        ? "Select from customers already visible inside the partner scope. This does not expose any admin-only onboarding controls."
                        : "Capture a new customer snapshot for admin review. Approval still determines whether a real customer and subscription are created."}
                    </WorkspaceNotice>

                    {mode === "existing" ? (
                      <FormSection
                        title="Existing customer selection"
                        description="Search inside the current partner-visible customer scope, then select the customer for this request."
                        columns={2}
                      >
                        <div className="space-y-2 md:col-span-2">
                          <label
                            htmlFor="customer_query"
                            className="text-sm font-semibold text-foreground"
                          >
                            Search partner-visible customers
                          </label>
                          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                            <input
                              id="customer_query"
                              value={customerQuery}
                              onChange={(event) => setCustomerQuery(event.target.value)}
                              placeholder="Search by customer name or phone"
                              className="h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                            />
                            <ActionButton
                              type="button"
                              variant="outline"
                              onClick={() => void handleCustomerSearch()}
                            >
                              Search
                            </ActionButton>
                          </div>
                        </div>

                        <div className="space-y-2 md:col-span-2">
                          <label
                            htmlFor="customer_id"
                            className="text-sm font-semibold text-foreground"
                          >
                            Customer
                          </label>
                          <select
                            id="customer_id"
                            value={customerId}
                            onChange={(event) => setCustomerId(event.target.value)}
                            className="h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                          >
                            <option value="">Select customer</option>
                            {(options.customers ?? []).map((customer) => (
                              <option key={customer.id} value={customer.id}>
                                {customer.name} · {customer.phone}
                              </option>
                            ))}
                          </select>
                        </div>
                      </FormSection>
                    ) : (
                      <FormSection
                        title="New customer snapshot"
                        description="Capture the minimum partner-side customer details required for admin review."
                        columns={2}
                      >
                        <div className="space-y-2">
                          <label
                            htmlFor="requested_customer_name"
                            className="text-sm font-semibold text-foreground"
                          >
                            Customer name
                          </label>
                          <input
                            id="requested_customer_name"
                            value={requestedCustomerName}
                            onChange={(event) =>
                              setRequestedCustomerName(event.target.value)
                            }
                            className="h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                          />
                        </div>

                        <div className="space-y-2">
                          <label
                            htmlFor="requested_customer_phone"
                            className="text-sm font-semibold text-foreground"
                          >
                            Phone
                          </label>
                          <input
                            id="requested_customer_phone"
                            value={requestedCustomerPhone}
                            onChange={(event) =>
                              setRequestedCustomerPhone(event.target.value)
                            }
                            className="h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                          />
                        </div>

                        <div className="space-y-2 md:col-span-2">
                          <label
                            htmlFor="requested_customer_email"
                            className="text-sm font-semibold text-foreground"
                          >
                            Email
                          </label>
                          <input
                            id="requested_customer_email"
                            type="email"
                            value={requestedCustomerEmail}
                            onChange={(event) =>
                              setRequestedCustomerEmail(event.target.value)
                            }
                            className="h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                          />
                        </div>

                        <div className="space-y-2 md:col-span-2">
                          <label
                            htmlFor="requested_customer_address"
                            className="text-sm font-semibold text-foreground"
                          >
                            Address
                          </label>
                          <textarea
                            id="requested_customer_address"
                            value={requestedCustomerAddress}
                            onChange={(event) =>
                              setRequestedCustomerAddress(event.target.value)
                            }
                            rows={3}
                            className="w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                          />
                        </div>

                        <div className="space-y-2 md:col-span-2">
                          <label
                            htmlFor="requested_customer_city"
                            className="text-sm font-semibold text-foreground"
                          >
                            City
                          </label>
                          <input
                            id="requested_customer_city"
                            value={requestedCustomerCity}
                            onChange={(event) =>
                              setRequestedCustomerCity(event.target.value)
                            }
                            className="h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                          />
                        </div>
                      </FormSection>
                    )}

                    <FormSection
                      title="Product, batch, and lucky number"
                      description="These values come from live request options and stay constrained to the current batch scope."
                      columns={2}
                    >
                      <div className="space-y-2">
                        <label
                          htmlFor="product_id"
                          className="text-sm font-semibold text-foreground"
                        >
                          Product
                        </label>
                        <select
                          id="product_id"
                          value={productId}
                          onChange={(event) => setProductId(event.target.value)}
                          className="h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                        >
                          <option value="">Select product</option>
                          {options.products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name}{" "}
                              {product.product_code ? `(${product.product_code})` : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label
                          htmlFor="batch_id"
                          className="text-sm font-semibold text-foreground"
                        >
                          Batch
                        </label>
                        <select
                          id="batch_id"
                          value={batchId}
                          onChange={(event) => setBatchId(event.target.value)}
                          className="h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                        >
                          <option value="">Select batch</option>
                          {options.batches.map((batch) => (
                            <option key={batch.id} value={batch.id}>
                              {batch.batch_code} · {batch.available_slots ?? 0} open
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <label
                          htmlFor="lucky_number"
                          className="text-sm font-semibold text-foreground"
                        >
                          Lucky number
                        </label>
                        <select
                          id="lucky_number"
                          value={luckyNumber}
                          onChange={(event) => setLuckyNumber(event.target.value)}
                          disabled={!batchId || options.lucky_numbers.length === 0}
                          className="h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <option value="">
                            {batchId
                              ? options.lucky_numbers.length > 0
                                ? "Select lucky number"
                                : "No lucky numbers available"
                              : "Select batch first"}
                          </option>
                          {options.lucky_numbers.map((value) => (
                            <option key={value} value={value}>
                              #{String(value).padStart(2, "0")}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <label
                          htmlFor="notes"
                          className="text-sm font-semibold text-foreground"
                        >
                          Notes
                        </label>
                        <textarea
                          id="notes"
                          value={notes}
                          onChange={(event) => setNotes(event.target.value)}
                          rows={5}
                          placeholder="Add context for admin review."
                          className="w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                        />
                      </div>
                    </FormSection>

                    <FormActions
                      submitLabel="Submit Partner Request"
                      submitLoadingLabel="Submitting..."
                      submitting={submitting}
                      cancel={{
                        label: "Cancel",
                        href: "/partner/subscription-requests",
                      }}
                    />
                  </div>
                </form>
              </WorkspaceSection>

              <aside className="space-y-6">
                <WorkspaceSection
                  title="Request preview"
                  description="Live summary of the current customer, product, and batch context for this request."
                >
                  <div className="space-y-4">
                    <PublicProductMedia
                      src={selectedProduct?.image}
                      alt={selectedProduct?.name || "Requested product"}
                      sizes="320px"
                      className="h-56 w-full rounded-[28px]"
                      fallbackLabel={
                        selectedProduct ? "Product media pending" : "Select a product"
                      }
                      badge={selectedProduct?.product_code || "Preview"}
                    />

                    <div className="grid gap-4">
                      <DetailItem
                        label="Customer scope"
                        value={
                          mode === "existing"
                            ? selectedCustomer?.name || "No existing customer selected"
                            : requestedCustomerName || "New customer snapshot"
                        }
                      />
                      <DetailItem
                        label="Customer contact"
                        value={
                          mode === "existing"
                            ? selectedCustomer?.phone || "Partner-visible customers only"
                            : requestedCustomerPhone ||
                              requestedCustomerEmail ||
                              "Name, phone, and email are required"
                        }
                      />
                      <DetailItem
                        label="Product"
                        value={selectedProduct?.name || "No product selected"}
                      />
                      <DetailItem
                        label="Base price"
                        value={money(selectedProduct?.base_price)}
                      />
                      <DetailItem
                        label="Batch"
                        value={selectedBatch?.batch_code || "Select batch"}
                      />
                      <DetailItem
                        label="Available slots"
                        value={selectedBatch?.available_slots ?? "—"}
                      />
                      <DetailItem
                        label="Monthly estimate"
                        value={
                          derivedMonthly
                            ? `${money(derivedMonthly)} / month`
                            : "Pending batch selection"
                        }
                      />
                      <DetailItem
                        label="Tenure snapshot"
                        value={
                          selectedBatch?.duration_months
                            ? `${selectedBatch.duration_months} months`
                            : "Pending batch selection"
                        }
                      />
                    </div>
                  </div>
                </WorkspaceSection>

                <WorkspaceSection
                  title="Request boundary"
                  description="Operational rules that remain in force after submission."
                >
                  <WorkspaceNotice tone="info" title="Approval still required">
                    Partner submission does not activate a subscription, post a payment, or create a payout event. Approval is still the only path to live contract creation.
                  </WorkspaceNotice>
                </WorkspaceSection>
              </aside>
            </div>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
