"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileCheck,
  Loader2,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  TriangleAlert,
  User,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";

import { apiFetch } from "@/lib/api";

const API = "/api/v1/partner";

type ReqType = "KYC_UPGRADE" | "LOGIN_ID_SETUP" | "KYC_DOCUMENT_UPLOAD";
type ReqStatus = "PENDING" | "APPROVED" | "REJECTED" | "MORE_INFO" | "IN_PROGRESS";

type CustomerHit = {
  id: number;
  name: string;
  phone: string;
  kyc_status: string;
};

type KycReq = {
  id: number;
  customer_id: number | null;
  customer_name: string;
  customer_phone: string;
  customer_kyc_status: string | null;
  request_type: ReqType;
  notes: string;
  status: ReqStatus;
  admin_remarks: string;
  created_at: string;
  updated_at: string;
};

type Notice = { tone: "success" | "error" | "info"; msg: string };

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function KycBadge({ status }: { status?: string | null }) {
  const s = (status ?? "").toUpperCase();
  const map: Record<string, string> = {
    VERIFIED: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300",
    APPROVED: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300",
    PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    REJECTED: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
    NOT_PROVIDED: "bg-muted text-muted-foreground",
    EXCEPTION_APPROVED: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  };
  const labels: Record<string, string> = {
    NOT_PROVIDED: "No KYC",
    PENDING: "KYC Pending",
    VERIFIED: "KYC Done",
    APPROVED: "KYC Done",
    REJECTED: "KYC Rejected",
    EXCEPTION_APPROVED: "KYC Exception",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[s] ?? map.NOT_PROVIDED}`}>
      {labels[s] ?? s}
    </span>
  );
}

function StatusBadge({ status }: { status: ReqStatus }) {
  const map: Record<ReqStatus, string> = {
    PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    APPROVED: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300",
    REJECTED: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
    MORE_INFO: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
    IN_PROGRESS: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
  };
  const labels: Record<ReqStatus, string> = {
    PENDING: "Pending",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    MORE_INFO: "More Info Needed",
    IN_PROGRESS: "In Progress",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${map[status]}`}>{labels[status]}</span>;
}

