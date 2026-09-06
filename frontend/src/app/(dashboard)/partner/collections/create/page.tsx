"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { RefreshCw, Search, CreditCard, CheckCircle } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { normalizeApiError } from "@/services/api/errors";
import {
  collectPartnerPayment,
  listPartnerSubscriptions,
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

export default function PartnerCollectionCreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const subscriptionFromQuery = searchParams.get("subscription") || "";

  const [form, setForm] = useState<FormState>(buildDefaultForm);
  const [subscriptions, setSubscriptions] = useState<PartnerSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [selectedSubscription, setSelectedSubscription] = useState<PartnerSubscription | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadSubscriptions = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const payload = await listPartnerSubscriptions({ status: "ACTIVE" });
      const rows = Array.isArray(payload?.results) ? payload.results : [];
      setSubscriptions(rows);
      setError(null);

      const preselectedId = subscriptionFromQuery ? Number(subscriptionFromQuery) : 0;
      if (preselectedId > 0) {
        const matched = rows.find((item) => item.id === preselectedId);
        if (matched) {
          setSelectedSubscription(matched);
          setForm((prev) => ({
            ...prev,
            subscription: String(matched.id),
            amount: matched.monthly_amount ? String(matched.monthly_amount) : prev.amount,
          }));
        }
      }
    } catch (err) {
      setError(normalizeApiError(err).message || "Failed to load subscriptions.");
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, [subscriptionFromQuery]);

  useEffect(() => {
    void loadSubscriptions("initial");
  }, [loadSubscriptions]);

  const filteredSubscriptions = useMemo(() => {
    if (!searchInput.trim()) return subscriptions;
    const lowerSearch = searchInput.toLowerCase();
    return subscriptions.filter(s => 
      String(s.id).includes(lowerSearch) || 
      (s.customer_name || "").toLowerCase().includes(lowerSearch) ||
      (s.customer_phone || "").toLowerCase().includes(lowerSearch)
    );
  }, [searchInput, subscriptions]);

  function handleInputChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSubscription) {
      setError("Please select a subscription first.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await collectPartnerPayment({
        subscription: Number(form.subscription),
        amount: Number(form.amount),
        payment_mode: form.payment_mode,
        paid_at: form.paid_at,
        reference_no: form.reference_no.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      setSuccess("Collection submitted successfully.");
      setForm(buildDefaultForm());
      setSelectedSubscription(null);
      setSearchInput("");
    } catch (err) {
      setError(normalizeApiError(err).message || "Failed to submit collection.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col p-4 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Collect Payment</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Submit partner-scoped collection
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSubscriptions("refresh")}
          disabled={refreshing}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {success && (
        <div className="rounded-xl bg-green-500/10 p-4 text-green-700 dark:text-green-400 font-medium text-sm">
          {success}
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-500/10 p-4 text-red-700 dark:text-red-400 font-medium text-sm">
          {error}
        </div>
      )}

      {/* Subscription Selection */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search subscriptions by name or phone..."
            className="h-12 w-full rounded-2xl border border-border bg-background pl-10 pr-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {loading ? (
          <LoadingBlock label="Loading subscriptions..." />
        ) : !selectedSubscription ? (
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {filteredSubscriptions.length === 0 ? (
              <EmptyState title="No subscriptions" description="No active subscriptions match your search." />
            ) : (
              filteredSubscriptions.slice(0, 10).map((row) => (
                <button
                  key={row.id}
                  onClick={() => {
                    setSelectedSubscription(row);
                    setForm(prev => ({
                      ...prev,
                      subscription: String(row.id),
                      amount: row.monthly_amount ? String(row.monthly_amount) : prev.amount,
                    }));
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition active:scale-95 text-left"
                >
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <CreditCard className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-foreground truncate">
                      {row.customer_name || "Unknown Customer"}
                    </div>
                    <div className="mt-0.5 text-xs font-medium text-muted-foreground">
                      SUB-{row.id} • {row.product_name || "Product"}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-2xl border-2 border-primary/20 bg-primary/5 p-4">
            <div>
              <div className="text-sm font-bold text-foreground">
                {selectedSubscription.customer_name || "Unknown Customer"}
              </div>
              <div className="text-xs font-medium text-muted-foreground">
                SUB-{selectedSubscription.id}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedSubscription(null)}
              className="text-xs font-bold text-primary underline"
            >
              Change
            </button>
          </div>
        )}
      </div>

      {/* Collection Form */}
      {selectedSubscription && (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="space-y-2">
            <label htmlFor="f-amount" className="text-sm font-semibold text-foreground">Amount (₹)</label>
            <input id="f-amount"
              type="number"
              name="amount"
              step="0.01"
              required
              value={form.amount}
              onChange={handleInputChange}
              className="h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="f-collection-date" className="text-sm font-semibold text-foreground">Collection Date</label>
            <input id="f-collection-date"
              type="date"
              name="paid_at"
              required
              value={form.paid_at}
              onChange={handleInputChange}
              className="h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="f-payment-mode" className="text-sm font-semibold text-foreground">Payment Mode</label>
            <select id="f-payment-mode"
              name="payment_mode"
              value={form.payment_mode}
              onChange={handleInputChange}
              className="h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="CASH">Cash</option>
              <option value="UPI">UPI / Bank</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="f-reference-optional" className="text-sm font-semibold text-foreground">Reference (Optional)</label>
            <input id="f-reference-optional"
              type="text"
              name="reference_no"
              value={form.reference_no}
              onChange={handleInputChange}
              placeholder="e.g. UPI Ref"
              className="h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="f-notes-optional" className="text-sm font-semibold text-foreground">Notes (Optional)</label>
            <textarea id="f-notes-optional"
              name="notes"
              value={form.notes}
              onChange={handleInputChange}
              placeholder="Any comments..."
              rows={2}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground transition active:scale-95 disabled:opacity-50"
          >
            {submitting ? "Submitting..." : (
              <>
                <CheckCircle className="size-5" />
                Submit Collection
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
}
