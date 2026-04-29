"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

import PortalPage from "@/components/ui/PortalPage";
import ActionButton from "@/components/ui/ActionButton";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import { apiFetch } from "@/lib/api";
import { buildAdminReconciliationRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import { normalizeApiError } from "@/services/api/errors";
import AdminDirectSaleCollectForm from "@/features/direct-sale/components/AdminDirectSaleCollectForm";
import UnifiedReceivableSearchPanel from "@/features/receivables/UnifiedReceivableSearchPanel";
import { listFinanceAccounts, type FinanceAccount } from "@/services/accounting";
import {
  listBranches,
  listCashCounters,
  type BranchRecord,
  type CashCounterRecord,
} from "@/services/branch-control";
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
import {
  searchAdminReceivables,
  type UnifiedReceivableResult,
} from "@/services/receivables";

type AdminPaymentCollectVariant = "page" | "drawer";

type FormState = {
  subscription_id: string;
  emi_id: string;
  amount: string;
  finance_account_id: string;
  branch_id: string;
  cash_counter_id: string;
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

const FIELD_CLASS_NAME =
  "w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2.5 text-sm text-foreground outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35";
const READ_ONLY_FIELD_CLASS_NAME =
  "w-full rounded-xl border border-border bg-[var(--surface-muted)] px-3 py-2.5 text-sm text-muted-foreground";
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
    finance_account_id: "",
    branch_id: "",
    cash_counter_id: "",
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
    <div className="rounded-2xl border border-border bg-[var(--surface-card-elevated)] p-4 shadow-[0_14px_32px_-26px_rgba(15,23,42,0.3)]">
      <div className="enterprise-eyebrow">
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold text-foreground">{value}</div>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default function AdminPaymentCollectPage({
  variant = "page",
  queryString,
  onCreated,
}: {
  variant?: AdminPaymentCollectVariant;
  queryString?: string;
  onCreated?: (paymentId: number) => void;
} = {}) {
  const runtimeSearchParams = useSearchParams();
  const searchParamKey = useMemo(() => {
    const raw = (queryString ?? "").trim();
    if (raw) return raw.replace(/^\?/, "");
    return runtimeSearchParams.toString();
  }, [queryString, runtimeSearchParams]);
  const canonicalSelfHref = useMemo(() => {
    return searchParamKey ? `${ROUTES.admin.financeCollect}?${searchParamKey}` : ROUTES.admin.financeCollect;
  }, [searchParamKey]);
  const collectionWorkflow = useMemo(
    () =>
      new URLSearchParams(searchParamKey).get("workflow") === "direct-sale"
        ? "direct-sale"
        : "subscription",
    [searchParamKey]
  );
  const prefillDirectSaleId = useMemo(() => {
    const raw = new URLSearchParams(searchParamKey).get("direct_sale");
    return parsePositiveInteger(raw);
  }, [searchParamKey]);
  const [form, setForm] = useState<FormState>(() => buildDefaultForm());

  const [subscriptionSearch, setSubscriptionSearch] = useState("");
  const [subscriptionOptions, setSubscriptionOptions] = useState<
    AdminSubscriptionCollectionCandidate[]
  >([]);
  const [selectedSubscription, setSelectedSubscription] =
    useState<AdminSubscriptionCollectionCandidate | null>(null);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [counters, setCounters] = useState<CashCounterRecord[]>([]);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);

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
  const [unifiedSearchQuery, setUnifiedSearchQuery] = useState("");
  const [unifiedSearchResults, setUnifiedSearchResults] = useState<
    UnifiedReceivableResult[]
  >([]);
  const [unifiedSearchLoading, setUnifiedSearchLoading] = useState(false);
  const [unifiedSearchError, setUnifiedSearchError] = useState<string | null>(null);
  const [unifiedSearchSubmitted, setUnifiedSearchSubmitted] = useState(false);
  const [unifiedActionLoadingKey, setUnifiedActionLoadingKey] = useState<string | null>(null);
  const [unifiedLastPaymentSummary, setUnifiedLastPaymentSummary] = useState<string | null>(null);

  const selectedMethodLabel =
    PAYMENT_METHOD_OPTIONS.find(
      (option) => option.value === form.payment_method
    )?.label ?? form.payment_method;
  const showAside = variant === "page";
  const availableCounters = form.branch_id
    ? counters.filter((counter) => String(counter.branch) === form.branch_id)
    : counters;
  const availableFinanceAccounts = useMemo(
    () =>
      financeAccounts.filter((account) =>
        form.payment_method === "CARD"
          ? account.kind === "BANK"
          : account.kind === form.payment_method
      ),
    [financeAccounts, form.payment_method]
  );

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
      finance_account_id: "",
      branch_id: "",
      cash_counter_id: "",
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

  async function handleUnifiedReceivableSearch(query: string) {
    const trimmed = query.trim();
    setUnifiedSearchSubmitted(true);
    setUnifiedSearchError(null);
    setUnifiedLastPaymentSummary(null);

    if (!trimmed) {
      setUnifiedSearchResults([]);
      setUnifiedSearchError("Enter a phone, contract reference, Lucky ID, batch, KYC, customer, or sale reference.");
      return;
    }

    setUnifiedSearchLoading(true);
    try {
      const payload = await searchAdminReceivables(trimmed);
      setUnifiedSearchResults(payload.results);
    } catch (error) {
      setUnifiedSearchResults([]);
      setUnifiedSearchError(
        normalizeApiError(error).message || "Unable to search receivables."
      );
    } finally {
      setUnifiedSearchLoading(false);
    }
  }

  async function handleUnifiedAdvanceEmiSelect(row: UnifiedReceivableResult) {
    if (!row.source_id) {
      setUnifiedSearchError("This receivable does not include a subscription id.");
      return;
    }
    const actionKey = `${row.source_type}-${row.source_id}`;
    setUnifiedActionLoadingKey(actionKey);
    try {
      await loadSubscription(row.source_id);
      setSuccessMessage(null);
      setErrorMessage(null);
    } finally {
      setUnifiedActionLoadingKey(null);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadBranchMasters() {
      try {
        const [branchPayload, counterPayload, financeAccountPayload] = await Promise.all([
          listBranches({ status: "ACTIVE" }),
          listCashCounters({ is_active: "true" }),
          listFinanceAccounts({ is_active: 1, page_size: 100 }),
        ]);
        if (!active) return;
        setBranches(branchPayload.results);
        setCounters(counterPayload.results);
        setFinanceAccounts(financeAccountPayload.results.filter((account) => account.is_active));
      } catch {
        if (!active) return;
        setBranches([]);
        setCounters([]);
        setFinanceAccounts([]);
      }
    }

    void loadBranchMasters();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (
      form.finance_account_id &&
      availableFinanceAccounts.some(
        (account) => String(account.id) === form.finance_account_id
      )
    ) {
      return;
    }

    updateField(
      "finance_account_id",
      availableFinanceAccounts[0] ? String(availableFinanceAccounts[0].id) : ""
    );
  }, [availableFinanceAccounts, form.finance_account_id, updateField]);

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

    const subscriptionParam =
      params.get("subscription") ?? params.get("subscription_id");
    const emiParam = params.get("emi") ?? params.get("emi_id");

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

      if (subscriptionId) {
        updateField("subscription_id", String(subscriptionId));
      }
      if (emiId) {
        updateField("emi_id", String(emiId));
      }

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
        if (emiId) {
          setEmiOptions((prev) => {
            if (prev.some((item) => item.id === emiId)) return prev;
            return [
              {
                id: emiId,
                subscription: subscriptionId,
                amount: "0.00",
                status: "PENDING",
              },
              ...prev,
            ];
          });
        }
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
  }, [loadSubscription, searchParamKey, updateField]);

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

    if (!form.finance_account_id.trim()) {
      return "Finance account is required.";
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

  function onFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Posting is confirmed via the explicit confirmation control.
  }

  async function submitPayment() {
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
        finance_account_id: Number(form.finance_account_id),
        branch_id: form.branch_id ? Number(form.branch_id) : undefined,
        cash_counter_id: form.cash_counter_id
          ? Number(form.cash_counter_id)
          : undefined,
        reference_no: form.reference_no.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });

      setSubmitResult(result);
      setSuccessMessage(
        `Payment #${result.payment.id} recorded successfully for EMI #${result.emi.id}.`
      );
      setUnifiedLastPaymentSummary(
        `Last payment status: success — payment #${result.payment.id} for EMI #${result.emi.id} (${formatCurrency(result.payment.amount)} · ${String(result.payment.method ?? result.payment.payment_method ?? form.payment_method).toUpperCase()}).`
      );
      onCreated?.(result.payment.id);

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

  if (collectionWorkflow === "direct-sale") {
    return (
      <PortalPage
        title={variant === "drawer" ? "Collect direct-sale balance" : "Admin Direct-Sale Collection"}
        subtitle="Retail receivable collection workflow for invoiced direct sales with outstanding balance."
        helperNote="This path creates a retail receipt against an existing direct-sale receivable. It stays separate from EMI allocation, winner waivers, and subscription reconciliation."
        helperTone="info"
        breadcrumbs={
          variant === "drawer"
            ? []
            : [
                { label: "Admin", href: "/admin" },
                { label: "Direct Sale", href: "/admin/billing/direct-sales" },
                { label: "Collection Entry" },
              ]
        }
        actions={
          variant === "drawer"
            ? [
                { label: "Open full page", href: canonicalSelfHref, variant: "secondary" },
                { label: "Direct Sales", href: "/admin/billing/direct-sales", variant: "ghost" },
              ]
            : [
                { label: "Direct Sales", href: "/admin/billing/direct-sales", variant: "secondary" },
                { label: "Retail Receipts", href: "/admin/billing/receipts", variant: "secondary" },
                { label: "Collections Workspace", href: "/admin/collections", variant: "ghost" },
              ]
        }
        presentation={variant === "drawer" ? "popup" : "page"}
        maxWidth={variant === "drawer" ? "100%" : undefined}
      >
        <AdminDirectSaleCollectForm
          variant={variant}
          canonicalSelfHref={canonicalSelfHref}
          prefillDirectSaleId={prefillDirectSaleId}
        />
      </PortalPage>
    );
  }

  return (
    <PortalPage
      title={variant === "drawer" ? "Collect payment" : "Admin Collection Entry"}
      subtitle="Enterprise payment collection workflow with subscription-led selection, EMI auto-fill, and typed service integration."
      helperNote="This screen posts into the existing payment service path; no ledger, waiver, or reconciliation semantics are altered by UI input."
      helperTone="info"
      breadcrumbs={
        variant === "drawer"
          ? []
          : [
              { label: "Admin", href: "/admin" },
              { label: "Payments", href: "/admin/payments" },
              { label: "Collection Entry" },
            ]
      }
      actions={
        variant === "drawer"
          ? [
              { label: "Open full page", href: canonicalSelfHref, variant: "secondary" },
              { label: "All Payments", href: "/admin/payments", variant: "ghost" },
            ]
          : [
              { label: "All Payments", href: "/admin/payments", variant: "secondary" },
              {
                label: "Reconciliation",
                href: buildAdminReconciliationRoute({ view: "payments" }),
                variant: "secondary",
              },
            ]
      }
      stats={
        variant === "drawer"
          ? []
          : [
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
            ]
      }
      presentation={variant === "drawer" ? "popup" : "page"}
      maxWidth={variant === "drawer" ? "100%" : undefined}
    >
      <div className="space-y-6">
        <UnifiedReceivableSearchPanel
          title="Universal contract search"
          description="Search across Advance EMI, rent, lease, and direct-sale references. Active actions route back into the existing posting workflows."
          query={unifiedSearchQuery}
          results={unifiedSearchResults}
          loading={unifiedSearchLoading}
          error={unifiedSearchError}
          searched={unifiedSearchSubmitted}
          actionLoadingKey={unifiedActionLoadingKey}
          lastPaymentSummary={unifiedLastPaymentSummary}
          onQueryChange={setUnifiedSearchQuery}
          onSearch={handleUnifiedReceivableSearch}
          onAdvanceEmiSelect={handleUnifiedAdvanceEmiSelect}
        />

      <div className={showAside ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]" : "grid gap-6"}>
        <section className="surface-panel-elevated rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="enterprise-section-title text-lg">
              Collection workflow
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Counter staff should first select the subscription, then choose the EMI.
              Amount auto-fills from outstanding value so payment entry remains controlled
              and operationally fast.
            </p>
          </div>

          <form onSubmit={onFormSubmit} className="space-y-6">
            <div className="surface-subtle rounded-2xl p-4">
              <label
                htmlFor="subscription-search"
                className="mb-2 block text-sm font-semibold text-foreground"
              >
                Search subscription
              </label>
              <input
                id="subscription-search"
                type="text"
                value={subscriptionSearch}
                onChange={(event) => setSubscriptionSearch(event.target.value)}
                className={FIELD_CLASS_NAME}
                placeholder="Search by subscription number, customer, or phone"
              />

              {searchingSubscriptions ? (
                <p className="mt-2 text-xs text-muted-foreground">Searching subscriptions...</p>
              ) : null}

              {subscriptionOptions.length > 0 ? (
                <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-border bg-[var(--surface-card-elevated)]">
                  {subscriptionOptions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSubscriptionPicked(item)}
                      className="block w-full border-b border-border/70 px-4 py-3 text-left text-sm transition hover:bg-[var(--surface-muted)] last:border-b-0"
                    >
                      <div className="font-semibold text-foreground">
                        {item.subscription_number || `SUB-${item.id}`}
                      </div>
                      <div className="mt-1 text-muted-foreground">{getSubscriptionLabel(item)}</div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="subscription_id"
                  className="mb-2 block text-sm font-semibold text-foreground"
                >
                  Subscription ID
                </label>
                <input
                  id="subscription_id"
                  name="subscription_id"
                  type="text"
                  value={form.subscription_id}
                  readOnly
                  className={READ_ONLY_FIELD_CLASS_NAME}
                  placeholder="Auto-filled from selection"
                />
              </div>

              <div>
                <label
                  htmlFor="emi_id"
                  className="mb-2 block text-sm font-semibold text-foreground"
                >
                  EMI selection <span className="text-red-600">*</span>
                </label>
                <select
                  id="emi_id"
                  name="emi_id"
                  value={form.emi_id}
                  onChange={onEmiChanged}
                  disabled={!selectedSubscription || loadingEmis || emiOptions.length === 0}
                  className={`${FIELD_CLASS_NAME} disabled:bg-[var(--surface-muted)]`}
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
                  className="mb-2 block text-sm font-semibold text-foreground"
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
                  className={FIELD_CLASS_NAME}
                  placeholder="Auto-filled from outstanding amount"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Auto-filled from selected EMI outstanding amount. Admin may edit only if
                  partial collection is permitted in your backend service.
                </p>
              </div>

              <div>
                <label
                  htmlFor="payment_date"
                  className="mb-2 block text-sm font-semibold text-foreground"
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
                  className={FIELD_CLASS_NAME}
                />
              </div>

              <div>
                <label
                  htmlFor="payment_method"
                  className="mb-2 block text-sm font-semibold text-foreground"
                >
                  Payment method <span className="text-red-600">*</span>
                </label>
                <select
                  id="payment_method"
                  name="payment_method"
                  value={form.payment_method}
                  onChange={onInputChange}
                  className={FIELD_CLASS_NAME}
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
                  htmlFor="finance_account_id"
                  className="mb-2 block text-sm font-semibold text-foreground"
                >
                  Finance account <span className="text-red-600">*</span>
                </label>
                <select
                  id="finance_account_id"
                  name="finance_account_id"
                  value={form.finance_account_id}
                  onChange={onInputChange}
                  className={FIELD_CLASS_NAME}
                  required
                >
                  <option value="">Select finance account</option>
                  {availableFinanceAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} · {account.kind} · {account.chart_account_code || "No chart code"}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  This route controls the operational finance posting used by the backend collection service.
                </p>
              </div>

              <div>
                <label
                  htmlFor="branch_id"
                  className="mb-2 block text-sm font-semibold text-foreground"
                >
                  Branch
                </label>
                <select
                  id="branch_id"
                  name="branch_id"
                  value={form.branch_id}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      branch_id: event.target.value,
                      cash_counter_id: "",
                    }))
                  }
                  className={FIELD_CLASS_NAME}
                >
                  <option value="">Primary/default branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.code} · {branch.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="cash_counter_id"
                  className="mb-2 block text-sm font-semibold text-foreground"
                >
                  Counter / Cash Desk
                </label>
                <select
                  id="cash_counter_id"
                  name="cash_counter_id"
                  value={form.cash_counter_id}
                  onChange={onInputChange}
                  className={FIELD_CLASS_NAME}
                >
                  <option value="">No explicit counter</option>
                  {availableCounters.map((counter) => (
                    <option key={counter.id} value={counter.id}>
                      {counter.code} · {counter.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="reference_no"
                  className="mb-2 block text-sm font-semibold text-foreground"
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
                  className={FIELD_CLASS_NAME}
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
                  className="mb-2 block text-sm font-semibold text-foreground"
                >
                  Notes
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={4}
                  value={form.notes}
                  onChange={onInputChange}
                  className={FIELD_CLASS_NAME}
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
                {submitResult?.finance_account ? (
                  <div className="mt-1">
                    Finance account {submitResult.finance_account.name} · {submitResult.finance_account.kind} · Reconciliation {submitResult.reconciliation_status || "PENDING"}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className={variant === "drawer" ? "popup-action-bar items-center" : "flex flex-wrap items-center gap-3 pt-2"}>
              <ConfirmActionButton
                label="Record Payment"
                confirmLabel={isSubmitting ? "Posting..." : "Confirm posting"}
                title="Confirm payment posting"
                description="This action posts a financial collection record and updates the selected EMI allocation state. Confirm the subscription, EMI, amount, branch/counter, method, and reference number before posting."
                onConfirm={submitPayment}
                variant="primary"
                disabled={isSubmitting || loadingSubscription || loadingEmis}
                className="h-11"
              />

              <ActionButton
                type="button"
                variant="outline"
                size="lg"
                onClick={resetForm}
                disabled={isSubmitting}
              >
                Reset Form
              </ActionButton>

              <ActionButton
                href="/admin/payments"
                variant="outline"
                size="lg"
              >
                Cancel
              </ActionButton>
            </div>
          </form>
        </section>

        {showAside ? (
          <aside className="space-y-4">
            <div className="surface-panel-elevated rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h3 className="enterprise-eyebrow text-sm">
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

            <div className="surface-panel-elevated rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h3 className="enterprise-eyebrow text-sm">
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
      ) : null}
      </div>
      </div>
    </PortalPage>
  );
}
