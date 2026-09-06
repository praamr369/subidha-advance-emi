"use client";

import React, { useState, useEffect } from "react";
import { CheckCircle, ArrowRight, Loader2, Coins } from "lucide-react";

import CustomerSelector from "@/components/admin/customers/CustomerSelector";
import type { CustomerRecord } from "@/services/customers";
import {
  fetchSmartCollectionOutstanding,
  planSmartCollection,
  executeSmartCollection,
  type SmartCollectionPlan,
} from "@/services/smart-collection";
import { listFinanceAccounts, type FinanceAccount } from "@/services/accounting";
import SmartCollectionPreview from "@/components/smart-collection/SmartCollectionPreview";
import ErrorState from "@/components/feedback/ErrorState";

/**
 * Smart Collection Cockpit: accept money from a customer and auto-route it to
 * EMIs, direct sales, and advance using business rules. Extracted from
 * /admin/billing/collections so the same workflow renders both on that route and
 * as a tab in the unified Collections Workspace (/admin/collections).
 */
export default function SmartCollectionCockpitPanel() {
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [outstanding, setOutstanding] = useState<SmartCollectionPlan | null>(null);

  const [amount, setAmount] = useState<string>("");
  const [useExistingAdvance, setUseExistingAdvance] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState("CASH");

  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);
  const [selectedFinanceAccount, setSelectedFinanceAccount] = useState<number | "">("");

  const [plan, setPlan] = useState<SmartCollectionPlan | null>(null);
  const [result, setResult] = useState<SmartCollectionPlan | null>(null);

  const [loadingOutstanding, setLoadingOutstanding] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load finance accounts for the selector
    listFinanceAccounts({ is_active: "true", limit: 100 })
      .then((res) => {
        setFinanceAccounts(res.results || []);
        if (res.results && res.results.length > 0) {
          // Pre-select cash desk or main bank if possible, else first
          setSelectedFinanceAccount(res.results[0].id);
        }
      })
      .catch((err) => console.error("Failed to load finance accounts", err));
  }, []);

  const handleSelectCustomer = async (customer: CustomerRecord) => {
    setSelectedCustomer(customer);
    setOutstanding(null);
    setPlan(null);
    setResult(null);
    setError(null);

    try {
      setLoadingOutstanding(true);
      const data = await fetchSmartCollectionOutstanding(customer.id);
      setOutstanding(data);
    } catch (err: any) {
      setError(err.message || "Failed to fetch outstanding balances.");
    } finally {
      setLoadingOutstanding(false);
    }
  };

  const handleClearCustomer = () => {
    setSelectedCustomer(null);
    setOutstanding(null);
    setPlan(null);
    setResult(null);
    setError(null);
    setAmount("");
  };

  const handlePreview = async () => {
    if (!selectedCustomer) return;
    if (!amount || Number(amount) <= 0) {
      setError("Please enter a valid amount greater than 0.");
      return;
    }

    try {
      setLoadingPlan(true);
      setError(null);
      const data = await planSmartCollection({
        customer_id: selectedCustomer.id,
        amount,
        use_existing_advance: useExistingAdvance,
      });
      setPlan(data);
    } catch (err: any) {
      setError(err.message || "Failed to generate allocation plan.");
    } finally {
      setLoadingPlan(false);
    }
  };

  const handleExecute = async () => {
    if (!selectedCustomer || !plan) return;
    if (!selectedFinanceAccount) {
      setError("Please select a finance account (Cash/Bank) to receive the money.");
      return;
    }

    try {
      setExecuting(true);
      setError(null);

      const idempotencyKey = crypto.randomUUID();

      const data = await executeSmartCollection({
        customer_id: selectedCustomer.id,
        amount,
        use_existing_advance: useExistingAdvance,
        payment_method: paymentMethod,
        finance_account_id: Number(selectedFinanceAccount),
        idempotency_key: idempotencyKey,
      });

      setResult(data);
      setPlan(null);
    } catch (err: any) {
      setError(err.message || "Failed to execute smart collection.");
    } finally {
      setExecuting(false);
    }
  };

  const handleReset = () => {
    setAmount("");
    setPlan(null);
    setResult(null);
    setError(null);
    if (selectedCustomer) {
      handleSelectCustomer(selectedCustomer);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      {/* Left Column: Input Form */}
      <div className="lg:col-span-5 space-y-6">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              1. Select Customer
            </label>
            <CustomerSelector
              mode="admin"
              selected={selectedCustomer}
              onSelect={handleSelectCustomer}
              onClear={handleClearCustomer}
              disabled={executing || !!result}
            />
          </div>

          {loadingOutstanding && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Fetching balances...
            </div>
          )}

          {outstanding && !result && (
            <div className="animate-in fade-in slide-in-from-top-2 space-y-4 pt-4 border-t border-border">
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Due (EMI + Sales)</div>
                  <div className="font-semibold text-lg text-foreground">
                    ₹{(Number(outstanding.opening.emi_outstanding_total) + Number(outstanding.opening.direct_sale_outstanding_total)).toFixed(2)}
                  </div>
                </div>
                <div className="rounded-md bg-primary/10 border border-primary/20 p-3">
                  <div className="text-xs text-primary uppercase tracking-wider mb-1">Available Advance</div>
                  <div className="font-semibold text-lg text-primary">
                    ₹{outstanding.opening.advance_balance}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  2. Received Amount (₹)
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <span className="text-muted-foreground font-medium">₹</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={loadingPlan || executing}
                    className="block w-full rounded-md border-0 py-2.5 pl-8 pr-3 text-foreground shadow-sm ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 disabled:opacity-50"
                    placeholder="e.g. 5000"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between py-2">
                <label className="text-sm font-medium text-foreground cursor-pointer flex-1" htmlFor="useAdvance">
                  Apply existing Customer Advance?
                </label>
                <input
                  id="useAdvance"
                  type="checkbox"
                  checked={useExistingAdvance}
                  onChange={(e) => setUseExistingAdvance(e.target.checked)}
                  disabled={loadingPlan || executing || Number(outstanding.opening.advance_balance) <= 0}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary disabled:opacity-50"
                />
              </div>

              <button
                onClick={handlePreview}
                disabled={!amount || Number(amount) <= 0 || loadingPlan || executing}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-3 text-sm font-semibold text-secondary-foreground shadow-sm hover:bg-secondary/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loadingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
                Preview Allocation
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Preview & Execution */}
      <div className="lg:col-span-7">
        {error && (
          <div className="mb-6">
            <ErrorState message={error} onRetry={() => setError(null)} />
          </div>
        )}

        {!plan && !result && outstanding && (
          <div className="rounded-xl border border-dashed border-border bg-background p-12 text-center text-muted-foreground flex flex-col items-center justify-center h-full min-h-[300px]">
            <Coins className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p>Enter an amount and click "Preview Allocation" to see how the money will be distributed.</p>
          </div>
        )}

        {plan && !result && (
          <div className="rounded-xl border border-border bg-card shadow-sm animate-in fade-in slide-in-from-right-4">
            <div className="border-b border-border p-5 bg-muted/30">
              <h3 className="text-lg font-semibold text-foreground">Review Allocation Plan</h3>
              <p className="text-sm text-muted-foreground mt-1">Please confirm the distribution before posting.</p>
            </div>

            <div className="p-5">
              <SmartCollectionPreview plan={plan} />
            </div>

            <div className="border-t border-border p-5 bg-muted/30 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="f-payment-method" className="block text-sm font-medium text-foreground mb-1">Payment Method</label>
                  <select id="f-payment-method"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    disabled={executing}
                    className="block w-full rounded-md border-0 py-2 pl-3 pr-10 text-foreground ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary sm:text-sm sm:leading-6"
                  >
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">Card</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="f-deposit-to-finance-account" className="block text-sm font-medium text-foreground mb-1">Deposit To (Finance Account)</label>
                  <select id="f-deposit-to-finance-account"
                    value={selectedFinanceAccount}
                    onChange={(e) => setSelectedFinanceAccount(Number(e.target.value))}
                    disabled={executing}
                    className="block w-full rounded-md border-0 py-2 pl-3 pr-10 text-foreground ring-1 ring-inset ring-border focus:ring-2 focus:ring-primary sm:text-sm sm:leading-6"
                  >
                    <option value="" disabled>Select account...</option>
                    {financeAccounts.map(fa => (
                      <option key={fa.id} value={fa.id}>{fa.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleExecute}
                  disabled={executing}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 transition-all active:scale-[0.98]"
                >
                  {executing ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" /> Posting...
                    </>
                  ) : (
                    <>
                      Confirm & Post <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
                <button
                  onClick={() => setPlan(null)}
                  disabled={executing}
                  className="rounded-lg border border-border bg-background px-4 py-3 text-sm font-semibold hover:bg-muted disabled:opacity-50 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {result && (
          <div className="rounded-xl border border-green-500/30 bg-green-500/5 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4">
            <div className="p-6 text-center border-b border-green-500/20 bg-green-500/10">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-3" />
              <h3 className="text-xl font-bold text-green-800 dark:text-green-300">Collection Successful</h3>
              <p className="text-sm text-green-700 mt-1 font-medium">Receipt No: {result.receipt?.receipt_no}</p>
              {result.idempotent_replay && (
                <span className="inline-block mt-2 text-xs font-semibold bg-green-600 text-white px-2 py-1 rounded">Idempotent Replay</span>
              )}
            </div>

            <div className="p-6">
              <SmartCollectionPreview plan={result} />

              <div className="mt-8 flex justify-center">
                <button
                  onClick={handleReset}
                  className="rounded-lg bg-background border border-border px-6 py-2 text-sm font-semibold hover:bg-muted transition-all"
                >
                  Start Another Collection
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
