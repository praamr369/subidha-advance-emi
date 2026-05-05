"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";

import ActionButton from "@/components/ui/ActionButton";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { WorkspaceSection } from "@/components/ui/workspace";
import { normalizeApiError } from "@/services/api/errors";
import {
  collectDirectSalePayment,
  getDirectSale,
  type DirectSale,
  type DirectSaleCollectionResponse,
} from "@/services/billing";
import {
  listBranches,
  listCashCounters,
  type BranchRecord,
  type CashCounterRecord,
} from "@/services/branch-control";
import {
  listFinanceAccounts,
  type FinanceAccount,
} from "@/services/accounting";
import { invalidateAfterDirectSaleCollect } from "@/lib/operational-query-invalidation";
import { searchAdminReceivables, type UnifiedReceivableResult } from "@/services/receivables";

const FIELD_CLASS_NAME =
  "w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2.5 text-sm text-foreground outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35";
const READ_ONLY_FIELD_CLASS_NAME =
  "w-full rounded-xl border border-border bg-[var(--surface-muted)] px-3 py-2.5 text-sm text-muted-foreground";

type FormState = {
  amount: string;
  branch_id: string;
  cash_counter_id: string;
  finance_account_id: string;
  reference_no: string;
  notes: string;
};

function formatMoney(value?: string | number | null): string {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "₹0.00";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(numeric);
}

