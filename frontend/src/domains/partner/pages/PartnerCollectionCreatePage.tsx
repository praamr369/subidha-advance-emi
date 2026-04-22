// frontend/src/domains/partner/pages/PartnerCollectionCreatePage.tsx
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

type PartnerCollectionCreateVariant = "page" | "drawer";

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
    <div className="rounded-2xl border border-border bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
      <div className="enterprise-eyebrow">{label}</div>
      <div className="mt-2 text-lg font-semibold text-card-foreground">{value}</div>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default function PartnerCollectionCreatePage({
  variant = "page",
  queryString,
  onCreated,
}: {
  variant?: PartnerCollectionCreateVariant;
  queryString?: string;
  onCreated?: (collectionRequestId: number) => void;
} = {}) {
  const runtimeSearchParams = useSearchParams();
  const searchParamKey = useMemo(() => {
    const raw = (queryString ?? "").trim();
    if (raw) return raw.replace(/^\?/, "");
    return runtimeSearchParams.toString();
  }, [queryString, runtimeSearchParams]);

  const searchParams = useMemo(() => new URLSearchParams(searchParamKey), [searchParamKey]);
  const subscriptionFromQuery = searchParams.get("subscription") || "";
  const canonicalSelfHref = useMemo(() => {
    return searchParamKey ? `/partner/collections/create?${searchParamKey}` : "/partner/collections/create";
  }, [searchParamKey]);

  const [form, setForm] = useState<FormState>(() => buildDefaultForm());
  const [subscriptions, setSubscriptions] = useState<PartnerSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState("");
  const [selectedSubscription, setSelectedSubscription] = useState<PartnerSubscription | null>(null);

  const [submitResult, setSubmitResult] = useState<PartnerCollectedPayment | null>(null);
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

        const preselectedId = form.subscription || subscriptionFromQuery ? Number(form.subscription || subscriptionFromQuery) : 0;

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
    PAYMENT_METHOD_OPTIONS.find((option) => option.value === form.payment_mode)?.label ?? form.payment_mode;

  function resetMessages() {
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
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
    if (!subscriptionId || !Number.isInteger(subscriptionId)) return "Select a subscription.";

    const amount = Number(form.amount);
    if (!form.amount.trim()) return "Amount is required.";
    if (Number.isNaN(amount) || amount <= 0) return "Amount must be greater than zero.";

    if (!form.paid_at.trim()) return "Collection date is required.";
    if (!form.payment_mode) return "Collection mode is required.";

    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setSubmitResult(null);

    try {
      const response = await collectPartnerPayment({
        subscription: Number(form.subscription),
        amount: Number(form.amount),
        payment_mode: form.payment_mode,
        paid_at: form.paid_at,
        reference_no: form.reference_no.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });

      setSubmitResult(response);
      setSuccessMessage(response.message || response.detail || "Collection submitted.");

      const requestId = response.request?.id;
      if (typeof requestId === "number" && Number.isFinite(requestId)) {
        onCreated?.(requestId);
      }

      setForm((prev) => ({
        ...prev,
        reference_no: response.reference_no || prev.reference_no,
        notes: "",
      }));
    } catch (error) {
      const normalized = normalizeApiError(error);
      setErrorMessage(normalized.message || "Failed to submit collection.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedSubscriptionCode = selectedSubscription ? getPartnerSubscriptionCode(selectedSubscription) : "—";
  const selectedStatus = selectedSubscription?.status ? `Status ${selectedSubscription.status}` : "Subscription not loaded";
  const showAside = variant === "page";

  return (
    <PortalPage
      title={variant === "drawer" ? "Submit collection" : "Submit Collection"}
      subtitle="Partner-scoped collection submission. Audit and posting controls remain server-enforced."
      helperNote="Use this flow for field collections. It does not replace admin finance controls or reconciliation workflows."
      helperTone="info"
      breadcrumbs={
        variant === "drawer"
          ? []
          : [
              { label: "Partner", href: "/partner" },
              { label: "Collections", href: "/partner/collections" },
              { label: "Create" },
            ]
      }
      actions={
        variant === "drawer"
          ? [
              { href: canonicalSelfHref, label: "Open full page", variant: "secondary" },
              { href: "/partner/collections", label: "Collections register", variant: "ghost" },
            ]
          : [
              { href: "/partner/collections", label: "Back to register", variant: "secondary" },
              { href: "/partner/subscriptions", label: "Subscriptions", variant: "ghost" },
            ]
      }
      stats={
        variant === "drawer"
          ? []
          : [
              { label: "Active subscriptions", value: subscriptions.length },
              { label: "Selected", value: selectedSubscriptionCode, tone: selectedSubscription ? "info" : "default" },
              { label: "Collection mode", value: selectedMethodLabel },
              { label: "Amount", value: form.amount ? money(form.amount) : "—", tone: form.amount ? "success" : "default" },
            ]
      }
      statusBadge={{ label: "Partner Intake", tone: "info" }}
      presentation={variant === "drawer" ? "popup" : "page"}
      maxWidth={variant === "drawer" ? "100%" : undefined}
    >
      {loading ? <LoadingBlock label="Loading partner subscriptions..." /> : null}

      {!loading && errorMessage ? (
        <ErrorState
          title="Unable to load collection form"
          description={errorMessage}
          onRetry={() => void loadSubscriptions("initial")}
        />
      ) : null}

      {!loading && !errorMessage ? (
        <div className={showAside ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]" : "grid gap-6"}>
          <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Collection entry</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Search your active subscription list, then submit the collected amount with a trace reference.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void loadSubscriptions("refresh")}
                  disabled={refreshing || loading}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-[var(--surface-muted)] px-4 text-sm font-semibold text-foreground transition hover:bg-[color-mix(in_oklab,var(--surface-muted)_86%,white_14%)]"
                >
                  Reset
                </button>
              </div>
            </div>

            {successMessage ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                {successMessage}
              </div>
            ) : null}

            {errorMessage ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                {errorMessage}
              </div>
            ) : null}

            <div className="mt-6 grid gap-4">
              <div>
                <label className="block text-sm font-semibold text-foreground">Search subscription</label>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by customer, phone, product, batch, SUB- id…"
                  className="mt-2 h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                />
                <p className="mt-2 text-xs text-muted-foreground">Pick a subscription row below to load default amounts.</p>
              </div>

              <div className="max-h-64 overflow-y-auto rounded-2xl border border-border bg-[var(--surface-muted)] p-2">
                {filteredSubscriptions.length === 0 ? (
                  <EmptyState title="No matching subscriptions" description="Clear the search query or refresh your assignments." />
                ) : (
                  <div className="grid gap-2">
                    {filteredSubscriptions.slice(0, 18).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSubscriptionPick(item)}
                        className="w-full rounded-2xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-strong)]"
                      >
                        <div className="text-sm font-semibold text-foreground">{subscriptionLabel(item)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {item.status ? `Status ${item.status}` : "Status unavailable"}
                          {item.monthly_amount ? ` • Monthly ${money(item.monthly_amount)}` : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-foreground">Amount</label>
                  <input
                    name="amount"
                    value={form.amount}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    inputMode="decimal"
                    className="mt-2 h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-foreground">Collection date</label>
                  <input
                    type="date"
                    name="paid_at"
                    value={form.paid_at}
                    onChange={handleInputChange}
                    className="mt-2 h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-foreground">Collection mode</label>
                  <select
                    name="payment_mode"
                    value={form.payment_mode}
                    onChange={handleInputChange}
                    className="mt-2 h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                  >
                    {PAYMENT_METHOD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-foreground">Reference</label>
                  <input
                    name="reference_no"
                    value={form.reference_no}
                    onChange={handleInputChange}
                    placeholder="Optional trace reference"
                    className="mt-2 h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-foreground">Notes</label>
                  <textarea
                    name="notes"
                    value={form.notes}
                    onChange={handleInputChange}
                    placeholder="Optional notes for admin verification."
                    rows={3}
                    className="mt-2 w-full resize-none rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                  />
                </div>
              </div>

              <div className={variant === "drawer" ? "popup-action-bar items-center" : ""}>
                <button
                  type="submit"
                  disabled={submitting || !selectedSubscription}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-primary/80 bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_18px_34px_-24px_rgba(30,64,175,0.62)] transition hover:bg-[color-mix(in_oklab,var(--primary)_90%,black_10%)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Submitting..." : "Submit collection"}
                </button>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Partner collection entry should remain audit-safe and scoped. Use canonical pages for deep verification and reconciliation.
              </div>
            </div>
          </form>

          {showAside ? (
            <aside className="space-y-4">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Selected subscription</h3>
                <div className="mt-4 grid gap-3">
                  <StatCard label="Subscription" value={selectedSubscriptionCode} hint={selectedStatus} />
                  <StatCard
                    label="Customer"
                    value={selectedSubscription?.customer_name || "—"}
                    hint={selectedSubscription?.customer_phone || "Customer not loaded"}
                  />
                  <StatCard
                    label="Product"
                    value={selectedSubscription?.product_name || "—"}
                    hint={selectedSubscription?.batch_code ? `Batch ${selectedSubscription.batch_code}` : "Batch not loaded"}
                  />
                  <StatCard
                    label="Monthly Amount"
                    value={money(selectedSubscription?.monthly_amount)}
                    hint={selectedSubscription?.tenure_months ? `${selectedSubscription.tenure_months} months` : "Tenure not loaded"}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Submission summary</h3>
                <div className="mt-4 grid gap-3">
                  <StatCard label="Method" value={selectedMethodLabel} hint="Selected collection mode" />
                  <StatCard label="Collection Date" value={formatDateLabel(form.paid_at)} hint="Field collection date" />
                  <StatCard label="Reference" value={form.reference_no.trim() || "—"} hint="Trace reference" />
                  <StatCard label="Amount" value={form.amount ? money(form.amount) : "—"} hint="Submitted collection amount" />
                </div>
              </div>

              {submitResult ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-800">Last submission</h3>

                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-emerald-800">Result</dt>
                      <dd className="font-medium text-emerald-900">
                        {submitResult.message || submitResult.detail || "Submitted"}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-emerald-800">Reference</dt>
                      <dd className="font-medium text-emerald-900">{submitResult.reference_no || form.reference_no || "—"}</dd>
                    </div>
                  </dl>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {submitResult.request?.id ? (
                      <Link
                        href={`/partner/collections/${submitResult.request.id}`}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100"
                      >
                        Open request detail
                      </Link>
                    ) : null}
                    <Link
                      href="/partner/collections"
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100"
                    >
                      Open collections
                    </Link>
                  </div>
                </div>
              ) : null}
            </aside>
          ) : null}
        </div>
      ) : null}
    </PortalPage>
  );
}
