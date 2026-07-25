"use client";

import { useEffect, useState } from "react";
import { listBranches, listCashCounters, type BranchRecord, type CashCounterRecord } from "@/services/branch-control";
import { listFinanceAccounts, type FinanceAccount } from "@/services/accounting";
import UnifiedReceivableSearchPanel from "@/features/receivables/UnifiedReceivableSearchPanel";
import ReceivableWorkbenchPanel from "@/features/receivables/ReceivableWorkbenchPanel";
import {
  fetchAdminReceivableWorkbench,
  searchAdminReceivables,
  type ReceivableWorkbench,
  type UnifiedReceivableResult,
} from "@/services/receivables";
import { normalizeApiError } from "@/services/api/errors";
import AdminUniversalCollectForm from "@/domains/payments/components/AdminUniversalCollectForm";
import ReceivableDetailCard from "@/features/receivables/ReceivableDetailCard";
import { type UnifiedCollectionResponse } from "@/services/collections";

export default function AdminPaymentCollectPage({
  variant = "page",
  queryString = "",
  onCreated,
}: {
  variant?: "page" | "drawer";
  queryString?: string;
  onCreated?: (paymentId: number) => void;
} = {}) {
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [counters, setCounters] = useState<CashCounterRecord[]>([]);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UnifiedReceivableResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  
  const [selectedReceivable, setSelectedReceivable] = useState<UnifiedReceivableResult | null>(null);
  const [successResponse, setSuccessResponse] = useState<UnifiedCollectionResponse | null>(null);

  const [workbench, setWorkbench] = useState<ReceivableWorkbench | null>(null);
  const [workbenchLoading, setWorkbenchLoading] = useState(false);
  const [workbenchError, setWorkbenchError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadMasters() {
      try {
        const [branchPayload, counterPayload, financeAccountPayload] = await Promise.all([
          listBranches({ status: "ACTIVE" }),
          listCashCounters({ is_active: "true" }),
          listFinanceAccounts({ is_active: 1, page_size: 100, for_payment_collection: "true" }),
        ]);
        if (!active) return;
        setBranches(branchPayload.results);
        setCounters(counterPayload.results);
        setFinanceAccounts(financeAccountPayload.results.filter((account) => account.is_active));
      } catch (err) {
        console.error("Failed to load masters", err);
      }
    }
    void loadMasters();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (queryString) {
      let q = queryString.trim();
      let contextStr: string | undefined = undefined;
      
      if (q.startsWith("?")) {
        const params = new URLSearchParams(q);
        const sub = params.get("subscription");
        const out = params.get("outstanding");
        const ctx = params.get("context");
        
        if (ctx) contextStr = ctx.toUpperCase();
        
        if (sub) {
          q = `subscription:${sub}`;
        } else if (out) {
          q = `outstanding:${out}`;
        } else {
          q = Array.from(params.values())[0] || q;
        }
      }
      
      setSearchQuery(q);
      void handleSearch(q, contextStr);
    }
  }, [queryString]);

  async function handleSearch(query: string, autoSelectContext?: string) {
    const trimmed = query.trim();
    setSearchError(null);
    setSuccessResponse(null);
    
    if (!trimmed) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const payload = await searchAdminReceivables(trimmed);
      setSearchResults(payload.results);

      if (autoSelectContext === "SECURITY_DEPOSIT") {
        const depositRow = payload.results.find((row) => 
          row.result_type === "DEPOSIT" || row.secondary_badges?.includes("DEPOSIT") || row.source_type === "RENT" || row.source_type === "LEASE"
        );
        if (depositRow) {
          handleSelectReceivable(depositRow);
        } else if (payload.results.length === 1) {
          handleSelectReceivable(payload.results[0]);
        }
      } else if (payload.results.length === 1 && (query.startsWith("subscription:") || query.startsWith("outstanding:"))) {
        handleSelectReceivable(payload.results[0]);
      }
    } catch (error) {
      setSearchResults([]);
      setSearchError(normalizeApiError(error).message || "Unable to search receivables.");
    } finally {
      setIsSearching(false);
    }
  }

  function loadWorkbench(sourceType: UnifiedReceivableResult["source_type"], sourceId: number) {
    setWorkbench(null);
    setWorkbenchError(null);
    setWorkbenchLoading(true);
    fetchAdminReceivableWorkbench({ source_type: sourceType, source_id: sourceId })
      .then((payload) => setWorkbench(payload))
      .catch((error) => setWorkbenchError(normalizeApiError(error).message || "Unable to load customer position."))
      .finally(() => setWorkbenchLoading(false));
  }

  function handleSelectReceivable(row: UnifiedReceivableResult) {
    if (row.primary_action === "VIEW_ONLY" || row.primary_action === "DISABLED") {
      setSearchError(`Collection is disabled for this record: ${row.disabled_reason || "Read-only"}`);
      return;
    }
    setSearchError(null);
    setSuccessResponse(null);
    setSelectedReceivable(row);
    if (row.source_id) {
      loadWorkbench(row.source_type, row.source_id);
    }
  }

  function handleSelectOtherDue(sourceType: string, sourceId: number) {
    const match = searchResults.find(
      (row) => row.source_type === sourceType && row.source_id === sourceId
    );
    if (match) {
      handleSelectReceivable(match);
      return;
    }
    // Not in current results — search by the workbench customer so the cashier can pick it.
    const customerName = workbench?.customer?.name;
    if (customerName) {
      setSearchQuery(customerName);
      void handleSearch(customerName);
    }
  }

  function handleSuccess(response: UnifiedCollectionResponse) {
    setSuccessResponse(response);
    setSelectedReceivable(null);
    setWorkbench(null);
    setWorkbenchError(null);
    if (onCreated && response.payment_id) {
      onCreated(response.payment_id as number);
    }
    // Refresh search results in background
    if (searchQuery) {
      void handleSearch(searchQuery);
    }
  }

  function handleCancel() {
    setSelectedReceivable(null);
    setWorkbench(null);
    setWorkbenchError(null);
  }

  return (
    <div className="space-y-6">
      {successResponse && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-5 shadow-sm">
          <div className="flex items-center space-x-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-medium text-emerald-900">Payment Collected Successfully</h3>
              <p className="text-sm text-emerald-700">{successResponse.message || successResponse.detail}</p>
            </div>
          </div>
          
          <div className="mt-4 flex flex-wrap gap-4">
            {successResponse.receipt_id && (
              <a
                href={`/api/v1/admin/receipts/${successResponse.receipt_id}/pdf/`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              >
                <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Receipt PDF
              </a>
            )}
            <button
              onClick={() => setSuccessResponse(null)}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Collect Another Payment
            </button>
            {queryString && queryString.includes("subscription=") && (
              <a
                href={`/admin/subscriptions/${new URLSearchParams(queryString.startsWith("?") ? queryString : `?${queryString}`).get("subscription")}`}
                className="inline-flex items-center rounded-md border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 shadow-sm hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Back to Contract
              </a>
            )}
          </div>
        </div>
      )}

      <UnifiedReceivableSearchPanel
        title="Universal Collection Search"
        description="Search across Advance EMI, Direct Sale, Rent, Lease, and Legacy receivables to post a collection."
        query={searchQuery}
        results={searchResults}
        loading={isSearching}
        error={searchError}
        searched={searchResults.length > 0}
        onQueryChange={setSearchQuery}
        onSearch={handleSearch}
        onCollectSelect={handleSelectReceivable}
        onRetrySearch={() => void handleSearch(searchQuery)}
      />

      {selectedReceivable && (
        <div className="mt-8 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <ReceivableDetailCard receivable={selectedReceivable} />

          <ReceivableWorkbenchPanel
            workbench={workbench}
            loading={workbenchLoading}
            error={workbenchError}
            onSelectOtherDue={handleSelectOtherDue}
          />

          <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
            <div className="border-b px-6 py-4">
              <h3 className="text-lg font-semibold leading-none tracking-tight">
                Collection Form
              </h3>
            </div>
            <div className="p-6">
              <AdminUniversalCollectForm
                receivable={selectedReceivable}
                branches={branches}
                counters={counters}
                financeAccounts={financeAccounts}
                onSuccess={handleSuccess}
                onCancel={handleCancel}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