function Nt({ tone, children }: { tone: Notice["tone"]; children: React.ReactNode }) {
  const s: Record<Notice["tone"], string> = {
    success: "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300",
    error: "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300",
    info: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300",
  };
  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? AlertCircle : ShieldCheck;
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-medium ${s[tone]}`}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

async function fetchRequests(): Promise<KycReq[]> {
  try {
    const data = (await apiFetch(`${API}/customer-kyc-requests/`)) as { results?: KycReq[] };
    return data.results ?? [];
  } catch (err) {
    throw new Error("Could not load your requests. Please try again.");
  }
}

async function searchCustomers(q: string): Promise<CustomerHit[]> {
  try {
    const data = (await apiFetch(`${API}/customer-search/?q=${encodeURIComponent(q)}`)) as { results?: CustomerHit[] };
    return data.results ?? [];
  } catch {
    return [];
  }
}

async function submitRequest(payload: {
  customer_id?: number | null;
  customer_name?: string;
  customer_phone?: string;
  request_type: ReqType;
  notes: string;
}): Promise<KycReq> {
  try {
    return (await apiFetch(`${API}/customer-kyc-requests/`, {
      method: "POST",
      body: payload,
    })) as KycReq;
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Could not submit. Please try again.");
  }
}

const REQUEST_TYPES: { value: ReqType; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    value: "KYC_UPGRADE",
    label: "KYC Verification",
    desc: "Customer has no KYC. Ask admin to verify their identity.",
    icon: <ShieldCheck className="size-5 text-primary" />,
  },
  {
    value: "LOGIN_ID_SETUP",
    label: "Login ID Setup",
    desc: "Customer has no login. Ask admin to create a login for them.",
    icon: <UserPlus className="size-5 text-primary" />,
  },
  {
    value: "KYC_DOCUMENT_UPLOAD",
    label: "Upload KYC Documents",
    desc: "Customer gave you documents. Request admin to upload on their behalf.",
    icon: <FileCheck className="size-5 text-primary" />,
  },
];

export default function PartnerKycRequestsPage() {
  const [requests, setRequests] = useState<KycReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [reqType, setReqType] = useState<ReqType>("KYC_UPGRADE");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Customer search / selection
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<CustomerHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerHit | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  // Manual entry (if customer not in system)
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [useManual, setUseManual] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchRequests();
      setRequests(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      if (mode === "refresh") setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => { void load("initial"); }, [load]);

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Debounced customer search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQ || searchQ.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      const hits = await searchCustomers(searchQ);
      setSearchResults(hits);
      setShowDropdown(true);
      setSearchLoading(false);
    }, 300);
  }, [searchQ]);

  const selectCustomer = useCallback((c: CustomerHit) => {
    setSelectedCustomer(c);
    setSearchQ(c.name);
    setShowDropdown(false);
    setUseManual(false);
  }, []);

  const clearCustomer = useCallback(() => {
    setSelectedCustomer(null);
    setSearchQ("");
    setShowDropdown(false);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer && !useManual) {
      setNotice({ tone: "error", msg: "Please search and select a customer first, or use manual entry." });
      return;
    }
    if (useManual && (!manualName.trim() || !manualPhone.trim())) {
      setNotice({ tone: "error", msg: "Please enter the customer name and phone number." });
      return;
    }
    setSubmitting(true);
    setNotice(null);
    try {
      await submitRequest({
        customer_id: selectedCustomer?.id ?? null,
        customer_name: useManual ? manualName.trim() : undefined,
        customer_phone: useManual ? manualPhone.trim() : undefined,
        request_type: reqType,
        notes: notes.trim(),
      });
      setNotice({ tone: "success", msg: "Request submitted! Admin will review and take action soon." });
      setSelectedCustomer(null); setSearchQ(""); setNotes(""); setManualName(""); setManualPhone(""); setUseManual(false);
      setShowForm(false);
      void load("refresh");
    } catch (err) {
      setNotice({ tone: "error", msg: err instanceof Error ? err.message : "Could not submit. Try again." });
    } finally {
      setSubmitting(false);
    }
  }, [selectedCustomer, useManual, manualName, manualPhone, reqType, notes, load]);

  const pendingCount = requests.filter((r) => r.status === "PENDING" || r.status === "IN_PROGRESS").length;
  const approvedCount = requests.filter((r) => r.status === "APPROVED").length;

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-5 sm:px-4 sm:py-6 lg:px-6 lg:py-8">

      {/* Header */}
      <div className="mb-6">
        <Link href="/partner" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          ← Back to Home
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Partner Portal</p>
            <h1 className="text-2xl font-bold text-foreground">KYC &amp; Login Requests</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Help your customers get KYC done or get a login account
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load("refresh")}
            disabled={refreshing}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-muted disabled:opacity-50"
            aria-label="Refresh"
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Info box */}
      <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm dark:border-blue-900 dark:bg-blue-950/20">
        <p className="font-semibold text-blue-800 dark:text-blue-300 mb-1">What can you do here?</p>
        <ul className="space-y-1 text-blue-800 dark:text-blue-300 text-sm">
          <li>• <strong>KYC Verification</strong> — Customer has not done KYC. Ask admin to verify them.</li>
          <li>• <strong>Login ID Setup</strong> — Customer has no app login. Ask admin to create one.</li>
          <li>• <strong>Upload Documents</strong> — Customer gave you their documents. Admin will upload for them.</li>
        </ul>
      </div>

      {/* KPI row */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          { label: "Pending", value: pendingCount, icon: Clock, color: "text-amber-600" },
          { label: "Approved", value: approvedCount, icon: FileCheck, color: "text-green-600" },
          { label: "Total Submitted", value: requests.length, icon: ShieldCheck, color: "text-blue-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card p-3 shadow-sm text-center">
            <Icon className={`size-5 ${color}`} />
            <div className="text-xl font-extrabold leading-none text-foreground">{value}</div>
            <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      {notice ? (
        <div className="mb-4"><Nt tone={notice.tone}>{notice.msg}</Nt></div>
      ) : null}

      {/* New request button / form */}
      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mb-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground transition hover:bg-primary/90 active:scale-[0.98]"
        >
          <Send className="size-5" />
          Submit a New Request
        </button>
      ) : (
        <div className="mb-6 rounded-3xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
              <ShieldCheck className="size-4 text-primary" />
            </div>
            <h2 className="text-base font-bold text-foreground">New KYC / Login Request</h2>
            <button type="button" onClick={() => { setShowForm(false); setNotice(null); }} className="ml-auto text-sm font-medium text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 p-5">

            {/* Step 1: Select customer */}
            <div>
              <p className="mb-2 text-sm font-bold text-foreground">
                Step 1 — Search your customer
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                Type the customer&apos;s name or phone number. We will search from your customers.
              </p>

              {!useManual ? (
                <div ref={searchRef} className="relative">
                  {selectedCustomer ? (
                    <div className="flex items-center gap-3 rounded-2xl border-2 border-primary bg-primary/5 px-4 py-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        <User className="size-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-foreground">{selectedCustomer.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">{selectedCustomer.phone}</span>
                          <KycBadge status={selectedCustomer.kyc_status} />
                        </div>
                      </div>
                      <button type="button" onClick={clearCustomer} className="shrink-0 text-muted-foreground hover:text-foreground">
                        <X className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <input
                          type="text"
                          value={searchQ}
                          onChange={(e) => setSearchQ(e.target.value)}
                          onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                          placeholder="Type customer name or phone…"
                          className="h-12 w-full rounded-2xl border border-border bg-background pl-11 pr-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                          autoComplete="off"
                        />
                        {searchLoading ? (
                          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
                        ) : null}
                      </div>

                      {showDropdown && searchResults.length > 0 ? (
                        <div className="absolute z-50 mt-1 w-full rounded-2xl border border-border bg-card shadow-lg">
                          {searchResults.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => selectCustomer(c)}
                              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted first:rounded-t-2xl last:rounded-b-2xl"
                            >
                              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                                <User className="size-3.5 text-muted-foreground" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-semibold text-foreground">{c.name}</div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-xs text-muted-foreground">{c.phone}</span>
                                  <KycBadge status={c.kyc_status} />
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : showDropdown && searchQ.length >= 2 && !searchLoading ? (
                        <div className="absolute z-50 mt-1 w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-lg">
                          No customers found for &quot;{searchQ}&quot;
                        </div>
                      ) : null}
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => { setUseManual(true); clearCustomer(); }}
                    className="mt-2 text-xs font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    Customer not in list? Enter details manually →
                  </button>
                </div>
              ) : (
                <div className="space-y-3 rounded-2xl border border-dashed border-border bg-muted/30 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Manual Entry</p>
                    <button type="button" onClick={() => setUseManual(false)} className="text-xs font-semibold text-primary hover:underline">
                      Search instead
                    </button>
                  </div>
                  <input
                    type="text"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="Customer full name"
                    className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <input
                    type="tel"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                    placeholder="Customer phone number"
                    className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              )}
            </div>

            {/* Step 2: Request type */}
            <div>
              <p className="mb-3 text-sm font-bold text-foreground">Step 2 — What do you need?</p>
              <div className="space-y-2">
                {REQUEST_TYPES.map((rt) => (
                  <button
                    key={rt.value}
                    type="button"
                    onClick={() => setReqType(rt.value)}
                    className={`flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left transition ${
                      reqType === rt.value ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/30"
                    }`}
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">{rt.icon}</div>
                    <div>
                      <div className="text-sm font-bold text-foreground">{rt.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{rt.desc}</div>
                    </div>
                    {reqType === rt.value ? (
                      <CheckCircle2 className="ml-auto size-5 shrink-0 text-primary" />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 3: Notes */}
            <div>
              <p className="mb-2 text-sm font-bold text-foreground">
                Step 3 — Any extra details? <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any extra info for admin — document type, address, subscription number, etc."
                rows={3}
                className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground transition hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {submitting ? "Submitting…" : "Submit Request"}
            </button>
          </form>
        </div>
      )}

      {/* Request list */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-foreground">My Submitted Requests</h2>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading requests…
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-8 text-center dark:border-red-900 dark:bg-red-950/20">
            <TriangleAlert className="size-8 text-red-400" />
            <p className="text-sm font-medium text-red-700 dark:text-red-300">{loadError}</p>
            <button onClick={() => void load("refresh")} className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">
              Try again
            </button>
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-4 py-12 text-center">
            <ShieldCheck className="size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No requests yet. Use the button above to submit one.</p>
          </div>
        ) : (
          requests.map((req) => (
            <div key={req.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                  req.request_type === "KYC_UPGRADE" ? "bg-blue-100 dark:bg-blue-950/30" :
                  req.request_type === "LOGIN_ID_SETUP" ? "bg-purple-100 dark:bg-purple-950/30" :
                  "bg-green-100 dark:bg-green-950/30"
                }`}>
                  {req.request_type === "KYC_UPGRADE" ? <ShieldCheck className="size-4 text-blue-600" /> :
                   req.request_type === "LOGIN_ID_SETUP" ? <UserPlus className="size-4 text-purple-600" /> :
                   <FileCheck className="size-4 text-green-600" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {REQUEST_TYPES.find((t) => t.value === req.request_type)?.label ?? req.request_type}
                    </span>
                    <StatusBadge status={req.status} />
                  </div>
                  <p className="mt-1 font-semibold text-foreground">{req.customer_name || "—"}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">{req.customer_phone}</span>
                    {req.customer_kyc_status ? <KycBadge status={req.customer_kyc_status} /> : null}
                    <span className="text-xs text-muted-foreground">· {fmtDate(req.created_at)}</span>
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground mt-1" />
              </div>

              {req.notes ? (
                <p className="mt-2 text-xs text-muted-foreground pl-12 line-clamp-2">Note: {req.notes}</p>
              ) : null}

              {req.admin_remarks ? (
                <div className="mt-3 ml-0 rounded-xl bg-green-50 border border-green-200 px-3 py-2 dark:bg-green-950/20 dark:border-green-900">
                  <p className="text-xs font-semibold text-green-800 dark:text-green-300 mb-0.5">Admin reply:</p>
                  <p className="text-xs text-green-800 dark:text-green-300">{req.admin_remarks}</p>
                </div>
              ) : null}

              {req.status === "MORE_INFO" ? (
                <div className="mt-3 ml-0 rounded-xl bg-blue-50 border border-blue-200 px-3 py-2 dark:bg-blue-950/20 dark:border-blue-900">
                  <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">
                    Admin needs more information. Please check with your admin.
                  </p>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-4">
        <p className="text-xs font-semibold text-muted-foreground mb-1">Need other help?</p>
        <Link href="/partner/service-desk" className="text-sm font-semibold text-primary hover:underline">
          Go to Help &amp; Service Desk →
        </Link>
      </div>
    </div>
  );
}