function formatDateLabel(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function buildDefaultForm(sale: DirectSale | null): FormState {
  return {
    amount: sale?.balance_total || "",
    branch_id: sale?.branch ? String(sale.branch) : "",
    cash_counter_id: sale?.cash_counter ? String(sale.cash_counter) : "",
    finance_account_id: sale?.finance_account ? String(sale.finance_account) : "",
    reference_no: "",
    notes: "",
  };
}

export default function AdminDirectSaleCollectForm({
  variant = "page",
  canonicalSelfHref,
  prefillDirectSaleId,
}: {
  variant?: "page" | "drawer";
  canonicalSelfHref: string;
  prefillDirectSaleId?: number | null;
}) {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<UnifiedReceivableResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedSale, setSelectedSale] = useState<DirectSale | null>(null);
  const [loadingSale, setLoadingSale] = useState(false);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [counters, setCounters] = useState<CashCounterRecord[]>([]);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);
  const [mastersReady, setMastersReady] = useState(false);
  const [form, setForm] = useState<FormState>(() => buildDefaultForm(null));
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<DirectSaleCollectionResponse | null>(null);

  useEffect(() => {
    let active = true;

    async function loadMasters() {
      try {
        const [branchPayload, counterPayload, financePayload] = await Promise.all([
          listBranches({ status: "ACTIVE" }),
          listCashCounters({ is_active: "true" }),
          listFinanceAccounts({ is_active: "true", for_payment_collection: "true" }),
        ]);
        if (!active) return;
        setBranches(branchPayload.results);
        setCounters(counterPayload.results);
        setFinanceAccounts(financePayload.results);
      } catch {
        if (!active) return;
        setBranches([]);
        setCounters([]);
        setFinanceAccounts([]);
      } finally {
        if (active) {
          setMastersReady(true);
        }
      }
    }

    void loadMasters();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const trimmed = searchInput.trim();

    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setSearching(false);
      return () => {
        active = false;
      };
    }

    const timer = window.setTimeout(async () => {
      try {
        setSearching(true);
        setSearchError(null);
        const payload = await searchAdminReceivables(trimmed);
        if (!active) return;
        setSearchResults(
          payload.results.filter((row) => row.source_type === "DIRECT_SALE")
        );
      } catch (error) {
        if (!active) return;
        setSearchResults([]);
        setSearchError(
          normalizeApiError(error).message ||
            "Unable to search direct-sale receivables."
        );
      } finally {
        if (active) {
          setSearching(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [searchInput]);

  useEffect(() => {
    setForm(buildDefaultForm(selectedSale));
    setErrorMessage(null);
    setSuccess(null);
  }, [selectedSale]);

  const availableCounters = useMemo(() => {
    if (!form.branch_id) return counters;
    return counters.filter((counter) => String(counter.branch) === form.branch_id);
  }, [counters, form.branch_id]);

  const availableFinanceAccounts = useMemo(() => {
    if (!form.branch_id) return financeAccounts;
    return financeAccounts.filter((account) => {
      if (account.branch == null) return true;
      return String(account.branch) === form.branch_id;
    });
  }, [financeAccounts, form.branch_id]);

  const handleSalePick = useCallback(async (saleId: number) => {
    setLoadingSale(true);
    setErrorMessage(null);
    setSuccess(null);

    try {
      const sale = await getDirectSale(saleId);
      setSelectedSale(sale);
      setSearchResults([]);
      setSearchInput(
        [sale.sale_no || `SALE-${sale.id}`, sale.customer_name || sale.customer_name_snapshot]
          .filter(Boolean)
          .join(" · ")
      );
    } catch (error) {
      setErrorMessage(
        normalizeApiError(error).message || "Unable to load the selected direct sale."
      );
      setSelectedSale(null);
    } finally {
      setLoadingSale(false);
    }
  }, []);

  useEffect(() => {
    if (!prefillDirectSaleId) return;
    void handleSalePick(prefillDirectSaleId);
  }, [handleSalePick, prefillDirectSaleId]);

  function updateField(name: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function handleCounterChange(event: ChangeEvent<HTMLSelectElement>) {
    const cashCounterId = event.target.value;
    updateField("cash_counter_id", cashCounterId);
    if (!cashCounterId) return;
    const selectedCounter =
      counters.find((counter) => String(counter.id) === cashCounterId) ?? null;
    if (!selectedCounter) return;
    updateField("branch_id", String(selectedCounter.branch));
    updateField("finance_account_id", String(selectedCounter.finance_account));
  }

  function validateForm(): string | null {
    if (!selectedSale) return "Select an outstanding direct sale before posting collection.";

    const amount = Number(form.amount);
    if (!form.amount.trim()) return "Collection amount is required.";
    if (!Number.isFinite(amount) || amount <= 0) {
      return "Collection amount must be greater than zero.";
    }
    if (amount > Number(selectedSale.balance_total || 0)) {
      return "Collection amount cannot exceed the outstanding direct-sale balance.";
    }
    if (!form.finance_account_id) {
      return "Select a finance account or cash counter before posting collection.";
    }
    if (form.reference_no.trim().length > 100) {
      return "Reference number must be within 100 characters.";
    }
    return null;
  }

  async function submitCollection() {
    if (submitting) return;
    setErrorMessage(null);
    setSuccess(null);

    const validationError = validateForm();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }
    if (!selectedSale) return;

    setSubmitting(true);
    try {
      const response = await collectDirectSalePayment(selectedSale.id, {
        amount: Number(form.amount).toFixed(2),
        branch_id: form.branch_id ? Number(form.branch_id) : undefined,
        cash_counter_id: form.cash_counter_id ? Number(form.cash_counter_id) : undefined,
        finance_account_id: form.finance_account_id
          ? Number(form.finance_account_id)
          : undefined,
        reference_no: form.reference_no.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      setSuccess(response);
      await invalidateAfterDirectSaleCollect(queryClient);
      setSelectedSale(response.direct_sale);
      setForm((current) => ({
        ...current,
        amount: response.direct_sale.balance_total,
        reference_no: "",
        notes: "",
      }));
    } catch (error) {
      setErrorMessage(
        normalizeApiError(error).message || "Unable to post direct-sale collection."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <WorkspaceSection
        title="Direct-sale receivable collection"
        description="Search outstanding direct-sale bills, verify the exact sale, and post a retail receipt against the existing receivable without entering the EMI allocation path."
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <label
              htmlFor="admin-direct-sale-search"
              className="mb-2 block text-sm font-semibold text-foreground"
            >
              Search outstanding direct sale
            </label>
            <input
              id="admin-direct-sale-search"
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className={FIELD_CLASS_NAME}
              placeholder="Sale number, customer name, phone, or invoice reference"
              aria-describedby="admin-direct-sale-search-hint"
            />
          </div>

          <ActionButton
            type="button"
            variant="secondary"
            size="lg"
            className="self-end"
            onClick={() => {
              setSearchInput("");
              setSearchResults([]);
              setSelectedSale(null);
              setErrorMessage(null);
              setSuccess(null);
            }}
          >
            Clear
          </ActionButton>
        </div>

        <div
          id="admin-direct-sale-search-hint"
          className="mt-3 rounded-xl border border-border bg-[var(--surface-muted)] px-4 py-3 text-sm text-muted-foreground"
        >
          Search accepts sale number, customer name, phone, or invoice reference. Use direct-sale collection only for invoiced retail bills with outstanding balance. Subscription EMI, rent, and lease collections stay in the subscription workflow.
        </div>

        {searching ? <div className="mt-4 text-sm text-muted-foreground">Searching outstanding direct sales...</div> : null}
        {searchError ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {searchError}
          </div>
        ) : null}

        {!searching && searchInput.trim().length >= 2 ? (
          <div className="mt-4 space-y-3">
            {searchResults.length === 0 ? (
              <EmptyState
                title="No direct-sale results"
                description={`No direct-sale references matched "${searchInput.trim()}".`}
              />
            ) : (
              searchResults.map((row) => (
                <div
                  key={`${row.source_type}-${row.source_id ?? row.reference_no}`}
                  className="w-full rounded-2xl border border-border bg-[var(--surface-card-elevated)] p-4 text-left shadow-sm"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {row.display_reference || row.reference_no} · {row.customer_name || "Walk-in customer"}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {row.phone_masked || "No phone"} · Status {row.status || "UNKNOWN"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {row.reason_if_not_collectible || row.disabled_reason || "Direct-sale receivable"}
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="rounded-xl border border-border bg-background px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Grand Total</div>
                        <div className="mt-1 text-sm font-semibold text-foreground">{formatMoney(row.total_amount)}</div>
                      </div>
                      <div className="rounded-xl border border-border bg-background px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Collected</div>
                        <div className="mt-1 text-sm font-semibold text-foreground">{formatMoney(row.paid_amount)}</div>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Outstanding</div>
                        <div className="mt-1 text-sm font-semibold text-amber-900">{formatMoney(row.due_amount)}</div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {row.primary_action === "COLLECT_DIRECT_SALE" && row.source_id ? (
                      <button
                        type="button"
                        onClick={() => void handleSalePick(row.source_id as number)}
                        className="inline-flex items-center rounded-md border border-amber-900 bg-amber-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-amber-800"
                      >
                        Collect direct-sale balance
                      </button>
                    ) : null}
                    {row.primary_action === "OPEN_SALE" && row.collection_route ? (
                      <Link
                        href={row.collection_route}
                        className="inline-flex items-center rounded-md border border-orange-700 bg-orange-700 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-orange-600"
                      >
                        Open sale
                      </Link>
                    ) : null}
                    {row.primary_action === "VIEW_RECEIPTS" && row.collection_route ? (
                      <Link
                        href={row.collection_route}
                        className="inline-flex items-center rounded-md border border-slate-700 bg-slate-700 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-600"
                      >
                        View receipts
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}
      </WorkspaceSection>

      {loadingSale ? <LoadingBlock label="Loading direct-sale detail..." /> : null}

      {selectedSale ? (
        <WorkspaceSection
          title="Selected direct-sale receivable"
          description="Review the direct-sale bill and post the later collection using a controlled finance account or mapped cash counter."
        >
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-border bg-background px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Direct Sale</div>
              <div className="mt-1 text-base font-semibold text-foreground">{selectedSale.sale_no || `SALE-${selectedSale.id}`}</div>
            </div>
            <div className="rounded-xl border border-border bg-background px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</div>
              <div className="mt-1 text-base font-semibold text-foreground">{selectedSale.customer_name || selectedSale.customer_name_snapshot || "Walk-in customer"}</div>
            </div>
            <div className="rounded-xl border border-border bg-background px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invoice</div>
              <div className="mt-1 text-base font-semibold text-foreground">{selectedSale.billing_invoice_no || "Draft mirror"}</div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Outstanding</div>
              <div className="mt-1 text-base font-semibold text-amber-900">{formatMoney(selectedSale.balance_total)}</div>
            </div>
          </div>

          <form
            className="mt-6 grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <label className="text-sm text-muted-foreground">
              Collection amount
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(event) => updateField("amount", event.target.value)}
                className={FIELD_CLASS_NAME}
              />
            </label>

            <label className="text-sm text-muted-foreground">
              Branch
              <select
                name="branch_id"
                value={form.branch_id}
                onChange={(event) => updateField("branch_id", event.target.value)}
                className={FIELD_CLASS_NAME}
                disabled={!mastersReady}
              >
                <option value="">Use direct-sale branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.code} · {branch.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-muted-foreground">
              Cash counter
              <select
                name="cash_counter_id"
                value={form.cash_counter_id}
                onChange={handleCounterChange}
                className={FIELD_CLASS_NAME}
                disabled={!mastersReady}
              >
                <option value="">No counter override</option>
                {availableCounters.map((counter) => (
                  <option key={counter.id} value={counter.id}>
                    {counter.code} · {counter.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-muted-foreground">
              Finance account
              <select
                name="finance_account_id"
                value={form.finance_account_id}
                onChange={(event) => updateField("finance_account_id", event.target.value)}
                className={FIELD_CLASS_NAME}
                disabled={!mastersReady}
              >
                <option value="">Select finance account</option>
                {availableFinanceAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                    {account.branch_name ? ` · ${account.branch_name}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-muted-foreground">
              Reference no.
              <input
                name="reference_no"
                value={form.reference_no}
                onChange={(event) => updateField("reference_no", event.target.value)}
                className={FIELD_CLASS_NAME}
                placeholder="Optional digital / manual reference"
              />
            </label>

            <label className="text-sm text-muted-foreground md:col-span-2">
              Notes
              <textarea
                name="notes"
                value={form.notes}
                onChange={(event) => updateField("notes", event.target.value)}
                className={FIELD_CLASS_NAME}
                rows={3}
                placeholder="Operational context for the collection receipt"
              />
            </label>

            <label className="text-sm text-muted-foreground">
              Sale date
              <input
                value={formatDateLabel(selectedSale.sale_date)}
                readOnly
                className={READ_ONLY_FIELD_CLASS_NAME}
              />
            </label>

            <label className="text-sm text-muted-foreground">
              Current invoice state
              <input
                value={selectedSale.billing_invoice_status || "—"}
                readOnly
                className={READ_ONLY_FIELD_CLASS_NAME}
              />
            </label>
          </form>

          {errorMessage ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {errorMessage}
            </div>
          ) : null}

          {success ? (
            <div
              className={[
                "mt-4 rounded-xl border px-4 py-3 text-sm",
                success.created
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-900",
              ].join(" ")}
            >
              <div className="font-semibold">
                {success.created
                  ? `Retail receipt ${success.receipt.receipt_no || `#${success.receipt.id}`} posted successfully.`
                  : `Duplicate collection reference detected. Existing receipt ${success.receipt.receipt_no || `#${success.receipt.id}`} returned.`}
              </div>
              <div className="mt-1">
                Outstanding moved from {formatMoney(success.outstanding_before)} to {formatMoney(success.outstanding_after)}.
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/admin/billing/direct-sales?focus_sale=${success.direct_sale.id}`}
                  className="inline-flex items-center rounded-md border border-current bg-white px-3 py-1.5 text-sm font-medium shadow-sm transition hover:bg-white/70"
                >
                  Open direct sale
                </Link>
                <Link
                  href={`/admin/billing/receipts?direct_sale=${success.direct_sale.id}`}
                  className="inline-flex items-center rounded-md border border-current bg-white px-3 py-1.5 text-sm font-medium shadow-sm transition hover:bg-white/70"
                >
                  Open receipts
                </Link>
                {variant === "drawer" ? (
                  <Link
                    href={canonicalSelfHref}
                    className="inline-flex items-center rounded-md border border-current bg-white px-3 py-1.5 text-sm font-medium shadow-sm transition hover:bg-white/70"
                  >
                    Open full page
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <ConfirmActionButton
              label={submitting ? "Posting..." : "Post Direct-Sale Collection"}
              title={`Post collection for ${selectedSale.sale_no || `SALE-${selectedSale.id}`}?`}
              description="This creates a retail receipt and updates the posted direct-sale receivable using the existing accounting-safe receipt workflow."
              onConfirm={() => void submitCollection()}
              variant="primary"
              disabled={submitting}
            />
            <Link
              href={`/admin/billing/direct-sales?focus_sale=${selectedSale.id}`}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-muted"
            >
              Open Direct Sale
            </Link>
          </div>
        </WorkspaceSection>
      ) : null}

      {!selectedSale && !loadingSale ? (
        <WorkspaceSection
          title="Workflow guardrail"
          description="Direct-sale collections stay separate from subscription collections so retail receivables do not get mixed into EMI allocation, winner waiver logic, or subscription reconciliation."
        >
          {errorMessage ? (
            <ErrorState
              title="Unable to continue"
              description={errorMessage}
            />
          ) : (
            <EmptyState
              title="Select an outstanding direct sale"
              description="Search and pick an invoiced direct sale with outstanding balance to continue."
            />
          )}
        </WorkspaceSection>
      ) : null}
    </div>
  );
}
