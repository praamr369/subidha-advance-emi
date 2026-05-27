"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import ActionButton from "@/components/ui/ActionButton";
import { FormSection } from "@/components/ui/operations";
import { CashierWorkflowShell } from "@/components/layout/page-shells";
import StatusBadge from "@/components/ui/status-badge";
import CashierDirectSaleCollectPanel from "@/features/direct-sale/components/CashierDirectSaleCollectPanel";
import UnifiedReceivableSearchPanel from "@/features/receivables/UnifiedReceivableSearchPanel";
import { CustomerIntelligenceTrigger } from "@/components/customer-intelligence/CustomerIntelligenceTrigger";
import {
  collectAdvance,
  collectPayment,
  getPendingEmisByPhone,
  listCashierFinanceAccounts,
  searchCashierCollectibleEmis,
  type CashierCollectAdvanceResponse,
  type CashierCollectPaymentResponse,
  type CashierCollectibleSearchResult,
  type FinanceAccount,
  type PendingEmiLookupResponse,
  type PendingEmiRecord,
} from "@/services/cashier";
import {
  searchCashierReceivables,
  type UnifiedReceivableResult,
} from "@/services/receivables";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Request failed.";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function parsePositiveInteger(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function withTimeout<T>(promise: Promise<T>, ms = 20000): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Request timed out. Please retry.")), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function isEmiOverdue(emi: PendingEmiRecord | null | undefined): boolean {
  if (!emi) return false;
  if (typeof emi.is_overdue === "boolean") return emi.is_overdue;
  const parsed = Date.parse(emi.due_date || "");
  if (Number.isNaN(parsed)) return false;
  return parsed < Date.now();
}

function overdueLabel(emi: PendingEmiRecord | null | undefined): string {
  if (!emi) return "On schedule";
  const overdueDays = emi.overdue_days ?? 0;
  if (isEmiOverdue(emi) && overdueDays > 0) {
    return `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`;
  }
  return "Due queue";
}

function financeAccountOptionLabel(account: FinanceAccount): string {
  const coaCode = account.mapped_chart_account_code || account.chart_account_code || "No COA";
  const coaName = account.mapped_chart_account_name || account.chart_account_name || "unmapped";
  const ready = account.collection_ready === false ? "Blocked" : "Ready";
  return `${account.name} · ${account.kind} · ${coaCode} ${coaName} · ${ready}`;
}

function financeAccountBlocker(account: FinanceAccount | null | undefined): string | null {
  if (!account || account.collection_ready !== false) return null;
  return (
    account.collection_blocker_reason ||
    "This account cannot receive payments because it is mapped to a non-posting Chart of Account."
  );
}

function isRestrictedSubscriptionStatus(status?: string | null): boolean {
  if (!status) return false;
  const token = status.trim().toUpperCase();
  return ["BLOCKED", "CANCELLED", "DEFAULTED", "VOID", "CLOSED", "INACTIVE"].includes(token);
}

type PaymentMethod = "CASH" | "UPI" | "BANK";
type CashierSearchMode = "phone" | "subscription" | "lucky" | "emi";
type CollectionWorkflow = "subscription" | "direct-sale";

const SEARCH_MODE_CONFIG: Record<
  CashierSearchMode,
  {
    label: string;
    inputLabel: string;
    placeholder: string;
    help: string;
  }
> = {
  phone: {
    label: "Phone",
    inputLabel: "Customer phone",
    placeholder: "Enter registered phone number",
    help:
      "Phone lookup loads the full pending EMI queue for that customer directly.",
  },
  subscription: {
    label: "Subscription",
    inputLabel: "Subscription number / ID",
    placeholder: "Enter SUB-123, raw subscription ID, or contract reference",
    help:
      "Subscription search finds collectible EMI rows, then loads that customer queue for final selection.",
  },
  lucky: {
    label: "Lucky ID",
    inputLabel: "Lucky ID / lucky number",
    placeholder: "Enter Lucky ID row id or lucky number",
    help:
      "Lucky search is useful when the customer only knows the lucky number used in the batch.",
  },
  emi: {
    label: "EMI",
    inputLabel: "EMI ID",
    placeholder: "Enter EMI row id",
    help:
      "Use EMI search when the counter staff already has the exact installment row id from an earlier lookup.",
  },
};

const FIELD_CLASS_NAME =
  "h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35";
const SECONDARY_BUTTON_CLASS_NAME =
  "inline-flex h-11 items-center justify-center rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60";

