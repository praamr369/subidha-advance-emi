"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import { WorkspaceSection as SectionCard } from "@/components/ui/workspace";
import {
  collectPayment,
  getPendingEmisByPhone,
  searchCashierCollectibleEmis,
  type CashierCollectPaymentResponse,
  type CashierCollectibleSearchResult,
  type PendingEmiLookupResponse,
  type PendingEmiRecord,
} from "@/services/cashier";

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

type PaymentMethod = "CASH" | "UPI" | "BANK";
type CashierSearchMode = "phone" | "subscription" | "lucky" | "emi";

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

export default function CashierCollectPage() {
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
  const [referenceNo, setReferenceNo] = useState("");
  const [note, setNote] = useState("");
  const [collecting, setCollecting] = useState(false);
  const [collectError, setCollectError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CashierCollectPaymentResponse | null>(
    null
  );

  const selectedEmi = useMemo<PendingEmiRecord | null>(() => {
    if (!lookup || !selectedEmiId) return null;
    return lookup.emis.find((item) => item.id === selectedEmiId) ?? null;
  }, [lookup, selectedEmiId]);

  const pendingEmis = lookup?.emis ?? [];
  const hasLookupResult = Boolean(lookup);
  const activeSearchConfig = SEARCH_MODE_CONFIG[searchMode];

  function clearSelectionForNewLookup() {
    setSelectedEmiId(null);
    setAmount("");
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
  }

  function resetCurrentCustomerSelection() {
    clearSelectionForNewLookup();
    setCollectError(null);
    setSuccess(null);
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

    if ((method === "UPI" || method === "BANK") && !referenceNo.trim()) {
      setCollectError("Reference number is required for UPI or bank collection.");
      return;
    }

    setCollecting(true);
    setCollectError(null);
    setSuccess(null);

    try {
      const response = await collectPayment({
        emi_id: selectedEmi.id,
        amount: parsedAmount,
        method,
        reference_no: referenceNo.trim() || undefined,
        note: note.trim() || undefined,
      });

      setSuccess(response);
      await refreshLookupAfterCollection(selectedEmi.id);
    } catch (error) {
      setCollectError(toErrorMessage(error));
    } finally {
      setCollecting(false);
    }
  }

  return (
    <PortalPage
      title="Collect Payment"
      subtitle="Search collectible EMI rows, select the exact installment, and post a cashier collection with immediate proof visibility."
      breadcrumbs={[
        { label: "Cashier", href: "/cashier" },
        { label: "Collect Payment" },
      ]}
      actions={[
        {
          href: "/cashier/payments",
          label: "Payment History",
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
      stats={[
        {
          label: "Search Mode",
          value: activeSearchConfig.label,
        },
        {
          label: "Pending EMI Count",
          value: String(lookup?.total_pending_emis ?? 0),
          tone: "warning",
        },
        {
          label: "Overdue EMI",
          value: String(lookup?.overdue_emi_count ?? 0),
          tone: "warning",
        },
        {
          label: "Next Due",
          value: lookup?.next_due_date ? formatDate(lookup.next_due_date) : "—",
          tone:
            (lookup?.overdue_emi_count ?? 0) > 0
              ? "warning"
              : undefined,
        },
      ]}
      statusBadge={{
        label: "Cashier Collection",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        <SectionCard
          title="Step 1 · Search collectible EMI rows"
          description="Phone loads the full customer queue directly. Subscription, lucky, and EMI search modes first locate the collectible row, then open that customer queue for final confirmation."
        >
          <form
            onSubmit={handleLookup}
            className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_auto]"
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
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
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
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                disabled={lookupLoading || searchingMatches || collecting}
              />
            </div>

            <button
              type="submit"
              disabled={lookupLoading || searchingMatches || collecting}
              className="inline-flex h-11 items-center justify-center self-end rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {lookupLoading || searchingMatches ? "Searching..." : "Search"}
            </button>
          </form>

          <div className="mt-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            {activeSearchConfig.help}
          </div>
        </SectionCard>

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
          <SectionCard
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
                    className="w-full rounded-2xl border border-border bg-background p-4 text-left shadow-sm transition hover:border-slate-300"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-foreground">
                          {result.customer_name || "Unknown customer"}
                          {result.customer_phone
                            ? ` · ${result.customer_phone}`
                            : ""}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {result.subscription_number ||
                            (result.subscription_id
                              ? `SUB-${result.subscription_id}`
                              : "Unknown subscription")}
                          {result.contract_reference
                            ? ` · Ref ${result.contract_reference}`
                            : ""}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          EMI #{result.emi_id}
                          {typeof result.month_no === "number"
                            ? ` · Month ${result.month_no}`
                            : ""}
                          {result.due_date ? ` · Due ${formatDate(result.due_date)}` : ""}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {result.batch_code || "No batch"}
                          {typeof result.lucky_number === "number"
                            ? ` · Lucky #${result.lucky_number}`
                            : ""}
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[260px]">
                        <div className="rounded-xl border border-border bg-card px-3 py-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            EMI Amount
                          </div>
                          <div className="mt-1 text-sm font-semibold text-foreground">
                            {money(result.amount)}
                          </div>
                        </div>
                        <div className="rounded-xl border border-border bg-card px-3 py-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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
          </SectionCard>
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
            <SectionCard
              title="Customer summary"
              description="Quick customer context for the current collection candidate."
            >
              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Customer
                  </div>
                  <div className="mt-1 text-base font-semibold text-foreground">
                    {lookup?.customer_name || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Phone
                  </div>
                  <div className="mt-1 text-base font-semibold text-foreground">
                    {lookup?.phone || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Pending amount
                  </div>
                  <div className="mt-1 text-base font-semibold text-foreground">
                    {money(lookup?.total_pending_amount)}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Overdue load
                  </div>
                  <div className="mt-1 text-base font-semibold text-foreground">
                    {lookup?.overdue_emi_count ?? 0} EMI · {money(lookup?.overdue_amount)}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-border bg-muted/30 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    status={(lookup?.overdue_emi_count ?? 0) > 0 ? "OVERDUE" : "PENDING"}
                    label={
                      (lookup?.overdue_emi_count ?? 0) > 0
                        ? "Overdue follow-up"
                        : "Current due queue"
                    }
                  />
                  <span className="text-sm text-muted-foreground">
                    Next due EMI:{" "}
                    {lookup?.next_due_date
                      ? `${formatDate(lookup.next_due_date)} · ${money(lookup?.next_due_amount)}`
                      : "No pending EMI available"}
                  </span>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Step 2 · Select pending EMI"
              description="Choose the exact EMI row you are collecting against."
            >
              {pendingEmis.length === 0 ? (
                <EmptyState
                  title="No pending EMIs"
                  description="No collectible EMI rows were returned for this customer."
                />
              ) : (
                <div className="space-y-3">
                  {pendingEmis.map((emi) => {
                    const isSelected = selectedEmiId === emi.id;

                    return (
                      <button
                        key={emi.id}
                        type="button"
                        onClick={() => selectEmi(emi)}
                        className={[
                          "w-full rounded-2xl border p-4 text-left shadow-sm transition",
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border bg-background hover:border-slate-300",
                        ].join(" ")}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-foreground">
                              Subscription #{emi.subscription} · EMI Month {emi.month_no}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <StatusBadge
                                status={emi.status}
                                isOverdue={isEmiOverdue(emi)}
                              />
                              <span className="text-sm text-muted-foreground">
                                Due {formatDate(emi.due_date)} · {overdueLabel(emi)}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Customer {emi.customer_name || "—"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Batch {emi.batch_code || "—"}
                              {typeof emi.lucky_number === "number"
                                ? ` · Lucky #${emi.lucky_number}`
                                : ""}
                            </div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[360px]">
                            <div className="rounded-xl border border-border bg-card px-3 py-2">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                EMI Amount
                              </div>
                              <div className="mt-1 text-sm font-semibold text-foreground">
                                {money(emi.amount)}
                              </div>
                            </div>
                            <div className="rounded-xl border border-border bg-card px-3 py-2">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Paid
                              </div>
                              <div className="mt-1 text-sm font-semibold text-foreground">
                                {money(emi.total_paid)}
                              </div>
                            </div>
                            <div className="rounded-xl border border-border bg-card px-3 py-2">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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
            </SectionCard>

            <SectionCard
              title="Step 3 · Post collection"
              description="Collect only against the selected EMI row. UPI and bank entries require a reference number."
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
                  <div className="rounded-2xl border border-border bg-muted/40 p-4">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Subscription
                        </div>
                        <div className="mt-1 text-sm font-semibold text-foreground">
                          SUB-{selectedEmi.subscription}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          EMI Month
                        </div>
                        <div className="mt-1 text-sm font-semibold text-foreground">
                          {selectedEmi.month_no}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Due Date
                        </div>
                        <div className="mt-1 text-sm font-semibold text-foreground">
                          {formatDate(selectedEmi.due_date)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                        className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
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
                        className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                        disabled={collecting}
                      >
                        <option value="CASH">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="BANK">Bank</option>
                      </select>
                    </div>
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
                        className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                        disabled={collecting}
                      />
                      <p className="mt-2 text-xs text-muted-foreground">
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
                        className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                        disabled={collecting}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={collecting}
                      className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {collecting ? "Posting collection..." : "Collect Payment"}
                    </button>

                    <button
                      type="button"
                      onClick={resetCurrentCustomerSelection}
                      disabled={collecting}
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Reset Selection
                    </button>

                    <Link
                      href="/cashier/payments"
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                    >
                      Payment History
                    </Link>

                    <Link
                      href="/cashier"
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                    >
                      Back to Dashboard
                    </Link>
                  </div>
                </form>
              )}
            </SectionCard>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
