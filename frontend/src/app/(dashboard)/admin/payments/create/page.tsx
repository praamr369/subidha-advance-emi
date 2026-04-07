"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

import PortalPage from "@/components/ui/PortalPage";
import { apiFetch } from "@/lib/api";
import { buildAdminReconciliationRoute } from "@/lib/route-builders";
import { normalizeApiError } from "@/services/api/errors";
import {
  collectPayment,
  getAdminSubscriptionForCollection,
  listSubscriptionEmisForCollection,
  searchAdminSubscriptionsForCollection,
  type AdminEmiCollectionCandidate,
  type AdminSubscriptionCollectionCandidate,
  type PaymentCollectionResult,
  type PaymentMethod,
} from "@/services/payments";

type FormState = {
  subscription_id: string;
  emi_id: string;
  amount: string;
  payment_method: PaymentMethod;
  payment_date: string;
  reference_no: string;
  notes: string;
};

const PAYMENT_METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK", label: "Bank Transfer" },
  { value: "CARD", label: "Card" },
];

function getTodayDateInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parsePositiveInteger(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function buildDefaultForm(): FormState {
  return {
    subscription_id: "",
    emi_id: "",
    amount: "",
    payment_method: "CASH",
    payment_date: getTodayDateInputValue(),
    reference_no: "",
    notes: "",
  };
}

function formatCurrency(value?: string | number | null): string {
  if (value === undefined || value === null || value === "") return "—";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(numeric);
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

function normalizeOutstandingAmount(
  emi: AdminEmiCollectionCandidate | null
): string {
  if (!emi) return "";
  if (emi.outstanding_amount && emi.outstanding_amount !== "0") {
    return String(emi.outstanding_amount);
  }

  const amount = Number(emi.amount || 0);
  const paid = Number(emi.paid_amount || 0);
  const waived = Number(emi.waived_amount || 0);
  const outstanding = amount - paid - waived;

  return outstanding > 0 ? outstanding.toFixed(2) : "0.00";
}

function getSubscriptionLabel(
  subscription: AdminSubscriptionCollectionCandidate
): string {
  const code = subscription.subscription_number || `SUB-${subscription.id}`;
  const customer = subscription.customer_name || "Unknown customer";
  const phone = subscription.customer_phone
    ? ` • ${subscription.customer_phone}`
    : "";
  const product = subscription.product_name
    ? ` • ${subscription.product_name}`
    : "";
  return `${code} • ${customer}${phone}${product}`;
}

function getEmiLabel(emi: AdminEmiCollectionCandidate): string {
  const inst =
    emi.installment_no !== undefined && emi.installment_no !== null
      ? `EMI ${emi.installment_no}`
      : `EMI #${emi.id}`;

  return `${inst} • Due ${formatDateLabel(
    emi.due_date
  )} • Outstanding ${formatCurrency(normalizeOutstandingAmount(emi))} • ${
    emi.status
  }`;
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold text-slate-900">{value}</div>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default function PaymentRecordPage() {
  const searchParams = useSearchParams();
  const searchParamKey = searchParams.toString();
  const [form, setForm] = useState<FormState>(() => buildDefaultForm());

  const [subscriptionSearch, setSubscriptionSearch] = useState("");
  const [subscriptionOptions, setSubscriptionOptions] = useState<
    AdminSubscriptionCollectionCandidate[]
  >([]);
  const [selectedSubscription, setSelectedSubscription] =
    useState<AdminSubscriptionCollectionCandidate | null>(null);

  const [emiOptions, setEmiOptions] = useState<AdminEmiCollectionCandidate[]>(
    []
  );
  const [selectedEmi, setSelectedEmi] =
    useState<AdminEmiCollectionCandidate | null>(null);

  const [searchingSubscriptions, setSearchingSubscriptions] = useState(false);
  const [loadingSubscription, setLoadingSubscription] = useState(false);
  const [loadingEmis, setLoadingEmis] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submitResult, setSubmitResult] =
    useState<PaymentCollectionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [prefillMessages, setPrefillMessages] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedMethodLabel =
    PAYMENT_METHOD_OPTIONS.find(
      (option) => option.value === form.payment_method
    )?.label ?? form.payment_method;

  const updateField = useCallback(function updateField<K extends keyof FormState>(
    key: K,
    value: FormState[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetMessages = useCallback(() => {
    setErrorMessage(null);
    setSuccessMessage(null);
  }, []);

  function resetSelectionState() {
    setSelectedSubscription(null);
    setSelectedEmi(null);
    setSubscriptionOptions([]);
    setEmiOptions([]);
    setForm((prev) => ({
      ...prev,
      subscription_id: "",
      emi_id: "",
      amount: "",
      reference_no: "",
      notes: "",
    }));
  }

  function resetForm() {
    setForm(buildDefaultForm());
    setSubscriptionSearch("");
    setSubmitResult(null);
    resetMessages();
    resetSelectionState();
  }

  const loadSubscription = useCallback(async (
    subscriptionId: number,
    preferredEmiId?: number | null,
    options?: {
      preserveFeedback?: boolean;
    }
  ): Promise<{ preferredEmiApplied: boolean }> => {
    if (!options?.preserveFeedback) {
      resetMessages();
      setSubmitResult(null);
    }
    setLoadingSubscription(true);
    setLoadingEmis(true);

    try {
      const subscription = await getAdminSubscriptionForCollection(
        subscriptionId
      );
      setSelectedSubscription(subscription);
      setSubscriptionSearch(getSubscriptionLabel(subscription));
      updateField("subscription_id", String(subscription.id));

      const emis = await listSubscriptionEmisForCollection(subscription.id);
      const relevantEmis = emis.filter(
        (item) => item.status !== "PAID" && item.status !== "WAIVED"
      );

      setEmiOptions(relevantEmis);

      const requestedEmi =
        preferredEmiId != null
          ? relevantEmis.find((item) => item.id === preferredEmiId) ?? null
          : null;

      const preferredEmi =
        requestedEmi ??
        relevantEmis.find(
          (item) => normalizeOutstandingAmount(item) !== "0.00"
        ) ??
        relevantEmis[0] ??
        null;

      setSelectedEmi(preferredEmi);
      updateField("emi_id", preferredEmi ? String(preferredEmi.id) : "");
      updateField(
        "amount",
        preferredEmi ? normalizeOutstandingAmount(preferredEmi) : ""
      );

      return { preferredEmiApplied: preferredEmiId ? Boolean(requestedEmi) : true };
    } catch (error) {
      const normalized = normalizeApiError(error);
      setErrorMessage(
        normalized.message || "Failed to load subscription details."
      );
      setSelectedSubscription(null);
      setSelectedEmi(null);
      setEmiOptions([]);
      updateField("subscription_id", "");
      updateField("emi_id", "");
      updateField("amount", "");
      return { preferredEmiApplied: false };
    } finally {
      setLoadingSubscription(false);
      setLoadingEmis(false);
    }
  }, [resetMessages, updateField]);

  useEffect(() => {
    const trimmed = subscriptionSearch.trim();

    if (trimmed.length < 2) {
      setSubscriptionOptions([]);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        setSearchingSubscriptions(true);
        const results = await searchAdminSubscriptionsForCollection(trimmed);
        if (!active) return;
        setSubscriptionOptions(results);
      } catch {
        if (!active) return;
        setSubscriptionOptions([]);
      } finally {
        if (active) {
          setSearchingSubscriptions(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [subscriptionSearch]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(searchParamKey);

    const subscriptionParam = params.get("subscription");
    const emiParam = params.get("emi");

    if (!subscriptionParam && !emiParam) {
      setPrefillMessages([]);
      return () => {
        cancelled = true;
      };
    }

    async function applyPrefill() {
      const messages: string[] = [];

      const subscriptionId = parsePositiveInteger(subscriptionParam);
      const emiId = parsePositiveInteger(emiParam);

      if (subscriptionParam && !subscriptionId) {
        messages.push(
          `Subscription prefill "${subscriptionParam}" was ignored because it is not a valid subscription id.`
        );
      }

      if (emiParam && !emiId) {
        messages.push(
          `EMI prefill "${emiParam}" was ignored because it is not a valid EMI id.`
        );
      }

      if (subscriptionId) {
        const result = await loadSubscription(subscriptionId, emiId);
        if (emiId && !result.preferredEmiApplied) {
          messages.push(
            `EMI #${emiId} was not applied because it is not available for subscription #${subscriptionId}.`
          );
        }
      } else if (emiId) {
        try {
          const emiPayload = await getAdminEmiForPrefill(emiId);
          if (!cancelled) {
            const result = await loadSubscription(emiPayload.subscription, emiPayload.id);
            if (!result.preferredEmiApplied) {
              messages.push(
                `EMI #${emiId} was loaded but is not currently collectible from the selected subscription state.`
              );
            }
          }
        } catch {
          messages.push(
            `EMI #${emiId} could not be loaded, so the EMI prefill was not applied.`
          );
        }
      }

      if (!cancelled) {
        setPrefillMessages(messages);
      }
    }

    type PrefillEmiPayload = {
      id: number;
      subscription: number;
    };

    async function getAdminEmiForPrefill(emiId: number): Promise<PrefillEmiPayload> {
      const data = await apiFetch<Record<string, unknown>>(`/admin/emis/${emiId}/`);
      return {
        id: Number(data.id ?? emiId),
        subscription: Number(data.subscription ?? 0),
      };
    }

    void applyPrefill();

    return () => {
      cancelled = true;
    };
  }, [loadSubscription, searchParamKey]);

  function onInputChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value } = event.target;
    updateField(name as keyof FormState, value);
  }

  function onSubscriptionPicked(
    subscription: AdminSubscriptionCollectionCandidate
  ) {
    setSubscriptionSearch(getSubscriptionLabel(subscription));
    setSubscriptionOptions([]);
    void loadSubscription(subscription.id);
  }

  function onEmiChanged(event: ChangeEvent<HTMLSelectElement>) {
    const emiId = Number(event.target.value);
    updateField("emi_id", event.target.value);

    const emi = emiOptions.find((item) => item.id === emiId) ?? null;
    setSelectedEmi(emi);

    if (emi) {
      updateField("amount", normalizeOutstandingAmount(emi));
    } else {
      updateField("amount", "");
    }
  }

  function validateForm(): string | null {
    const subscriptionId = Number(form.subscription_id);
    const emiId = Number(form.emi_id);
    const amount = Number(form.amount);

    if (!subscriptionId || !Number.isInteger(subscriptionId)) {
      return "Select a valid subscription.";
    }

    if (!emiId || !Number.isInteger(emiId)) {
      return "Select a valid EMI.";
    }

    if (!form.amount.trim()) {
      return "Amount is required.";
    }

    if (Number.isNaN(amount) || amount <= 0) {
      return "Amount must be greater than zero.";
    }

    if (!form.payment_date.trim()) {
      return "Payment date is required.";
    }

    if (form.payment_method !== "CASH" && !form.reference_no.trim()) {
      return "Reference number is required for non-cash collections.";
    }

    if (form.reference_no.trim().length > 100) {
      return "Reference number is too long.";
    }

    if (form.notes.trim().length > 500) {
      return "Notes must be within 500 characters.";
    }

    return null;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetMessages();
    setSubmitResult(null);

    const validationError = validateForm();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await collectPayment({
        emi: Number(form.emi_id),
        amount: form.amount,
        payment_method: form.payment_method,
        payment_date: form.payment_date,
        reference_no: form.reference_no.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });

      setSubmitResult(result);
      setSuccessMessage(
        `Payment #${result.payment.id} recorded successfully for EMI #${result.emi.id}.`
      );

      if (selectedSubscription?.id) {
        await loadSubscription(selectedSubscription.id, undefined, {
          preserveFeedback: true,
        });
      }
    } catch (error) {
      const normalized = normalizeApiError(error);
      setErrorMessage(normalized.message || "Failed to record payment.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PortalPage
      title="Admin Collection Entry"
      subtitle="Enterprise payment collection workflow with subscription-led selection, EMI auto-fill, and typed service integration."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Payments", href: "/admin/payments" },
        { label: "Collection Entry" },
      ]}
      actions={[
        { label: "All Payments", href: "/admin/payments", variant: "secondary" },
        {
          label: "Reconciliation",
          href: buildAdminReconciliationRoute({ view: "payments" }),
          variant: "secondary",
        },
      ]}
      stats={[
        {
          label: "Selected subscription",
          value: selectedSubscription?.subscription_number || "—",
        },
        {
          label: "Selected EMI",
          value: selectedEmi ? `#${selectedEmi.id}` : "—",
        },
        {
          label: "Auto amount",
          value: form.amount ? formatCurrency(form.amount) : "—",
        },
        {
          label: "Method",
          value: selectedMethodLabel,
        },
      ]}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-900">
              Collection workflow
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Counter staff should first select the subscription, then choose the EMI.
              Amount auto-fills from outstanding value so payment entry remains controlled
              and operationally fast.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label
                htmlFor="subscription-search"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Search subscription
              </label>
              <input
                id="subscription-search"
                type="text"
                value={subscriptionSearch}
                onChange={(event) => setSubscriptionSearch(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                placeholder="Search by subscription number, customer, or phone"
              />

              {searchingSubscriptions ? (
                <p className="mt-2 text-xs text-slate-500">Searching subscriptions...</p>
              ) : null}

              {subscriptionOptions.length > 0 ? (
                <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                  {subscriptionOptions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSubscriptionPicked(item)}
                      className="block w-full border-b border-slate-100 px-4 py-3 text-left text-sm transition hover:bg-slate-50 last:border-b-0"
                    >
                      <div className="font-medium text-slate-900">
                        {item.subscription_number || `SUB-${item.id}`}
                      </div>
                      <div className="mt-1 text-slate-600">{getSubscriptionLabel(item)}</div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="subscription_id"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Subscription ID
                </label>
                <input
                  id="subscription_id"
                  name="subscription_id"
                  type="text"
                  value={form.subscription_id}
                  readOnly
                  className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm text-slate-700"
                  placeholder="Auto-filled from selection"
                />
              </div>

              <div>
                <label
                  htmlFor="emi_id"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  EMI selection <span className="text-red-600">*</span>
                </label>
                <select
                  id="emi_id"
                  name="emi_id"
                  value={form.emi_id}
                  onChange={onEmiChanged}
                  disabled={!selectedSubscription || loadingEmis || emiOptions.length === 0}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100"
                >
                  <option value="">
                    {loadingEmis
                      ? "Loading EMI records..."
                      : emiOptions.length === 0
                        ? "No unpaid EMI available"
                        : "Select EMI"}
                  </option>
                  {emiOptions.map((emi) => (
                    <option key={emi.id} value={emi.id}>
                      {getEmiLabel(emi)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="amount"
                  className="mb-2 block text-sm font-medium text-slate-700"
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
                  onChange={onInputChange}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  placeholder="Auto-filled from outstanding amount"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Auto-filled from selected EMI outstanding amount. Admin may edit only if
                  partial collection is permitted in your backend service.
                </p>
              </div>

              <div>
                <label
                  htmlFor="payment_date"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Payment date <span className="text-red-600">*</span>
                </label>
                <input
                  id="payment_date"
                  name="payment_date"
                  type="date"
                  required
                  value={form.payment_date}
                  onChange={onInputChange}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div>
                <label
                  htmlFor="payment_method"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Payment method <span className="text-red-600">*</span>
                </label>
                <select
                  id="payment_method"
                  name="payment_method"
                  value={form.payment_method}
                  onChange={onInputChange}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  {PAYMENT_METHOD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="reference_no"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Reference number
                  {form.payment_method !== "CASH" ? (
                    <span className="ml-1 text-red-600">*</span>
                  ) : null}
                </label>
                <input
                  id="reference_no"
                  name="reference_no"
                  type="text"
                  value={form.reference_no}
                  onChange={onInputChange}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  placeholder={
                    form.payment_method === "CASH"
                      ? "Optional receipt reference"
                      : "UPI / bank / card trace reference"
                  }
                />
              </div>

              <div className="md:col-span-2">
                <label
                  htmlFor="notes"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Notes
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={4}
                  value={form.notes}
                  onChange={onInputChange}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  placeholder="Counter note, collection remark, or exception detail"
                />
              </div>
            </div>

            {errorMessage ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            {prefillMessages.length > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <div className="font-medium">Some incoming prefills were not applied.</div>
                <ul className="mt-2 list-disc pl-5">
                  {prefillMessages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
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
                disabled={isSubmitting || loadingSubscription || loadingEmis}
                className="inline-flex h-11 items-center rounded-xl bg-slate-900 px-5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Saving..." : "Record Payment"}
              </button>

              <button
                type="button"
                onClick={resetForm}
                disabled={isSubmitting}
                className="inline-flex h-11 items-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reset Form
              </button>

              <Link
                href="/admin/payments"
                className="inline-flex h-11 items-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </Link>
            </div>
          </form>
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
              Selected subscription
            </h3>

            <div className="mt-4 grid gap-3">
              <StatCard
                label="Subscription"
                value={selectedSubscription?.subscription_number || "—"}
                hint={selectedSubscription?.status || "No subscription selected"}
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
                label="Monthly EMI"
                value={formatCurrency(selectedSubscription?.monthly_amount)}
                hint={
                  selectedSubscription?.tenure_months
                    ? `${selectedSubscription.tenure_months} months`
                    : "Tenure not loaded"
                }
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
              Selected EMI
            </h3>

            <div className="mt-4 grid gap-3">
              <StatCard
                label="EMI ID"
                value={selectedEmi ? `#${selectedEmi.id}` : "—"}
                hint={selectedEmi?.status || "No EMI selected"}
              />
              <StatCard
                label="Due date"
                value={formatDateLabel(selectedEmi?.due_date)}
                hint="Scheduled due date"
              />
              <StatCard
                label="EMI amount"
                value={formatCurrency(selectedEmi?.amount)}
                hint="Nominal installment amount"
              />
              <StatCard
                label="Outstanding"
                value={form.amount ? formatCurrency(form.amount) : "—"}
                hint="Auto-filled collection amount"
              />
            </div>
          </div>

          {submitResult ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-800">
                Last recorded payment
              </h3>

              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-emerald-800">Payment ID</dt>
                  <dd className="font-medium text-emerald-900">
                    #{submitResult.payment.id}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-emerald-800">EMI ID</dt>
                  <dd className="font-medium text-emerald-900">#{submitResult.emi.id}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-emerald-800">Status</dt>
                  <dd className="font-medium text-emerald-900">{submitResult.emi.status}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-emerald-800">Outstanding</dt>
                  <dd className="font-medium text-emerald-900">
                    {formatCurrency(submitResult.emi.outstanding_amount)}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-amber-800">
              Control note
            </h3>
            <p className="mt-2 text-sm leading-6 text-amber-800">
              This screen remains safe only when payment creation goes through the hardened
              backend collection service. Do not replace it with direct raw payment row
              creation.
            </p>
          </div>
        </aside>
      </div>
    </PortalPage>
  );
}
