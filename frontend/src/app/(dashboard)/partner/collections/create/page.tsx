"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import PortalPage from "@/components/ui/PortalPage";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ErrorState from "@/components/feedback/ErrorState";
import EmptyState from "@/components/feedback/EmptyState";
import { normalizeApiError } from "@/services/api/errors";
import {
  collectPartnerPayment,
  listPartnerSubscriptions,
  type PartnerCollectedPayment,
  type PartnerSubscription,
} from "@/services/partner";

type FormState = {
  subscription: string;
  amount: string;
  payment_mode: "CASH" | "UPI" | "BANK";
  paid_at: string;
  reference_no: string;
  notes: string;
};

const PAYMENT_METHOD_OPTIONS: Array<{
  value: FormState["payment_mode"];
  label: string;
}> = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK", label: "Bank Transfer" },
];

function getTodayDateInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDefaultForm(): FormState {
  return {
    subscription: "",
    amount: "",
    payment_mode: "CASH",
    paid_at: getTodayDateInputValue(),
    reference_no: "",
    notes: "",
  };
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value?: string | number | null): string {
  if (value === undefined || value === null || value === "") return "—";
  return `₹${toNumber(value).toFixed(2)}`;
}

function formatDateLabel(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getPartnerSubscriptionCode(subscription: PartnerSubscription): string {
  return `SUB-${subscription.id}`;
}

function subscriptionLabel(subscription: PartnerSubscription): string {
  const code = getPartnerSubscriptionCode(subscription);
  const customer = subscription.customer_name || "Unknown customer";
  const phone = subscription.customer_phone ? ` • ${subscription.customer_phone}` : "";
  const product = subscription.product_name ? ` • ${subscription.product_name}` : "";
  return `${code} • ${customer}${phone}${product}`;
}

function normalizePreferredAmount(subscription: PartnerSubscription | null): string {
  if (!subscription) return "";
  const monthly = toNumber(subscription.monthly_amount);
  if (monthly > 0) return monthly.toFixed(2);

  const total = toNumber(subscription.total_amount);
  const tenure = toNumber(subscription.tenure_months);
  if (total > 0 && tenure > 0) return (total / tenure).toFixed(2);

  return "";
}



function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold text-card-foreground">{value}</div>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default function PartnerCollectionCreatePage() {
  const searchParams = useSearchParams();
  const subscriptionFromQuery = searchParams.get("subscription") || "";

  const [form, setForm] = useState<FormState>(() => buildDefaultForm());
  const [subscriptions, setSubscriptions] = useState<PartnerSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState("");
  const [selectedSubscription, setSelectedSubscription] =
    useState<PartnerSubscription | null>(null);

  const [submitResult, setSubmitResult] = useState<PartnerCollectedPayment | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadSubscriptions = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const payload = await listPartnerSubscriptions({ status: "ACTIVE" });
        const rows = Array.isArray(payload?.results) ? payload.results : [];
        setSubscriptions(rows);

        const preselectedId =
          form.subscription || subscriptionFromQuery
            ? Number(form.subscription || subscriptionFromQuery)
            : 0;

        if (preselectedId > 0) {
          const matched = rows.find((item) => item.id === preselectedId) ?? null;
          setSelectedSubscription(matched);

          if (matched) {
            setForm((prev) => ({
              ...prev,
              subscription: String(matched.id),
              amount: prev.amount || normalizePreferredAmount(matched),
            }));
            setSearch(subscriptionLabel(matched));
          }
        }

        setErrorMessage(null);
      } catch (error) {
        const normalized = normalizeApiError(error);
        setErrorMessage(normalized.message || "Failed to load partner subscriptions.");
        setSubscriptions([]);
        setSelectedSubscription(null);
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [form.subscription, subscriptionFromQuery]
  );

  useEffect(() => {
    void loadSubscriptions("initial");
  }, [loadSubscriptions]);

  const filteredSubscriptions = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return subscriptions;

    return subscriptions.filter((item) => {
      const haystack = [
        getPartnerSubscriptionCode(item),
        item.customer_name,
        item.customer_phone,
        item.product_name,
        item.batch_code,
        item.partner_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(trimmed);
    });
  }, [search, subscriptions]);

  const selectedMethodLabel =
    PAYMENT_METHOD_OPTIONS.find((option) => option.value === form.payment_mode)?.label ??
    form.payment_mode;

  function resetMessages() {
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleInputChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value } = event.target;
    updateField(name as keyof FormState, value);
  }

  function handleSubscriptionPick(subscription: PartnerSubscription) {
    setSelectedSubscription(subscription);
    setSearch(subscriptionLabel(subscription));
    setSubmitResult(null);
    resetMessages();

    setForm((prev) => ({
      ...prev,
      subscription: String(subscription.id),
      amount: normalizePreferredAmount(subscription),
    }));
  }

  function resetForm() {
    setForm(buildDefaultForm());
    setSearch("");
    setSelectedSubscription(null);
    setSubmitResult(null);
    resetMessages();
  }

  function validateForm(): string | null {
    const subscriptionId = Number(form.subscription);
    const amount = Number(form.amount);

    if (!subscriptionId || !Number.isInteger(subscriptionId)) {
      return "Select a valid subscription.";
    }

    if (!form.amount.trim()) {
      return "Amount is required.";
    }

    if (Number.isNaN(amount) || amount <= 0) {
      return "Amount must be greater than zero.";
    }

    if (!form.paid_at.trim()) {
      return "Collection date is required.";
    }

    if (form.payment_mode !== "CASH" && !form.reference_no.trim()) {
      return "Reference number is required for UPI and bank collection.";
    }

    if (form.reference_no.trim().length > 100) {
      return "Reference number is too long.";
    }

    if (form.notes.trim().length > 500) {
      return "Notes must be within 500 characters.";
    }

    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetMessages();
    setSubmitResult(null);

    const validationError = validateForm();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setSubmitting(true);

    try {
      const result = await collectPartnerPayment({
        subscription: Number(form.subscription),
        amount: form.amount,
        payment_mode: form.payment_mode,
        reference_no: form.reference_no.trim() || undefined,
        paid_at: form.paid_at,
      });

      setSubmitResult(result);
      setSuccessMessage(
        result.message ||
          result.detail ||
          "Collection request submitted. Final payment visibility may depend on admin verification."
      );
    } catch (error) {
      const normalized = normalizeApiError(error);
      setErrorMessage(
        normalized.message ||
          "Failed to submit partner collection. This workflow may still be disabled in the backend."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const selectedStatus = selectedSubscription?.status || "—";
  const selectedSubscriptionCode = selectedSubscription
    ? getPartnerSubscriptionCode(selectedSubscription)
    : "—";

  return (
    <PortalPage
      title="Partner Collection Entry"
      subtitle="Submit field collection against an active subscription with controlled amount entry and partner-safe workflow."
      breadcrumbs={[
        { label: "Partner", href: "/partner" },
        { label: "Collections", href: "/partner/collections" },
        { label: "Create" },
      ]}
      actions={[
        {
          label: "Collection Queue",
          href: "/partner/collections",
          variant: "secondary",
        },
        {
          label: "Subscriptions",
          href: "/partner/subscriptions",
          variant: "secondary",
        },
      ]}
      stats={[
        {
          label: "Selected Subscription",
          value: selectedSubscriptionCode,
        },
        {
          label: "Monthly Amount",
          value: money(selectedSubscription?.monthly_amount),
        },
        {
          label: "Collection Amount",
          value: form.amount ? money(form.amount) : "—",
        },
        {
          label: "Method",
          value: selectedMethodLabel,
        },
      ]}
    >
      {loading ? <LoadingBlock label="Loading subscriptions..." /> : null}

      {!loading && errorMessage && !selectedSubscription && subscriptions.length === 0 ? (
        <ErrorState
          title="Unable to load partner collection workspace"
          description={errorMessage}
          onRetry={() => void loadSubscriptions("initial")}
        />
      ) : null}

      {!loading && !errorMessage && subscriptions.length === 0 ? (
        <EmptyState
          title="No active subscriptions available"
          description="There are no active partner subscriptions available for collection entry."
        />
      ) : null}

      {!loading && subscriptions.length > 0 ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-card-foreground">
                Field collection workflow
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Select a customer subscription first, review the contract snapshot on
                the right, then submit the collection amount with method and trace
                reference. This page is safe only when partner collections are processed
                through controlled backend review.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="rounded-2xl border border-border bg-muted/40 p-4">
                <label
                  htmlFor="subscription-search"
                  className="mb-2 block text-sm font-medium text-foreground"
                >
                  Search subscription
                </label>
                <input
                  id="subscription-search"
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  placeholder="Search by subscription, customer, phone, or product"
                />

                {refreshing ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Refreshing subscriptions...
                  </p>
                ) : null}

                <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-border bg-background">
                  {filteredSubscriptions.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-muted-foreground">
                      No subscriptions match this search.
                    </div>
                  ) : (
                    filteredSubscriptions.map((item) => {
                      const active = selectedSubscription?.id === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSubscriptionPick(item)}
                          className={`block w-full border-b border-border px-4 py-3 text-left text-sm transition last:border-b-0 ${
                            active ? "bg-slate-100" : "hover:bg-muted"
                          }`}
                        >
                          <div className="font-medium text-foreground">
                            {getPartnerSubscriptionCode(item)}
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            {subscriptionLabel(item)}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="subscription"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
                    Subscription ID <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="subscription"
                    name="subscription"
                    type="text"
                    value={form.subscription}
                    readOnly
                    className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-muted-foreground"
                    placeholder="Auto-filled from selection"
                  />
                </div>

                <div>
                  <label
                    htmlFor="amount"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
                    Amount <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="amount"
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={form.amount}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-border px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    placeholder="Enter collected amount"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Defaulted from monthly contract amount. Keep financial controls
                    strict.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="paid_at"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
                    Collection date <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="paid_at"
                    name="paid_at"
                    type="date"
                    required
                    value={form.paid_at}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-border px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <div>
                  <label
                    htmlFor="payment_mode"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
                    Payment method <span className="text-red-600">*</span>
                  </label>
                  <select
                    id="payment_mode"
                    name="payment_mode"
                    value={form.payment_mode}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-border px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  >
                    {PAYMENT_METHOD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label
                    htmlFor="reference_no"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
                    Reference number
                    {form.payment_mode !== "CASH" ? (
                      <span className="ml-1 text-red-600">*</span>
                    ) : null}
                  </label>
                  <input
                    id="reference_no"
                    name="reference_no"
                    type="text"
                    value={form.reference_no}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-border px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    placeholder={
                      form.payment_mode === "CASH"
                        ? "Optional receipt reference"
                        : "UPI / bank transfer reference"
                    }
                  />
                </div>

                <div className="md:col-span-2">
                  <label
                    htmlFor="notes"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
                    Notes
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    rows={4}
                    value={form.notes}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-border px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    placeholder="Field note, collection context, or exception detail"
                  />
                </div>
              </div>

              {errorMessage ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              {successMessage ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {successMessage}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting || !selectedSubscription}
                  className="inline-flex h-11 items-center rounded-xl bg-slate-900 px-5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Submitting..." : "Submit Collection"}
                </button>

                <button
                  type="button"
                  onClick={resetForm}
                  disabled={submitting}
                  className="inline-flex h-11 items-center rounded-xl border border-border bg-background px-5 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Reset Form
                </button>

                <Link
                  href="/partner/collections"
                  className="inline-flex h-11 items-center rounded-xl border border-border bg-background px-5 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  Cancel
                </Link>
              </div>
            </form>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Selected subscription
              </h3>

              <div className="mt-4 grid gap-3">
                <StatCard
                  label="Subscription"
                  value={selectedSubscriptionCode}
                  hint={selectedStatus}
                />
                <StatCard
                  label="Customer"
                  value={selectedSubscription?.customer_name || "—"}
                  hint={selectedSubscription?.customer_phone || "Customer not loaded"}
                />
                <StatCard
                  label="Product"
                  value={selectedSubscription?.product_name || "—"}
                  hint={
                    selectedSubscription?.batch_code
                      ? `Batch ${selectedSubscription.batch_code}`
                      : "Batch not loaded"
                  }
                />
                <StatCard
                  label="Monthly Amount"
                  value={money(selectedSubscription?.monthly_amount)}
                  hint={
                    selectedSubscription?.tenure_months
                      ? `${selectedSubscription.tenure_months} months`
                      : "Tenure not loaded"
                  }
                />
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Submission summary
              </h3>

              <div className="mt-4 grid gap-3">
                <StatCard
                  label="Method"
                  value={selectedMethodLabel}
                  hint="Selected collection mode"
                />
                <StatCard
                  label="Collection Date"
                  value={formatDateLabel(form.paid_at)}
                  hint="Field collection date"
                />
                <StatCard
                  label="Reference"
                  value={form.reference_no.trim() || "—"}
                  hint="Trace reference"
                />
                <StatCard
                  label="Amount"
                  value={form.amount ? money(form.amount) : "—"}
                  hint="Submitted collection amount"
                />
              </div>
            </div>

            {submitResult ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-800">
                  Last submission
                </h3>

                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-emerald-800">Result</dt>
                    <dd className="font-medium text-emerald-900">
                      {submitResult.message || submitResult.detail || "Submitted"}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-emerald-800">Reference</dt>
                    <dd className="font-medium text-emerald-900">
                      {submitResult.reference_no || form.reference_no || "—"}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  {submitResult.request?.id ? (
                    <Link
                      href={`/partner/collections/${submitResult.request.id}`}
                      className="inline-flex items-center rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-900 shadow-sm transition hover:bg-emerald-50"
                    >
                      Open Request Detail
                    </Link>
                  ) : null}
                  <Link
                    href="/partner/collections"
                    className="inline-flex items-center rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-900 shadow-sm transition hover:bg-emerald-50"
                  >
                    Open Collections
                  </Link>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-amber-800">
                Control note
              </h3>
              <p className="mt-2 text-sm leading-6 text-amber-800">
                Partner collection entry should never create final financial truth
                directly if your backend uses admin verification. Keep this workflow
                attached to controlled review and audit-safe payment creation.
              </p>
            </div>
          </aside>
        </div>
      ) : null}
    </PortalPage>
  );
}
