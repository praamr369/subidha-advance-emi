"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PublicProductMedia from "@/components/public/PublicProductMedia";
import PortalPage from "@/components/ui/PortalPage";
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
      title="Create Partner Subscription Request"
      subtitle="Submit a partner-led EMI subscription request for a partner-visible customer or a new customer snapshot, with admin approval required before activation."
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
      statusBadge={{ label: "Partner Request Intake", tone: "info" }}
      stats={[
        { label: "Products", value: options?.products.length ?? 0 },
        { label: "Open Batches", value: options?.batches.length ?? 0 },
        { label: "Visible Customers", value: options?.customers?.length ?? 0 },
        { label: "Approval", value: "Admin required", tone: "warning" },
      ]}
    >
      <div className="space-y-6">
        {loading ? <LoadingBlock label="Loading partner request form..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load partner request form"
            description={error}
            onRetry={() => void loadOptions({ batchId, customerQ: customerQuery })}
          />
        ) : null}

        {!loading && !error && options ? (
          <>
            {success ? (
              <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800 shadow-sm">
                <p className="font-semibold">Partner request submitted.</p>
                <p className="mt-1">
                  Request #{success.request.id} is waiting for admin approval.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/partner/subscription-requests/${success.request.id}`}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-300 bg-white px-4 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100"
                  >
                    Open Request
                  </Link>
                  <Link
                    href="/partner/subscription-requests"
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-300 bg-white px-4 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100"
                  >
                    Back to Register
                  </Link>
                </div>
              </section>
            ) : null}

            {submitError ? (
              <ErrorState
                title="Unable to submit partner request"
                description={submitError}
              />
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <form
                onSubmit={handleSubmit}
                className="rounded-2xl border border-border bg-card p-5 shadow-sm"
              >
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-foreground">
                    Request intake
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Partner submission can use a current partner-visible customer or a new-customer snapshot. Approval still creates the real subscription later.
                  </p>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
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

                {mode === "existing" ? (
                  <div className="mt-5 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4">
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                      <label className="space-y-2 text-sm text-foreground">
                        <span className="font-medium">Search partner-visible customers</span>
                        <input
                          value={customerQuery}
                          onChange={(event) => setCustomerQuery(event.target.value)}
                          placeholder="Search by customer name or phone"
                          className="h-11 w-full rounded-xl border border-border bg-background px-3"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleCustomerSearch()}
                        className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                      >
                        Search
                      </button>
                    </div>

                    <label className="mt-4 block space-y-2 text-sm text-foreground">
                      <span className="font-medium">Customer</span>
                      <select
                        value={customerId}
                        onChange={(event) => setCustomerId(event.target.value)}
                        className="h-11 w-full rounded-xl border border-border bg-background px-3"
                      >
                        <option value="">Select customer</option>
                        {(options.customers ?? []).map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name} · {customer.phone}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : (
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <label className="space-y-2 text-sm text-foreground">
                      <span className="font-medium">Customer name</span>
                      <input
                        value={requestedCustomerName}
                        onChange={(event) => setRequestedCustomerName(event.target.value)}
                        className="h-11 w-full rounded-xl border border-border bg-background px-3"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-foreground">
                      <span className="font-medium">Phone</span>
                      <input
                        value={requestedCustomerPhone}
                        onChange={(event) => setRequestedCustomerPhone(event.target.value)}
                        className="h-11 w-full rounded-xl border border-border bg-background px-3"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-foreground md:col-span-2">
                      <span className="font-medium">Email</span>
                      <input
                        type="email"
                        value={requestedCustomerEmail}
                        onChange={(event) => setRequestedCustomerEmail(event.target.value)}
                        className="h-11 w-full rounded-xl border border-border bg-background px-3"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-foreground md:col-span-2">
                      <span className="font-medium">Address</span>
                      <textarea
                        value={requestedCustomerAddress}
                        onChange={(event) => setRequestedCustomerAddress(event.target.value)}
                        rows={3}
                        className="w-full rounded-xl border border-border bg-background px-3 py-3"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-foreground md:col-span-2">
                      <span className="font-medium">City</span>
                      <input
                        value={requestedCustomerCity}
                        onChange={(event) => setRequestedCustomerCity(event.target.value)}
                        className="h-11 w-full rounded-xl border border-border bg-background px-3"
                      />
                    </label>
                  </div>
                )}

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm text-foreground">
                    <span className="font-medium">Product</span>
                    <select
                      value={productId}
                      onChange={(event) => setProductId(event.target.value)}
                      className="h-11 w-full rounded-xl border border-border bg-background px-3"
                    >
                      <option value="">Select product</option>
                      {options.products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} {product.product_code ? `(${product.product_code})` : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2 text-sm text-foreground">
                    <span className="font-medium">Batch</span>
                    <select
                      value={batchId}
                      onChange={(event) => setBatchId(event.target.value)}
                      className="h-11 w-full rounded-xl border border-border bg-background px-3"
                    >
                      <option value="">Select batch</option>
                      {options.batches.map((batch) => (
                        <option key={batch.id} value={batch.id}>
                          {batch.batch_code} · {batch.available_slots ?? 0} open
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2 text-sm text-foreground md:col-span-2">
                    <span className="font-medium">Lucky number</span>
                    <select
                      value={luckyNumber}
                      onChange={(event) => setLuckyNumber(event.target.value)}
                      disabled={!batchId || options.lucky_numbers.length === 0}
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 disabled:cursor-not-allowed disabled:opacity-60"
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
                  </label>

                  <label className="space-y-2 text-sm text-foreground md:col-span-2">
                    <span className="font-medium">Notes</span>
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      rows={5}
                      placeholder="Add context for admin review."
                      className="w-full rounded-xl border border-border bg-background px-3 py-3"
                    />
                  </label>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-foreground bg-foreground px-5 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? "Submitting..." : "Submit Partner Request"}
                  </button>
                  <Link
                    href="/partner/subscription-requests"
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-5 text-sm font-medium text-foreground transition hover:bg-muted"
                  >
                    Cancel
                  </Link>
                </div>
              </form>

              <aside className="space-y-4">
                <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div className="space-y-1">
                    <h2 className="text-base font-semibold text-foreground">
                      Request preview
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Product, batch, and partner-visible customer scope all come from live backend request options.
                    </p>
                  </div>

                  <div className="mt-4 space-y-4">
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

                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Customer scope
                      </div>
                      <div className="mt-2 text-sm text-slate-900">
                        {mode === "existing"
                          ? selectedCustomer?.name || "No existing customer selected"
                          : requestedCustomerName || "New customer snapshot"}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        {mode === "existing"
                          ? selectedCustomer?.phone || "Partner-visible customers only"
                          : requestedCustomerPhone || requestedCustomerEmail || "Name, phone, and email are required"}
                      </div>
                      <div className="mt-4 text-sm text-slate-900">
                        Product: {selectedProduct?.name || "No product selected"}
                      </div>
                      <div className="mt-2 text-sm text-slate-900">
                        Base price: {money(selectedProduct?.base_price)}
                      </div>
                      <div className="mt-2 text-sm text-slate-900">
                        Batch: {selectedBatch?.batch_code || "Select batch"}
                      </div>
                      <div className="mt-2 text-sm text-slate-900">
                        Available slots: {selectedBatch?.available_slots ?? "—"}
                      </div>
                    </div>
                  </div>
                </section>
              </aside>
            </div>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
