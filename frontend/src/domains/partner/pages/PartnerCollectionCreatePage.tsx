"use client";

import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { normalizeApiError } from "@/services/api/errors";
import ActionButton from "@/components/ui/ActionButton";
import FormActions from "@/components/ui/FormActions";
import FormSection from "@/components/ui/FormSection";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceNotice } from "@/components/ui/role-workspace";
import { DetailItem, WorkspaceSection } from "@/components/ui/workspace";
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

  const searchParams = useMemo(
    () => new URLSearchParams(searchParamKey),
    [searchParamKey]
  );
  const subscriptionFromQuery = searchParams.get("subscription") || "";
  const canonicalSelfHref = useMemo(() => {
    return searchParamKey
      ? `/partner/collections/create?${searchParamKey}`
      : "/partner/collections/create";
  }, [searchParamKey]);

  const [form, setForm] = useState<FormState>(() => buildDefaultForm());
  const [subscriptions, setSubscriptions] = useState<PartnerSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState("");
  const [selectedSubscription, setSelectedSubscription] =
    useState<PartnerSubscription | null>(null);

  const [submitResult, setSubmitResult] =
    useState<PartnerCollectedPayment | null>(null);
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
        setErrorMessage(
          normalized.message || "Failed to load partner subscriptions."
        );
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
    PAYMENT_METHOD_OPTIONS.find((option) => option.value === form.payment_mode)
      ?.label ?? form.payment_mode;

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
    if (!subscriptionId || !Number.isInteger(subscriptionId))
      return "Select a subscription.";

    const amount = Number(form.amount);
    if (!form.amount.trim()) return "Amount is required.";
    if (Number.isNaN(amount) || amount <= 0)
      return "Amount must be greater than zero.";

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

  const selectedSubscriptionCode = selectedSubscription
    ? getPartnerSubscriptionCode(selectedSubscription)
    : "—";
  const selectedStatus = selectedSubscription?.status
    ? `Status ${selectedSubscription.status}`
    : "Subscription not loaded";
  const showAside = variant === "page";

  return (
    <ERPPageShell
      eyebrow="Partner Collections"
      title={variant === "drawer" ? "Submit collection" : "Submit Collection"}
      subtitle="Partner-scoped collection submission. Verification, posting, and audit controls remain server-enforced."
      helperNote="Use this flow for field collection intake only. It does not replace admin finance controls, payout rules, or reconciliation workflows."
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
              {
                href: canonicalSelfHref,
                label: "Open full page",
                variant: "secondary",
              },
              {
                href: "/partner/collections",
                label: "Collections register",
                variant: "ghost",
              },
            ]
          : [
              {
                href: "/partner/collections",
                label: "Back to register",
                variant: "secondary",
              },
              {
                href: "/partner/subscriptions",
                label: "Subscriptions",
                variant: "ghost",
              },
            ]
      }
      stats={
        variant === "drawer"
          ? []
          : [
              { label: "Active subscriptions", value: subscriptions.length },
              {
                label: "Selected",
                value: selectedSubscriptionCode,
                tone: selectedSubscription ? "info" : "default",
              },
              { label: "Collection mode", value: selectedMethodLabel },
              {
                label: "Amount",
                value: form.amount ? money(form.amount) : "—",
                tone: form.amount ? "success" : "default",
              },
            ]
      }
      statusBadge={{ label: "Partner intake", tone: "info" }}
      presentation={variant === "drawer" ? "popup" : "page"}
      maxWidth={variant === "drawer" ? "100%" : undefined}
    >
      {loading ? <LoadingBlock label="Loading partner subscriptions..." /> : null}

      {!loading && errorMessage && subscriptions.length === 0 ? (
        <ErrorState
          title="Unable to load collection form"
          description={errorMessage}
          onRetry={() => void loadSubscriptions("initial")}
        />
      ) : null}

      {!loading && (!errorMessage || subscriptions.length > 0) ? (
        <>
          {successMessage ? (
            <WorkspaceNotice tone="success" title="Collection submitted">
              {successMessage}
            </WorkspaceNotice>
          ) : null}

          {errorMessage && subscriptions.length > 0 ? (
            <WorkspaceNotice tone="danger" title="Collection not submitted">
              {errorMessage}
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
              title="Collection entry"
              description="Search active partner subscriptions, then submit a collection amount with trace details for controlled verification."
              action={
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    variant="outline"
                    onClick={() => void loadSubscriptions("refresh")}
                    disabled={refreshing || loading}
                  >
                    {refreshing ? "Refreshing..." : "Refresh"}
                  </ActionButton>
                  <ActionButton
                    variant="outline"
                    onClick={resetForm}
                    disabled={submitting}
                  >
                    Reset
                  </ActionButton>
                </div>
              }
            >
              <form onSubmit={handleSubmit}>
                <div className="space-y-5">
                  <FormSection
                    title="Subscription search"
                    description="Search by subscription, customer, phone, product, batch, or partner-visible assignment."
                    columns={1}
                  >
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-foreground">
                        Search subscription
                      </label>
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search by customer, phone, product, batch, SUB- id…"
                        className="h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                      />
                    </div>

                    <div className="max-h-64 overflow-y-auto rounded-2xl border border-border bg-[var(--surface-muted)] p-2">
                      {filteredSubscriptions.length === 0 ? (
                        <EmptyState
                          title="No matching subscriptions"
                          description="Clear the search query or refresh your assignments."
                        />
                      ) : (
                        <div className="grid gap-2">
                          {filteredSubscriptions.slice(0, 18).map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleSubscriptionPick(item)}
                              className="w-full rounded-2xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-strong)]"
                            >
                              <div className="text-sm font-semibold text-foreground">
                                {subscriptionLabel(item)}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {item.status ? `Status ${item.status}` : "Status unavailable"}
                                {item.monthly_amount
                                  ? ` • Monthly ${money(item.monthly_amount)}`
                                  : ""}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </FormSection>

                  <FormSection
                    title="Collection details"
                    description="Amount, date, and reference stay attached to the partner request for later verification."
                    columns={2}
                  >
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-foreground">
                        Amount
                      </label>
                      <input
                        name="amount"
                        value={form.amount}
                        onChange={handleInputChange}
                        placeholder="0.00"
                        inputMode="decimal"
                        className="h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-foreground">
                        Collection date
                      </label>
                      <input
                        type="date"
                        name="paid_at"
                        value={form.paid_at}
                        onChange={handleInputChange}
                        className="h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-foreground">
                        Collection mode
                      </label>
                      <select
                        name="payment_mode"
                        value={form.payment_mode}
                        onChange={handleInputChange}
                        className="h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                      >
                        {PAYMENT_METHOD_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-foreground">
                        Reference
                      </label>
                      <input
                        name="reference_no"
                        value={form.reference_no}
                        onChange={handleInputChange}
                        placeholder="Optional trace reference"
                        className="h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-semibold text-foreground">
                        Notes
                      </label>
                      <textarea
                        name="notes"
                        value={form.notes}
                        onChange={handleInputChange}
                        placeholder="Optional notes for admin verification."
                        rows={3}
                        className="w-full resize-none rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                      />
                    </div>
                  </FormSection>

                  <WorkspaceNotice tone="warning" title="Operational boundary">
                    Partner collection entry remains audit-safe and scoped. Approval, payment posting, payout, and reconciliation stay on controlled backend-admin paths.
                  </WorkspaceNotice>

                  <FormActions
                    submitLabel="Submit collection"
                    submitLoadingLabel="Submitting..."
                    submitting={submitting}
                    submitDisabled={!selectedSubscription}
                    sticky={variant === "drawer"}
                    cancel={
                      variant === "page"
                        ? {
                            label: "Back to register",
                            href: "/partner/collections",
                          }
                        : null
                    }
                  />
                </div>
              </form>
            </WorkspaceSection>

            {showAside ? (
              <div className="space-y-6">
                <WorkspaceSection
                  title="Selected subscription"
                  description="Partner-visible subscription context used for this collection request."
                >
                  <div className="grid gap-4">
                    <DetailItem
                      label="Subscription"
                      value={selectedSubscriptionCode}
                    />
                    <DetailItem
                      label="Customer"
                      value={selectedSubscription?.customer_name || "—"}
                    />
                    <DetailItem
                      label="Product"
                      value={selectedSubscription?.product_name || "—"}
                    />
                    <DetailItem
                      label="Monthly amount"
                      value={money(selectedSubscription?.monthly_amount)}
                    />
                    <DetailItem label="Status" value={selectedStatus} />
                  </div>
                </WorkspaceSection>

                <WorkspaceSection
                  title="Submission summary"
                  description="Current collection request values before submission."
                >
                  <div className="grid gap-4">
                    <DetailItem label="Method" value={selectedMethodLabel} />
                    <DetailItem
                      label="Collection date"
                      value={formatDateLabel(form.paid_at)}
                    />
                    <DetailItem
                      label="Reference"
                      value={form.reference_no.trim() || "—"}
                    />
                    <DetailItem
                      label="Amount"
                      value={form.amount ? money(form.amount) : "—"}
                    />
                  </div>
                </WorkspaceSection>

                {submitResult ? (
                  <WorkspaceSection
                    title="Last submission"
                    description="Latest request created from this form submission."
                  >
                    <div className="grid gap-4">
                      <DetailItem
                        label="Result"
                        value={
                          submitResult.message || submitResult.detail || "Submitted"
                        }
                      />
                      <DetailItem
                        label="Reference"
                        value={
                          submitResult.reference_no || form.reference_no || "—"
                        }
                      />
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {submitResult.request?.id ? (
                        <ActionButton
                          href={`/partner/collections/${submitResult.request.id}`}
                          variant="outline"
                        >
                          Open request detail
                        </ActionButton>
                      ) : null}
                      <ActionButton href="/partner/collections" variant="outline">
                        Open collections
                      </ActionButton>
                    </div>
                  </WorkspaceSection>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </ERPPageShell>
  );
}