export default function CashierCollectPage() {
  const searchParams = useSearchParams();
  const workflowQueryParam = searchParams.get("workflow");
  const directSaleQueryParam = searchParams.get("direct_sale");
  const [collectionWorkflow, setCollectionWorkflow] =
    useState<CollectionWorkflow>("subscription");
  const [searchMode, setSearchMode] = useState<CashierSearchMode>("phone");
  const [searchInput, setSearchInput] = useState("");
  const [submittedPhone, setSubmittedPhone] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");

  const [lookup, setLookup] = useState<PendingEmiLookupResponse | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [searchResults, setSearchResults] = useState<
    CashierCollectibleSearchResult[]
  >([]);
  const [searchingMatches, setSearchingMatches] = useState(false);
  const [searchResultsError, setSearchResultsError] = useState<string | null>(
    null
  );

  const [selectedEmiId, setSelectedEmiId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);
  const [selectedFinanceAccountId, setSelectedFinanceAccountId] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [note, setNote] = useState("");
  const [collecting, setCollecting] = useState(false);
  const [collectError, setCollectError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CashierCollectPaymentResponse | null>(
    null
  );
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceFinanceAccountId, setAdvanceFinanceAccountId] = useState("");
  const [advanceReferenceNo, setAdvanceReferenceNo] = useState("");
  const [advanceNote, setAdvanceNote] = useState("");
  const [advanceSubmitting, setAdvanceSubmitting] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [advanceSuccess, setAdvanceSuccess] =
    useState<CashierCollectAdvanceResponse | null>(null);
  const [unifiedSearchQuery, setUnifiedSearchQuery] = useState("");
  const [unifiedSearchResults, setUnifiedSearchResults] = useState<
    UnifiedReceivableResult[]
  >([]);
  const [unifiedSearchLoading, setUnifiedSearchLoading] = useState(false);
  const [unifiedSearchError, setUnifiedSearchError] = useState<string | null>(null);
  const [unifiedSearchSubmitted, setUnifiedSearchSubmitted] = useState(false);
  const [unifiedActionLoadingKey, setUnifiedActionLoadingKey] = useState<string | null>(null);
  const [unifiedLastPaymentSummary, setUnifiedLastPaymentSummary] = useState<string | null>(null);

  const selectedEmi = useMemo<PendingEmiRecord | null>(() => {
    if (!lookup || !selectedEmiId) return null;
    return lookup.emis.find((item) => item.id === selectedEmiId) ?? null;
  }, [lookup, selectedEmiId]);

  const pendingEmis = useMemo(() => {
    const rows = lookup?.emis ?? [];
    return rows.filter((emi) => {
      const status = String(emi.status || "").toUpperCase();
      if (status === "PAID" || status === "WAIVED") return false;
      const balance = Number(emi.balance_amount ?? emi.amount ?? 0);
      return Number.isFinite(balance) ? balance > 0 : true;
    });
  }, [lookup?.emis]);
  const hasLookupResult = Boolean(lookup);
  const activeSearchConfig = SEARCH_MODE_CONFIG[searchMode];
  const directSaleHref = "/cashier/collect?workflow=direct-sale";
  const subscriptionHref = "/cashier/collect";
  const prefillDirectSaleId = useMemo(
    () => parsePositiveInteger(directSaleQueryParam),
    [directSaleQueryParam]
  );
  const availableFinanceAccounts = useMemo(
    () => financeAccounts.filter((account) => account.kind === method),
    [financeAccounts, method]
  );
  const selectableFinanceAccounts = useMemo(
    () => availableFinanceAccounts.filter((account) => account.collection_ready !== false),
    [availableFinanceAccounts]
  );
  const selectedFinanceAccount = useMemo(
    () => availableFinanceAccounts.find((account) => String(account.id) === selectedFinanceAccountId) ?? null,
    [availableFinanceAccounts, selectedFinanceAccountId]
  );
  const selectedFinanceAccountBlocker = financeAccountBlocker(selectedFinanceAccount);
  const selectedAdvanceFinanceAccount = useMemo(
    () => availableFinanceAccounts.find((account) => String(account.id) === advanceFinanceAccountId) ?? null,
    [advanceFinanceAccountId, availableFinanceAccounts]
  );
  const selectedAdvanceFinanceAccountBlocker = financeAccountBlocker(selectedAdvanceFinanceAccount);

  useEffect(() => {
    setCollectionWorkflow(
      workflowQueryParam === "direct-sale" ? "direct-sale" : "subscription"
    );
  }, [workflowQueryParam]);

  useEffect(() => {
    let active = true;

    async function loadFinanceAccountOptions() {
      try {
        const payload = await listCashierFinanceAccounts({
          is_active: 1,
          page_size: 100,
        });
        if (!active) return;
        setFinanceAccounts(payload.results.filter((account) => account.is_active));
      } catch {
        if (!active) return;
        setFinanceAccounts([]);
      }
    }

    void loadFinanceAccountOptions();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setSelectedFinanceAccountId((current) => {
      if (
        current &&
        selectableFinanceAccounts.some((account) => String(account.id) === current)
      ) {
        return current;
      }
      return selectableFinanceAccounts[0] ? String(selectableFinanceAccounts[0].id) : "";
    });

    setAdvanceFinanceAccountId((current) => {
      if (
        current &&
        selectableFinanceAccounts.some((account) => String(account.id) === current)
      ) {
        return current;
      }
      return selectableFinanceAccounts[0] ? String(selectableFinanceAccounts[0].id) : "";
    });
  }, [selectableFinanceAccounts]);

  function clearSelectionForNewLookup() {
    setSelectedEmiId(null);
    setAmount("");
    setSelectedFinanceAccountId("");
    setReferenceNo("");
    setNote("");
  }

  function resetSearchWorkspace() {
    setSearchMode("phone");
    setSearchInput("");
    setSubmittedPhone("");
    setSubmittedSearch("");
    setLookup(null);
    setLookupError(null);
    setSearchResults([]);
    setSearchResultsError(null);
    clearSelectionForNewLookup();
    setCollectError(null);
    setSuccess(null);
    setAdvanceAmount("");
    setAdvanceFinanceAccountId("");
    setAdvanceReferenceNo("");
    setAdvanceNote("");
    setAdvanceError(null);
    setAdvanceSuccess(null);
  }

  function resetCurrentCustomerSelection() {
    clearSelectionForNewLookup();
    setCollectError(null);
    setSuccess(null);
    setAdvanceAmount("");
    setAdvanceReferenceNo("");
    setAdvanceNote("");
    setAdvanceError(null);
    setAdvanceSuccess(null);
  }

  function applyLookupPayload(
    payload: PendingEmiLookupResponse,
    preferredEmiId?: number | null
  ): boolean {
    setLookup(payload);
    setSubmittedPhone(payload.phone);
    setLookupError(null);
    setSearchResults([]);
    setSearchResultsError(null);

    const preferredEmi =
      preferredEmiId != null
        ? payload.emis.find((item) => item.id === preferredEmiId) ?? null
        : null;

    if (preferredEmi) {
      setSelectedEmiId(preferredEmi.id);
      setAmount(preferredEmi.balance_amount || preferredEmi.amount || "0.00");
      setReferenceNo("");
      setNote("");
      setAdvanceAmount("");
      setAdvanceReferenceNo("");
      setAdvanceNote("");
      return true;
    }

    clearSelectionForNewLookup();
    return false;
  }

  async function loadLookupByPhone(
    phone: string,
    preferredEmiId?: number | null
  ) {
    setLookupLoading(true);
    setLookupError(null);
    setSearchResultsError(null);
    setCollectError(null);
    setSuccess(null);

    try {
      const payload = await getPendingEmisByPhone(phone);
      const preferredApplied = applyLookupPayload(payload, preferredEmiId);

      if (preferredEmiId && !preferredApplied) {
        setLookupError(
          `EMI #${preferredEmiId} is not currently available in this customer's pending queue.`
        );
      }
    } catch (error) {
      setLookup(null);
      clearSelectionForNewLookup();
      setLookupError(toErrorMessage(error));
    } finally {
      setLookupLoading(false);
    }
  }

  async function refreshLookupAfterCollection(preferredEmiId?: number | null) {
    if (!submittedPhone) return;

    try {
      const payload = await getPendingEmisByPhone(submittedPhone);
      applyLookupPayload(payload, preferredEmiId);
    } catch (error) {
      setLookupError(toErrorMessage(error));
    }
  }

  async function handleLookup(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    const cleanedSearch = searchInput.trim();
    if (!cleanedSearch) {
      setLookup(null);
      setSearchResults([]);
      setLookupError(`Enter a ${activeSearchConfig.label.toLowerCase()} value to search.`);
      setSearchResultsError(null);
      return;
    }

    setSubmittedSearch(cleanedSearch);

    if (searchMode === "phone") {
      setSearchResults([]);
      setSearchResultsError(null);
      await loadLookupByPhone(cleanedSearch);
      return;
    }

    setSearchingMatches(true);
    setLookup(null);
    setLookupError(null);
    setSearchResultsError(null);
    clearSelectionForNewLookup();
    setCollectError(null);
    setSuccess(null);

    try {
      const payload = await searchCashierCollectibleEmis(
        cleanedSearch,
        searchMode
      );
      setSearchResults(payload.results);
    } catch (error) {
      setSearchResults([]);
      setSearchResultsError(toErrorMessage(error));
    } finally {
      setSearchingMatches(false);
    }
  }

  async function handleSearchResultSelect(
    result: CashierCollectibleSearchResult
  ) {
    if (!result.customer_phone) {
      setSearchResultsError(
        "This collectible search result does not include a customer phone, so the full customer queue could not be loaded."
      );
      return;
    }

    await loadLookupByPhone(result.customer_phone, result.emi_id);
  }

  async function handleUnifiedReceivableSearch(query: string) {
    const trimmed = query.trim();
    setUnifiedSearchSubmitted(true);
    setUnifiedSearchError(null);
    setUnifiedLastPaymentSummary(null);

    if (!trimmed) {
      setUnifiedSearchResults([]);
      setUnifiedSearchError(
        "Enter a phone, customer ID, contract ID, subscription ID, invoice number, or receipt number."
      );
      return;
    }

    setUnifiedSearchLoading(true);
    try {
      const payload = await withTimeout(searchCashierReceivables(trimmed));
      setUnifiedSearchResults(payload.results);
    } catch (error) {
      setUnifiedSearchResults([]);
      setUnifiedSearchError(toErrorMessage(error));
    } finally {
      setUnifiedSearchLoading(false);
    }
  }

  async function handleUnifiedAdvanceEmiSelect(row: UnifiedReceivableResult) {
    const searchValue = row.reference_no || (row.source_id ? String(row.source_id) : "");
    if (!searchValue) {
      setUnifiedSearchError("This Advance EMI receivable does not include a searchable reference.");
      return;
    }

    const actionKey = `${row.source_type}-${row.source_id ?? row.reference_no}`;
    setUnifiedActionLoadingKey(actionKey);
    setCollectionWorkflow("subscription");
    setSearchMode("subscription");
    setSearchInput(searchValue);
    setSubmittedSearch(searchValue);
    setLookup(null);
    setLookupError(null);
    setSearchResultsError(null);
    clearSelectionForNewLookup();

    try {
      const payload = await searchCashierCollectibleEmis(searchValue, "subscription");
      setSearchResults(payload.results);
      const match =
        payload.results.find((result) => result.subscription_id === row.source_id) ??
        payload.results[0] ??
        null;

      if (!match) {
        setSearchResultsError(
          "No collectible EMI row is available for this contract reference."
        );
        return;
      }

      await handleSearchResultSelect(match);
    } catch (error) {
      setSearchResults([]);
      setSearchResultsError(toErrorMessage(error));
    } finally {
      setUnifiedActionLoadingKey(null);
    }
  }

  function selectEmi(emi: PendingEmiRecord) {
    setSelectedEmiId(emi.id);
    setCollectError(null);
    setSuccess(null);
    setAmount(emi.balance_amount || emi.amount || "0.00");
    setReferenceNo("");
    setNote("");
  }

  async function handleCollect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedEmi) {
      setCollectError("Select a pending EMI before collecting payment.");
      return;
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setCollectError("Enter a valid payment amount.");
      return;
    }

    if (!selectedFinanceAccountId) {
      setCollectError("Select a finance account before collecting payment.");
      return;
    }
    if (selectedFinanceAccountBlocker) {
      setCollectError(selectedFinanceAccountBlocker);
      return;
    }

    if ((method === "UPI" || method === "BANK") && !referenceNo.trim()) {
      setCollectError("Reference number is required for UPI or bank collection.");
      return;
    }

    setCollecting(true);
    setCollectError(null);
    setSuccess(null);

    try {
      const response = await withTimeout(collectPayment({
        emi_id: selectedEmi.id,
        amount: parsedAmount,
        method,
        finance_account_id: Number(selectedFinanceAccountId),
        reference_no: referenceNo.trim() || undefined,
        note: note.trim() || undefined,
      }));

      setSuccess(response);
      const statusNote = response.created
        ? "Posted successfully."
        : "Idempotent replay — existing payment returned (no duplicate post).";
      setUnifiedLastPaymentSummary(
        `${response.message || "Payment recorded."} Payment #${response.payment.id} · EMI #${response.emi.id}. ${statusNote}`
      );
      await withTimeout(refreshLookupAfterCollection(selectedEmi.id));
    } catch (error) {
      setCollectError(toErrorMessage(error));
    } finally {
      setCollecting(false);
    }
  }

  async function handleCollectAdvance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!lookup?.customer_id) {
      setAdvanceError("Load a customer queue before collecting customer advance.");
      return;
    }

    const parsedAmount = Number(advanceAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setAdvanceError("Enter a valid advance amount.");
      return;
    }

    if (!advanceFinanceAccountId) {
      setAdvanceError("Select a finance account before collecting advance.");
      return;
    }
    if (selectedAdvanceFinanceAccountBlocker) {
      setAdvanceError(selectedAdvanceFinanceAccountBlocker);
      return;
    }

    if ((method === "UPI" || method === "BANK") && !advanceReferenceNo.trim()) {
      setAdvanceError("Reference number is required for UPI or bank advance collection.");
      return;
    }

    setAdvanceSubmitting(true);
    setAdvanceError(null);
    setAdvanceSuccess(null);

    try {
      const response = await collectAdvance({
        customer_id: lookup.customer_id,
        amount: parsedAmount,
        method,
        finance_account_id: Number(advanceFinanceAccountId),
        reference_no: advanceReferenceNo.trim() || undefined,
        note: advanceNote.trim() || undefined,
      });
      setAdvanceSuccess(response);
      setAdvanceAmount("");
      setAdvanceReferenceNo("");
      setAdvanceNote("");
    } catch (error) {
      setAdvanceError(toErrorMessage(error));
    } finally {
      setAdvanceSubmitting(false);
    }
  }

  return (
    <PortalPage
      eyebrow="Cashier Collection"
      title={
        collectionWorkflow === "direct-sale"
          ? "Collect Direct-Sale Balance"
          : "Collect Payment"
      }
      subtitle={
        collectionWorkflow === "direct-sale"
          ? "Collect against outstanding direct-sale bills without entering the EMI allocation path."
          : "Search collectible EMI rows, select the exact installment, and post a cashier collection with immediate proof visibility."
      }
      helperNote={
        collectionWorkflow === "direct-sale"
          ? "Use direct-sale collection only for invoiced retail bills with outstanding balance. EMI, rent, and lease collections stay in the subscription workflow."
          : "Search first, verify the exact EMI row, then post once. This counter flow stays aligned with existing payment audit and reconciliation rules."
      }
      helperTone="info"
      breadcrumbs={[
        { label: "Cashier", href: "/cashier" },
        {
          label:
            collectionWorkflow === "direct-sale"
              ? "Collect Direct-Sale Balance"
              : "Collect Payment",
        },
      ]}
      actions={[
        {
          href: "/cashier/payments",
          label: "Payment History",
          variant: "secondary",
        },
        {
          href:
            collectionWorkflow === "direct-sale"
              ? subscriptionHref
              : directSaleHref,
          label:
            collectionWorkflow === "direct-sale"
              ? "Open EMI Collection"
              : "Open Direct Sale",
          variant: "secondary",
        },
        {
          href: "/cashier",
          label: "Back to Dashboard",
          variant: "secondary",
        },
        {
          href: "/logout",
          label: "Logout",
          variant: "secondary",
        },
      ]}
      statusBadge={{
        label:
          collectionWorkflow === "direct-sale"
            ? "Cashier Direct Sale"
            : "Cashier Collection",
        tone: "info",
      }}
    >
      <CashierWorkflowShell>
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground sm:text-sm">
          <span className="font-semibold text-foreground">
            {collectionWorkflow === "direct-sale" ? "Direct sale collection" : "Subscription EMI collection"}
          </span>
          {collectionWorkflow === "subscription" && lookup ? (
            <>
              {" · "}
              {lookup.total_pending_emis ?? 0} pending EMI · {lookup.overdue_emi_count ?? 0} overdue · Next due{" "}
              {lookup.next_due_date ? formatDate(lookup.next_due_date) : "—"}
            </>
          ) : null}
          {collectionWorkflow === "direct-sale" ? (
            <span> · Use phone / sale / customer search in the direct-sale panel.</span>
          ) : null}
        </div>
        <div id="cashier-unified-search">
        <UnifiedReceivableSearchPanel
          title="Universal receivable search"
          description="Search Advance EMI, rent, lease, and direct-sale contract references before opening the supported collection workflow."
          query={unifiedSearchQuery}
          results={unifiedSearchResults}
          loading={unifiedSearchLoading}
          error={unifiedSearchError}
          searched={unifiedSearchSubmitted}
          actionLoadingKey={unifiedActionLoadingKey}
          onQueryChange={setUnifiedSearchQuery}
          onSearch={handleUnifiedReceivableSearch}
          onAdvanceEmiSelect={handleUnifiedAdvanceEmiSelect}
          lastPaymentSummary={unifiedLastPaymentSummary}
          onRetrySearch={() => void handleUnifiedReceivableSearch(unifiedSearchQuery)}
        />
        </div>

        <p className="text-xs text-muted-foreground">
          Flow: search → verify the exact row → post once → receipt or payment history.
        </p>

        <FormSection
          title="Workflow selection"
          description="Keep retail direct-sale collections separate from subscription EMI collections so each path stays operationally clear and financially safe."
        >
          <div className="flex flex-wrap gap-3">
            {(
              [
                {
                  id: "subscription" as const,
                  label: "Subscription EMI",
                  description:
                    "Collect against exact EMI rows using the existing subscription payment workflow.",
                },
                {
                  id: "direct-sale" as const,
                  label: "Direct Sale",
                  description:
                    "Collect against outstanding invoiced retail bills using retail receipts.",
                },
              ] satisfies Array<{
                id: CollectionWorkflow;
                label: string;
                description: string;
              }>
            ).map((workflow) => {
              const active = collectionWorkflow === workflow.id;
              return (
                <button
                  key={workflow.id}
                  type="button"
                  onClick={() => setCollectionWorkflow(workflow.id)}
                  className={[
                    "min-w-[220px] rounded-2xl border px-4 py-3 text-left transition",
                    active
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-background hover:bg-muted",
                  ].join(" ")}
                >
                  <div className="text-sm font-semibold text-foreground">
                    {workflow.label}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    {workflow.description}
                  </div>
                </button>
              );
            })}
          </div>
        </FormSection>

        {collectionWorkflow === "direct-sale" ? (
          <CashierDirectSaleCollectPanel prefillDirectSaleId={prefillDirectSaleId} />
        ) : (
          <>
        <div id="cashier-step-search">
        <FormSection
          title="Step 1 · Search collectible EMI rows"
          description="Phone loads the full customer queue directly. Subscription, lucky, and EMI search modes first locate the collectible row, then open that customer queue for final confirmation."
        >
          <form
            onSubmit={handleLookup}
            className="grid gap-4 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_auto]"
          >
            <div>
              <label
                htmlFor="cashier-search-mode"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Search mode
              </label>
              <select
                id="cashier-search-mode"
                value={searchMode}
                onChange={(event) => {
                  setSearchMode(event.target.value as CashierSearchMode);
                  setLookup(null);
                  setSubmittedPhone("");
                  setSubmittedSearch("");
                  setSearchResults([]);
                  setLookupError(null);
                  setSearchResultsError(null);
                  clearSelectionForNewLookup();
                  setCollectError(null);
                  setSuccess(null);
                }}
                disabled={lookupLoading || searchingMatches || collecting}
                className={FIELD_CLASS_NAME}
              >
                {Object.entries(SEARCH_MODE_CONFIG).map(([value, config]) => (
                  <option key={value} value={value}>
                    {config.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="cashier-search-input"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                {activeSearchConfig.inputLabel}
              </label>
              <input
                id="cashier-search-input"
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={activeSearchConfig.placeholder}
                className={FIELD_CLASS_NAME}
                disabled={lookupLoading || searchingMatches || collecting}
              />
            </div>

            <ActionButton
              id="cashier-collect-search-submit"
              type="submit"
              variant="primary"
              size="lg"
              disabled={lookupLoading || searchingMatches || collecting}
              className="self-end"
              aria-label="Search collectible EMI rows"
            >
              {lookupLoading || searchingMatches ? "Searching..." : "Search"}
            </ActionButton>
          </form>

          <div className="mt-3 rounded-xl border border-border bg-[var(--surface-muted)] px-4 py-3 text-sm text-muted-foreground">
            {activeSearchConfig.help}
          </div>
        </FormSection>
        </div>

        {searchingMatches ? (
          <LoadingBlock label="Searching collectible EMI rows..." />
        ) : null}

        {!searchingMatches && searchResultsError ? (
          <ErrorState
            title="Unable to search collectible EMI rows"
            description={searchResultsError}
            onRetry={() => void handleLookup()}
          />
        ) : null}

        {!lookupLoading &&
        !searchingMatches &&
        !searchResultsError &&
        searchMode !== "phone" &&
        submittedSearch ? (
          <FormSection
            title="Search matches"
            description="Pick the right collectible EMI row to load the customer queue and continue safely."
          >
            {searchResults.length === 0 ? (
              <EmptyState
                title="No collectible matches"
                description={`No pending EMI rows matched "${submittedSearch}" for ${activeSearchConfig.label.toLowerCase()} search.`}
              />
            ) : (
              <div className="space-y-3">
                {searchResults.map((result) => (
                  <button
                    key={result.emi_id}
                    type="button"
                    onClick={() => void handleSearchResultSelect(result)}
                    className="w-full rounded-2xl border border-border bg-[var(--surface-card-elevated)] p-4 text-left shadow-sm transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-foreground">
                          {result.customer_name || "Unknown customer"}
                          {result.customer_phone
                            ? ` · ${result.customer_phone}`
                            : ""}
                        </div>
                        <div className="text-sm text-slate-600">
                          {result.subscription_number ||
                            (result.subscription_id
                              ? `SUB-${result.subscription_id}`
                              : "Unknown subscription")}
                          {result.contract_reference
                            ? ` · Ref ${result.contract_reference}`
                            : ""}
                        </div>
                        <div className="text-xs text-slate-600">
                          EMI #{result.emi_id}
                          {typeof result.month_no === "number"
                            ? ` · Month ${result.month_no}`
                            : ""}
                          {result.due_date ? ` · Due ${formatDate(result.due_date)}` : ""}
                        </div>
                        <div className="text-xs text-slate-600">
                          {result.batch_code || "No batch"}
                          {typeof result.lucky_number === "number"
                            ? ` · Lucky #${result.lucky_number}`
                            : ""}
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[260px]">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            Advance EMI Amount
                          </div>
                          <div className="mt-1 text-sm font-semibold text-foreground">
                            {money(result.amount)}
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            Balance
                          </div>
                          <div className="mt-1 text-sm font-semibold text-foreground">
                            {money(result.balance_amount)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </FormSection>
        ) : null}

        {lookupLoading ? <LoadingBlock label="Loading customer pending queue..." /> : null}

        {!lookupLoading && lookupError ? (
          <ErrorState
            title="Unable to load pending EMI records"
            description={lookupError}
            onRetry={() => void handleLookup()}
          />
        ) : null}

        {!lookupLoading && !lookupError && hasLookupResult ? (
          <>
            <FormSection
              title="Customer summary"
              description="Quick customer context for the current collection candidate."
            >
              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Customer
                  </div>
                  <div className="mt-1 text-base font-semibold text-foreground">
                    <CustomerIntelligenceTrigger
                      customerId={lookup?.customer_id}
                      customerName={lookup?.customer_name || "—"}
                      scope="cashier"
                    />
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Phone
                  </div>
                  <div className="mt-1 text-base font-semibold text-foreground">
                    {lookup?.phone || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Pending amount
                  </div>
                  <div className="mt-1 text-base font-semibold text-foreground">
                    {money(lookup?.total_pending_amount)}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Overdue load
                  </div>
                  <div className="mt-1 text-base font-semibold text-foreground">
                    {lookup?.overdue_emi_count ?? 0} EMI · {money(lookup?.overdue_amount)}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    status={(lookup?.overdue_emi_count ?? 0) > 0 ? "OVERDUE" : "PENDING"}
                    label={
                      (lookup?.overdue_emi_count ?? 0) > 0
                        ? "Overdue follow-up"
                        : "Current due queue"
                    }
                  />
                  <span className="text-sm text-slate-600">
                    Next due EMI:{" "}
                    {lookup?.next_due_date
                      ? `${formatDate(lookup.next_due_date)} · ${money(lookup?.next_due_amount)}`
                      : "No pending EMI available"}
                  </span>
                </div>
              </div>
            </FormSection>

            <FormSection
              title="Step 2 · Select pending EMI"
              description="Choose the exact EMI row you are collecting against."
            >
              {pendingEmis.some((row) => isRestrictedSubscriptionStatus(row.subscription_status)) ? (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  At least one visible contract shows a restricted subscription status. Confirm with a supervisor before
                  you describe outcomes to the customer; collection posting rules are still enforced by the server.
                </div>
              ) : null}
              {pendingEmis.length === 0 ? (
                <EmptyState
                  title="No pending Advance EMIs"
                  description="No collectible EMI rows were returned for this customer."
                />
              ) : (
                <div className="space-y-3">
                  {pendingEmis.map((emi) => {
                    const isSelected = selectedEmiId === emi.id;
                    const subscriptionRestricted = isRestrictedSubscriptionStatus(
                      emi.subscription_status
                    );

                    return (
                      <button
                        key={emi.id}
                        type="button"
                        onClick={() => selectEmi(emi)}
                        className={[
                          "w-full rounded-2xl border p-4 text-left shadow-sm transition",
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                          subscriptionRestricted
                            ? "border-amber-300/80 bg-amber-50/40 opacity-90"
                            : "",
                        ].join(" ")}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-foreground">
                              Subscription #{emi.subscription} · Advance EMI Month {emi.month_no}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <StatusBadge
                                status={emi.status}
                                isOverdue={isEmiOverdue(emi)}
                              />
                              {subscriptionRestricted ? (
                                <StatusBadge
                                  status="BLOCKED"
                                  label={`Contract ${emi.subscription_status || "restricted"}`}
                                  hideIcon
                                />
                              ) : null}
                              <span className="text-sm text-slate-600">
                                Due {formatDate(emi.due_date)} · {overdueLabel(emi)}
                              </span>
                            </div>
                            <div className="text-xs text-slate-600">
                              Customer {emi.customer_name || "—"}
                            </div>
                            <div className="text-xs text-slate-600">
                              Batch {emi.batch_code || "—"}
                              {typeof emi.lucky_number === "number"
                                ? ` · Lucky #${emi.lucky_number}`
                                : ""}
                            </div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[360px]">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                Advance EMI Amount
                              </div>
                              <div className="mt-1 text-sm font-semibold text-foreground">
                                {money(emi.amount)}
                              </div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                Paid
                              </div>
                              <div className="mt-1 text-sm font-semibold text-foreground">
                                {money(emi.total_paid)}
                              </div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                Balance
                              </div>
                              <div className="mt-1 text-sm font-semibold text-foreground">
                                {money(emi.balance_amount || emi.amount)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </FormSection>

            <div
              id="cashier-step-collect"
              className="rounded-xl border border-transparent lg:border-border lg:bg-card/80 lg:p-4 lg:shadow-sm lg:backdrop-blur-sm"
            >
            <FormSection
              title="Step 3 · Post collection"
              description="Collect only against the selected EMI row. UPI and bank entries require a reference number."
              className="lg:sticky lg:top-24 lg:z-[5] lg:max-h-[min(100dvh-6rem,920px)] lg:overflow-y-auto"
            >
              {success ? (
                <div
                  className={[
                    "mb-4 rounded-xl border px-4 py-3 text-sm",
                    success.created
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-amber-200 bg-amber-50 text-amber-900",
                  ].join(" ")}
                >
                  <div className="font-semibold">
                    {success.created
                      ? success.message || "Payment collected successfully."
                      : success.message ||
                        "Duplicate reference detected. Existing payment returned instead of posting a second collection."}
                  </div>
                  <div className="mt-1">
                    Payment #{success.payment.id} · Amount {money(success.payment.amount)} ·
                    EMI #{success.emi.id} · Posted{" "}
                    {formatDateTime(success.payment.created_at || success.payment.payment_date)}
                  </div>
                  {success.finance_account ? (
                    <div className="mt-1">
                      Finance account {success.finance_account.name} · {success.finance_account.kind} · Reconciliation {success.reconciliation_status || "PENDING"}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`/cashier/payments/${success.payment.id}`}
                      className="inline-flex items-center rounded-md border border-current bg-white px-3 py-1.5 text-sm font-medium shadow-sm transition hover:bg-white/70"
                    >
                      Open Receipt
                    </Link>

                    <Link
                      href="/cashier/payments"
                      className="inline-flex items-center rounded-md border border-current bg-white px-3 py-1.5 text-sm font-medium shadow-sm transition hover:bg-white/70"
                    >
                      Open History
                    </Link>

                    <button
                      type="button"
                      onClick={resetSearchWorkspace}
                      className="inline-flex items-center rounded-md border border-current bg-white px-3 py-1.5 text-sm font-medium shadow-sm transition hover:bg-white/70"
                    >
                      Search Again
                    </button>

                    <Link
                      href="/cashier"
                      className="inline-flex items-center rounded-md border border-current bg-white px-3 py-1.5 text-sm font-medium shadow-sm transition hover:bg-white/70"
                    >
                      Back to Dashboard
                    </Link>
                  </div>
                </div>
              ) : null}

              {!selectedEmi ? (
                <EmptyState
                  title="No EMI selected"
                  description="Select a pending EMI row above to enable collection."
                />
              ) : (
                <form onSubmit={handleCollect} className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Subscription
                        </div>
                        <div className="mt-1 text-sm font-semibold text-foreground">
                          SUB-{selectedEmi.subscription}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Advance EMI Month
                        </div>
                        <div className="mt-1 text-sm font-semibold text-foreground">
                          {selectedEmi.month_no}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Due Date
                        </div>
                        <div className="mt-1 text-sm font-semibold text-foreground">
                          {formatDate(selectedEmi.due_date)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Balance
                        </div>
                        <div className="mt-1 text-sm font-semibold text-foreground">
                          {money(selectedEmi.balance_amount || selectedEmi.amount)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {collectError ? (
                    <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                      {collectError}
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label
                        htmlFor="collect-amount"
                        className="mb-2 block text-sm font-medium text-foreground"
                      >
                        Amount
                      </label>
                      <input
                        id="collect-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        className={FIELD_CLASS_NAME}
                        disabled={collecting}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="collect-method"
                        className="mb-2 block text-sm font-medium text-foreground"
                      >
                        Method
                      </label>
                      <select
                        id="collect-method"
                        value={method}
                        onChange={(event) =>
                          setMethod(event.target.value as PaymentMethod)
                        }
                        className={FIELD_CLASS_NAME}
                        disabled={collecting}
                      >
                        <option value="CASH">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="BANK">Bank</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="collect-finance-account"
                      className="mb-2 block text-sm font-medium text-foreground"
                    >
                      Finance account
                    </label>
                    <select
                      id="collect-finance-account"
                      value={selectedFinanceAccountId}
                      onChange={(event) => setSelectedFinanceAccountId(event.target.value)}
                      className={FIELD_CLASS_NAME}
                      disabled={collecting}
                    >
                      <option value="">Select finance account</option>
                      {availableFinanceAccounts.map((account) => (
                        <option key={account.id} value={account.id} disabled={account.collection_ready === false}>
                          {financeAccountOptionLabel(account)}
                        </option>
                      ))}
                    </select>
                    {selectedFinanceAccountBlocker ? (
                      <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                        <div>{selectedFinanceAccountBlocker}</div>
                        <div className="mt-1">
                          Go to{" "}
                          <Link href="/admin/accounting/setup" className="font-semibold underline">
                            Accounting Setup - Finance Mapping
                          </Link>{" "}
                          to fix.
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-600">
                        This selection controls the finance route used for ledger posting and reconciliation visibility.
                      </p>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label
                        htmlFor="collect-reference"
                        className="mb-2 block text-sm font-medium text-foreground"
                      >
                        Reference number
                      </label>
                      <input
                        id="collect-reference"
                        type="text"
                        value={referenceNo}
                        onChange={(event) => setReferenceNo(event.target.value)}
                        placeholder={
                          method === "CASH"
                            ? "Optional for cash"
                            : "Required for UPI / bank"
                        }
                        className={FIELD_CLASS_NAME}
                        disabled={collecting}
                      />
                      <p className="mt-2 text-xs text-slate-600">
                        Reusing the same reference returns the existing payment instead of posting a duplicate collection.
                      </p>
                    </div>

                    <div>
                      <label
                        htmlFor="collect-note"
                        className="mb-2 block text-sm font-medium text-foreground"
                      >
                        Note
                      </label>
                      <input
                        id="collect-note"
                        type="text"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Optional note"
                        className={FIELD_CLASS_NAME}
                        disabled={collecting}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <ActionButton
                      type="submit"
                      variant="primary"
                      size="lg"
                      loading={collecting}
                      disabled={collecting}
                    >
                      {collecting ? "Posting collection..." : "Collect Payment"}
                    </ActionButton>

                    <button
                      type="button"
                      onClick={resetCurrentCustomerSelection}
                      disabled={collecting}
                      className={SECONDARY_BUTTON_CLASS_NAME}
                    >
                      Reset Selection
                    </button>

                    <Link
                      href="/cashier/payments"
                      className={SECONDARY_BUTTON_CLASS_NAME}
                    >
                      Payment History
                    </Link>

                    <Link
                      href="/cashier"
                      className={SECONDARY_BUTTON_CLASS_NAME}
                    >
                      Back to Dashboard
                    </Link>
                  </div>
                </form>
              )}
            </FormSection>
            </div>

            <FormSection
              title="Step 4 · Collect unapplied customer advance"
              description="Use this when the customer is paying now but the amount should remain unapplied until a later EMI or receivable allocation."
            >
              {advanceSuccess ? (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  <div className="font-semibold">
                    {advanceSuccess.message || "Customer advance collected successfully."}
                  </div>
                  <div className="mt-1">
                    Advance #{advanceSuccess.data.customer_advance_id} · Unapplied balance {money(advanceSuccess.data.unapplied_amount)}.
                  </div>
                </div>
              ) : null}

              {advanceError ? (
                <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {advanceError}
                </div>
              ) : null}

              {!lookup?.customer_id ? (
                <EmptyState
                  title="Customer context required"
                  description="Load a customer queue first so the advance can be attached to the correct customer safely."
                />
              ) : (
                <form onSubmit={handleCollectAdvance} className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label
                      htmlFor="collect-advance-amount"
                      className="mb-2 block text-sm font-medium text-foreground"
                    >
                      Advance amount
                    </label>
                    <input
                      id="collect-advance-amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={advanceAmount}
                      onChange={(event) => setAdvanceAmount(event.target.value)}
                      className={FIELD_CLASS_NAME}
                      disabled={advanceSubmitting}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="collect-advance-finance-account"
                      className="mb-2 block text-sm font-medium text-foreground"
                    >
                      Finance account
                    </label>
                    <select
                      id="collect-advance-finance-account"
                      value={advanceFinanceAccountId}
                      onChange={(event) => setAdvanceFinanceAccountId(event.target.value)}
                      className={FIELD_CLASS_NAME}
                      disabled={advanceSubmitting}
                    >
                      <option value="">Select finance account</option>
                      {availableFinanceAccounts.map((account) => (
                        <option key={account.id} value={account.id} disabled={account.collection_ready === false}>
                          {financeAccountOptionLabel(account)}
                        </option>
                      ))}
                    </select>
                    {selectedAdvanceFinanceAccountBlocker ? (
                      <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                        <div>{selectedAdvanceFinanceAccountBlocker}</div>
                        <div className="mt-1">
                          Go to{" "}
                          <Link href="/admin/accounting/setup" className="font-semibold underline">
                            Accounting Setup - Finance Mapping
                          </Link>{" "}
                          to fix.
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <label
                      htmlFor="collect-advance-reference"
                      className="mb-2 block text-sm font-medium text-foreground"
                    >
                      Reference number
                    </label>
                    <input
                      id="collect-advance-reference"
                      type="text"
                      value={advanceReferenceNo}
                      onChange={(event) => setAdvanceReferenceNo(event.target.value)}
                      placeholder={
                        method === "CASH"
                          ? "Optional for cash"
                          : "Required for UPI / bank"
                      }
                      className={FIELD_CLASS_NAME}
                      disabled={advanceSubmitting}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="collect-advance-note"
                      className="mb-2 block text-sm font-medium text-foreground"
                    >
                      Note
                    </label>
                    <input
                      id="collect-advance-note"
                      type="text"
                      value={advanceNote}
                      onChange={(event) => setAdvanceNote(event.target.value)}
                      placeholder="Reason for holding as unapplied"
                      className={FIELD_CLASS_NAME}
                      disabled={advanceSubmitting}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <ActionButton
                      type="submit"
                      variant="secondary"
                      size="lg"
                      loading={advanceSubmitting}
                      disabled={advanceSubmitting}
                    >
                      {advanceSubmitting ? "Collecting advance..." : "Collect Advance"}
                    </ActionButton>
                  </div>
                </form>
              )}
            </FormSection>
          </>
        ) : null}
          </>
        )}

        {collectionWorkflow === "subscription" ? (
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 sm:hidden">
            <div className="pointer-events-auto border-t border-border bg-background/95 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_-18px_rgba(15,23,42,0.45)]">
              <div className="mx-auto flex max-w-lg gap-2">
                <ActionButton
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() =>
                    document
                      .getElementById("cashier-step-search")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                >
                  Search
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="primary"
                  className="flex-1"
                  disabled={!selectedEmi || collecting}
                  onClick={() =>
                    document
                      .getElementById("cashier-step-collect")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                >
                  Collect
                </ActionButton>
              </div>
            </div>
          </div>
        ) : null}
      </CashierWorkflowShell>
    </PortalPage>
  );
}
