"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import ActionButton from "@/components/ui/ActionButton";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import StatusBadge from "@/components/ui/status-badge";
import { WorkspaceSection as SectionCard } from "@/components/ui/workspace";
import {
  collectDirectSalePayment,
  getPendingDirectSalesByPhone,
  searchCashierCollectibleDirectSales,
  type CashierCollectDirectSaleResponse,
  type CashierCollectibleDirectSale,
  type CashierDirectSaleSearchMode,
  type CashierPendingDirectSalesResponse,
} from "@/services/cashier";

const FIELD_CLASS_NAME =
  "h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35";

const SEARCH_MODE_CONFIG: Record<
  CashierDirectSaleSearchMode,
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
    placeholder: "Enter phone to load all outstanding direct sales",
    help:
      "Phone search loads the customer's current direct-sale receivable queue directly.",
  },
  sale: {
    label: "Sale No.",
    inputLabel: "Sale number",
    placeholder: "Enter SALE-2026... or raw direct-sale id",
    help:
      "Sale search finds the exact invoiced direct-sale receivable and then opens that customer's queue.",
  },
  customer: {
    label: "Customer",
    inputLabel: "Customer name",
    placeholder: "Search by customer name",
    help:
      "Use customer-name search when the counter staff does not have the sale number but can identify the buyer.",
  },
  any: {
    label: "Any",
    inputLabel: "Phone, sale, or customer",
    placeholder: "Search by phone, sale number, or customer name",
    help:
      "Any search spans the current cashier-visible direct-sale receivable candidates.",
  },
};

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Request failed.";
}

