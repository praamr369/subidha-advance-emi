"use client";

import { useState, useEffect, useCallback } from "react";
import { listKYCReverificationQueue, requestKYCReverification, KYCReverificationDoc } from "@/services/aml";

const WINDOW_OPTIONS = [
  { label: "Expiring in 30 days", value: 30 },
  { label: "Expiring in 60 days", value: 60 },
  { label: "Expiring in 90 days", value: 90 },
];

export default function KYCReverificationQueuePage() {
  const [docs, setDocs] = useState<KYCReverificationDoc[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [withinDays, setWithinDays] = useState(60);

  const [actionStates, setActionStates] = useState<Record<number, { busy: boolean; done: boolean; err: string | null }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listKYCReverificationQueue(withinDays);
      setDocs(res.results);
      setCount(res.count);
      setActionStates({});
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  }, [withinDays]);

  useEffect(() => { void load(); }, [load]);

  const requestReverification = async (docId: number, reason?: string) => {
    setActionStates(s => ({ ...s, [docId]: { busy: true, done: false, err: null } }));
    try {
      await requestKYCReverification(docId, reason);
      setActionStates(s => ({ ...s, [docId]: { busy: false, done: true, err: null } }));
    } catch {
      setActionStates(s => ({ ...s, [docId]: { busy: false, done: false, err: "Failed" } }));
    }
  };

  const urgencyClass = (doc: KYCReverificationDoc) => {
    if (doc.overdue) return "border-l-4 border-l-red-500";
    if (doc.days_left !== null && doc.days_left <= 14) return "border-l-4 border-l-orange-400";
    return "border-l-4 border-l-yellow-300";
  };

  const daysLabel = (doc: KYCReverificationDoc) => {
    if (doc.overdue) return <span className="text-red-600 font-semibold text-xs">OVERDUE</span>;
    if (doc.days_left === null) return <span className="text-gray-500 text-xs">No expiry</span>;
    return <span className={`text-xs font-medium ${doc.days_left <= 14 ? "text-orange-600" : "text-yellow-700"}`}>{doc.days_left}d left</span>;
  };

  const docTypeLabel = (t: string) => t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-foreground">KYC Re-verification Queue</h1>
          <p className="text-sm text-muted-foreground">KYC documents expiring soon or overdue for re-verification</p>
        </div>
        <div className="flex gap-2">
          <select
            value={withinDays}
            onChange={e => setWithinDays(Number(e.target.value))}
            className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
          >
            {WINDOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button onClick={() => void load()} className="h-9 px-4 rounded-xl border border-border text-sm">Refresh</button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "Total Docs", value: count },
          { label: "Overdue", value: docs.filter(d => d.overdue).length, cls: "text-red-600" },
          { label: "Due ≤ 14 days", value: docs.filter(d => !d.overdue && d.days_left !== null && d.days_left <= 14).length, cls: "text-orange-600" },
        ].map(card => (
          <div key={card.label} className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">{card.label}</div>
            <div className={`text-lg font-bold mt-1 ${card.cls ?? ""}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {loading && <div className="text-sm text-muted-foreground py-10 text-center">Loading…</div>}

      {!loading && docs.length === 0 && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No documents expiring within {withinDays} days.
        </div>
      )}

      {docs.length > 0 && (
        <div className="space-y-3">
          {docs.map(doc => {
            const state = actionStates[doc.document_id];
            return (
              <div key={doc.document_id} className={`rounded-xl border border-border bg-card p-4 ${urgencyClass(doc)}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{doc.customer_name}</span>
                      <span className="text-xs text-muted-foreground">ID: {doc.customer_id}</span>
                      {daysLabel(doc)}
                    </div>
                    <div className="mt-1 flex gap-3 text-xs text-muted-foreground flex-wrap">
                      <span>Document: <span className="text-foreground font-medium">{docTypeLabel(doc.document_type)}</span></span>
                      <span>Category: {doc.category}</span>
                      {doc.expiry_date && <span>Expires: {doc.expiry_date}</span>}
                      <span>Status: <span className="font-medium">{doc.status}</span></span>
                      {doc.reviewed_by && <span>Reviewed by: {doc.reviewed_by}</span>}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {state?.done ? (
                      <span className="text-xs text-green-600 font-semibold">Re-verification Requested</span>
                    ) : (
                      <button
                        onClick={() => void requestReverification(doc.document_id, "Document expiry approaching")}
                        disabled={state?.busy || doc.status === "RESUBMISSION_REQUIRED"}
                        className="h-8 px-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100 disabled:opacity-50"
                      >
                        {state?.busy
                          ? "Requesting…"
                          : doc.status === "RESUBMISSION_REQUIRED"
                          ? "Already Requested"
                          : "Request Re-verification"}
                      </button>
                    )}
                    {state?.err && <div className="text-xs text-red-600 mt-1">{state.err}</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