export default function CashierDirectSaleCollectPanel({
  prefillDirectSaleId = null,
}: {
  prefillDirectSaleId?: number | null;
}) {
  const [searchMode, setSearchMode] = useState<CashierDirectSaleSearchMode>("phone");
  const [searchInput, setSearchInput] = useState("");
  const [submittedPhone, setSubmittedPhone] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [lookup, setLookup] = useState<CashierPendingDirectSalesResponse | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [searchingMatches, setSearchingMatches] = useState(false);
  const [searchResults, setSearchResults] = useState<CashierCollectibleDirectSale[]>([]);
  const [searchResultsError, setSearchResultsError] = useState<string | null>(null);
  const [selectedDirectSaleId, setSelectedDirectSaleId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [note, setNote] = useState("");
  const [collecting, setCollecting] = useState(false);
  const [collectError, setCollectError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CashierCollectDirectSaleResponse | null>(null);

  const activeSearchConfig = SEARCH_MODE_CONFIG[searchMode];
  const directSales = useMemo(
    () => lookup?.direct_sales ?? [],
    [lookup?.direct_sales]
  );

  const selectedDirectSale = useMemo<CashierCollectibleDirectSale | null>(() => {
    if (!selectedDirectSaleId) return null;
    return directSales.find((item) => item.direct_sale_id === selectedDirectSaleId) ?? null;
  }, [directSales, selectedDirectSaleId]);

  useEffect(() => {
    if (!prefillDirectSaleId) return;

    let active = true;

    async function applyDirectSalePrefill() {
      const searchValue = String(prefillDirectSaleId);
      setSearchMode("sale");
      setSearchInput(searchValue);
      setSubmittedSearch(searchValue);
      setLookup(null);
      setLookupError(null);
      setSearchResultsError(null);
      setSelectedDirectSaleId(null);
      setAmount("");
      setReferenceNo("");
      setNote("");
      setCollectError(null);
      setSuccess(null);
      setSearchingMatches(true);

      try {
        const searchPayload = await searchCashierCollectibleDirectSales(
          searchValue,
          "sale"
        );
        if (!active) return;
        setSearchResults(searchPayload.results);

        const match =
          searchPayload.results.find(
            (item) => item.direct_sale_id === prefillDirectSaleId
          ) ??
          searchPayload.results[0] ??
          null;

        if (!match) {
          setSearchResultsError(
            "No outstanding direct-sale receivable is available for this reference."
          );
          return;
        }

        if (!match.customer_phone) {
          setSearchResultsError(
            "This direct-sale candidate does not include a customer phone, so the cashier queue could not be loaded."
          );
          return;
        }

        setSearchingMatches(false);
        setLookupLoading(true);
        const lookupPayload = await getPendingDirectSalesByPhone(match.customer_phone);
        if (!active) return;
        setLookup(lookupPayload);
        setSubmittedPhone(match.customer_phone);
        setSearchResults([]);

        const activeRow =
          lookupPayload.direct_sales.find(
            (item) => item.direct_sale_id === prefillDirectSaleId
          ) ??
          lookupPayload.direct_sales[0] ??
          null;

        if (activeRow) {
          setSelectedDirectSaleId(activeRow.direct_sale_id);
          setAmount(activeRow.balance_total);
        } else {
          setSelectedDirectSaleId(null);
          setAmount("");
        }
      } catch (error) {
        if (!active) return;
        setLookup(null);
        setSearchResults([]);
        setSelectedDirectSaleId(null);
        setAmount("");
        setSearchResultsError(toErrorMessage(error));
      } finally {
        if (active) {
          setSearchingMatches(false);
          setLookupLoading(false);
        }
      }
    }

    void applyDirectSalePrefill();

    return () => {
      active = false;
    };
  }, [prefillDirectSaleId]);

  function resetSelection() {
    setSelectedDirectSaleId(null);
    setAmount("");
    setReferenceNo("");
    setNote("");
    setCollectError(null);
    setSuccess(null);
  }

  async function loadLookupByPhone(
    phone: string,
    preferredDirectSaleId?: number | null
  ) {
    setLookupLoading(true);
    setLookupError(null);
    setSearchResultsError(null);
    setCollectError(null);
    setSuccess(null);

    try {
      const payload = await getPendingDirectSalesByPhone(phone);
      setLookup(payload);
      setSubmittedPhone(phone);
      setSearchResults([]);

      const preferredRow =
        preferredDirectSaleId != null
          ? payload.direct_sales.find((item) => item.direct_sale_id === preferredDirectSaleId) ?? null
          : null;
      const activeRow = preferredRow ?? payload.direct_sales[0] ?? null;

      if (activeRow) {
        setSelectedDirectSaleId(activeRow.direct_sale_id);
        setAmount(activeRow.balance_total);
        setReferenceNo("");
        setNote("");
      } else {
        resetSelection();
      }
    } catch (error) {
      setLookup(null);
      resetSelection();
      setLookupError(toErrorMessage(error));
    } finally {
      setLookupLoading(false);
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
    resetSelection();

    try {
      const payload = await searchCashierCollectibleDirectSales(
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

  async function handleSearchResultSelect(result: CashierCollectibleDirectSale) {
    if (!result.customer_phone) {
      setSearchResultsError(
        "This direct-sale candidate does not include a customer phone, so the cashier queue could not be loaded."
      );
      return;
    }

    await loadLookupByPhone(result.customer_phone, result.direct_sale_id);
  }

  async function handleCollect() {
    if (!selectedDirectSale) {
      setCollectError("Select an outstanding direct sale before posting collection.");
      return;
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setCollectError("Enter a valid collection amount.");
      return;
    }
    if (parsedAmount > Number(selectedDirectSale.balance_total || 0)) {
      setCollectError("Collection amount cannot exceed the direct-sale outstanding balance.");
      return;
    }

    setCollecting(true);
    setCollectError(null);
    setSuccess(null);

    try {
      const response = await collectDirectSalePayment({
        direct_sale_id: selectedDirectSale.direct_sale_id,
        amount: parsedAmount,
        reference_no: referenceNo.trim() || undefined,
        note: note.trim() || undefined,
      });
      setSuccess(response);
      if (submittedPhone) {
        await loadLookupByPhone(submittedPhone, selectedDirectSale.direct_sale_id);
      }
    } catch (error) {
      setCollectError(toErrorMessage(error));
    } finally {
      setCollecting(false);
    }
  }

  return (
    <>
      <SectionCard
        title="Step 1 · Search direct-sale receivables"
        description="Phone loads the customer's retail receivable queue directly. Sale and customer search first locate the invoiced direct-sale bill, then open the same queue for final confirmation."
      >
        <form
          onSubmit={handleLookup}
          className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_auto]"
        >
          <div>
            <label
              htmlFor="cashier-direct-sale-search-mode"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              Search mode
            </label>
            <select
              id="cashier-direct-sale-search-mode"
              value={searchMode}
              onChange={(event) => {
                setSearchMode(event.target.value as CashierDirectSaleSearchMode);
                setLookup(null);
                setSubmittedPhone("");
                setSubmittedSearch("");
                setSearchResults([]);
                setLookupError(null);
                setSearchResultsError(null);
                resetSelection();
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
              htmlFor="cashier-direct-sale-search-input"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              {activeSearchConfig.inputLabel}
            </label>
            <input
              id="cashier-direct-sale-search-input"
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={activeSearchConfig.placeholder}
              className={FIELD_CLASS_NAME}
              disabled={lookupLoading || searchingMatches || collecting}
            />
          </div>

          <ActionButton
            type="submit"
            variant="primary"
            size="lg"
            className="self-end"
            disabled={lookupLoading || searchingMatches || collecting}
          >
            {lookupLoading || searchingMatches ? "Searching..." : "Search"}
          </ActionButton>
        </form>

        <div className="mt-3 rounded-xl border border-border bg-[var(--surface-muted)] px-4 py-3 text-sm text-muted-foreground">
          {activeSearchConfig.help}
        </div>
      </SectionCard>

      {searchingMatches ? (
        <LoadingBlock label="Searching outstanding direct-sale receivables..." />
      ) : null}

      {!searchingMatches && searchResultsError ? (
        <ErrorState
          title="Unable to search direct-sale receivables"
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
          description="Pick the right direct-sale receivable to load the cashier-visible queue."
        >
          {searchResults.length === 0 ? (
            <EmptyState
              title="No outstanding direct sales"
              description={`No receivable direct-sale rows matched "${submittedSearch}".`}
            />
          ) : (
            <div className="space-y-3">
              {searchResults.map((result) => (
                <button
                  key={result.direct_sale_id}
                  type="button"
                  onClick={() => void handleSearchResultSelect(result)}
                  className="w-full rounded-2xl border border-border bg-[var(--surface-card-elevated)] p-4 text-left shadow-sm transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-foreground">
                        {result.sale_no || `SALE-${result.direct_sale_id}`} · {result.customer_name || "Unknown customer"}
                      </div>
                      <div className="text-sm text-slate-600">
                        {result.customer_phone || "No phone"} · Invoice {result.billing_invoice_no || "—"}
                      </div>
                      <div className="text-xs text-slate-600">
                        Sale date {formatDate(result.sale_date)} · {result.branch_name || result.branch_code || "Primary branch"}
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[360px]">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Grand Total</div>
                        <div className="mt-1 text-sm font-semibold text-foreground">{money(result.grand_total)}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Collected</div>
                        <div className="mt-1 text-sm font-semibold text-foreground">{money(result.received_total)}</div>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Outstanding</div>
                        <div className="mt-1 text-sm font-semibold text-amber-900">{money(result.balance_total)}</div>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      ) : null}

      {lookupLoading ? (
        <LoadingBlock label="Loading direct-sale receivable queue..." />
      ) : null}

      {!lookupLoading && lookupError ? (
        <ErrorState
          title="Unable to load direct-sale receivables"
          description={lookupError}
          onRetry={() => void handleLookup()}
        />
      ) : null}

      {!lookupLoading && !lookupError && lookup ? (
        <>
          <SectionCard
            title="Customer direct-sale summary"
            description="Cashier context for the current retail receivable queue."
          >
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Customer</div>
                <div className="mt-1 text-base font-semibold text-foreground">{lookup.customer_name || "—"}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Phone</div>
                <div className="mt-1 text-base font-semibold text-foreground">{lookup.phone || "—"}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Outstanding sales</div>
                <div className="mt-1 text-base font-semibold text-foreground">{lookup.total_outstanding_sales}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Outstanding amount</div>
                <div className="mt-1 text-base font-semibold text-foreground">{money(lookup.total_outstanding_amount)}</div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Step 2 · Select direct-sale bill"
            description="Pick the exact invoiced direct-sale receivable before posting the counter collection."
          >
            {directSales.length === 0 ? (
              <EmptyState
                title="No outstanding direct sales"
                description="No cashier-visible direct-sale receivables were returned for this customer."
              />
            ) : (
              <div className="space-y-3">
                {directSales.map((sale) => {
                  const isSelected = selectedDirectSaleId === sale.direct_sale_id;
                  return (
                    <button
                      key={sale.direct_sale_id}
                      type="button"
                      onClick={() => {
                        setSelectedDirectSaleId(sale.direct_sale_id);
                        setAmount(sale.balance_total);
                        setReferenceNo("");
                        setNote("");
                        setCollectError(null);
                        setSuccess(null);
                      }}
                      className={[
                        "w-full rounded-2xl border p-4 text-left shadow-sm transition",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-foreground">
                            {sale.sale_no || `SALE-${sale.direct_sale_id}`} · Invoice {sale.billing_invoice_no || "—"}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <StatusBadge status={sale.status || "INVOICED"} label="Retail receivable" />
                            <span className="text-sm text-slate-600">
                              Sale date {formatDate(sale.sale_date)} · {sale.branch_name || sale.branch_code || "Primary branch"}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600">
                            Counter {sale.cash_counter_name || sale.cash_counter_code || "Assigned counter default"}
                          </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[360px]">
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Grand Total</div>
                            <div className="mt-1 text-sm font-semibold text-foreground">{money(sale.grand_total)}</div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Collected</div>
                            <div className="mt-1 text-sm font-semibold text-foreground">{money(sale.received_total)}</div>
                          </div>
                          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Outstanding</div>
                            <div className="mt-1 text-sm font-semibold text-amber-900">{money(sale.balance_total)}</div>
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
            title="Step 3 · Post direct-sale collection"
            description="This cashier flow uses the assigned cash counter and linked finance account automatically. Add a reference number when you have digital proof."
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
                    ? success.message || "Direct-sale collection posted successfully."
                    : success.message || "Duplicate reference detected; existing receipt returned."}
                </div>
                <div className="mt-1">
                  Receipt {success.receipt.receipt_no || `#${success.receipt.id}`} · Outstanding moved from {money(success.outstanding_before)} to {money(success.outstanding_after)}.
                </div>
              </div>
            ) : null}

            {collectError ? (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {collectError}
              </div>
            ) : null}

            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
              }}
            >
              <label className="text-sm text-muted-foreground">
                Collection amount
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className={FIELD_CLASS_NAME}
                />
              </label>

              <label className="text-sm text-muted-foreground">
                Reference no.
                <input
                  value={referenceNo}
                  onChange={(event) => setReferenceNo(event.target.value)}
                  className={FIELD_CLASS_NAME}
                  placeholder="Optional UPI / bank / manual reference"
                />
              </label>

              <label className="text-sm text-muted-foreground md:col-span-2">
                Notes
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="min-h-[96px] w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3 text-sm text-foreground outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
                  placeholder="Optional note for the receipt"
                />
              </label>
            </form>

            <div className="mt-6 flex flex-wrap gap-3">
              <ConfirmActionButton
                label={collecting ? "Posting..." : "Post Direct-Sale Collection"}
                title={`Post collection for ${selectedDirectSale?.sale_no || "selected direct sale"}?`}
                description="This posts a retail receipt through the cashier's assigned counter without affecting EMI allocation or subscription reconciliation."
                onConfirm={() => void handleCollect()}
                variant="primary"
                disabled={collecting || !selectedDirectSale}
              />
            </div>
          </SectionCard>
        </>
      ) : null}
    </>
  );
}
