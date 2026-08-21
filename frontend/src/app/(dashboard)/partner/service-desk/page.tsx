"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  HelpCircle,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

type Ticket = {
  id: number;
  subject: string;
  category: string;
  priority: string;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  description: string;
  response?: string;
};

type NoticeTone = "success" | "error" | "info";

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    OPEN: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
    IN_PROGRESS: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    RESOLVED: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300",
    CLOSED: "bg-muted text-muted-foreground",
  };
  const labels: Record<string, string> = {
    OPEN: "Open",
    IN_PROGRESS: "In Progress",
    RESOLVED: "Resolved",
    CLOSED: "Closed",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${map[status] ?? map.OPEN}`}>
      {labels[status] ?? status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    HIGH: "text-red-600 dark:text-red-400",
    MEDIUM: "text-amber-600 dark:text-amber-400",
    LOW: "text-muted-foreground",
  };
  return (
    <span className={`text-xs font-semibold uppercase tracking-wide ${map[priority.toUpperCase()] ?? map.LOW}`}>
      {priority}
    </span>
  );
}

function Notice({ tone, children }: { tone: NoticeTone; children: React.ReactNode }) {
  const styles: Record<NoticeTone, string> = {
    success: "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300",
    error: "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300",
    info: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300",
  };
  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? AlertCircle : HelpCircle;
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-medium ${styles[tone]}`}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

async function fetchTickets(): Promise<Ticket[]> {
  const data = await apiFetch<{ results?: unknown[]; data?: unknown[] } | unknown[]>("/api/v1/partner/support/tickets/");
  const list = Array.isArray(data)
    ? data
    : (Array.isArray((data as { results?: unknown[] }).results)
        ? (data as { results: unknown[] }).results
        : (Array.isArray((data as { data?: unknown[] }).data) ? (data as { data: unknown[] }).data : []));
  return list as Ticket[];
}

async function submitTicket(payload: {
  subject: string;
  category: string;
  priority: string;
  description: string;
}) {
  return apiFetch("/api/v1/partner/support/tickets/", {
    method: "POST",
    body: payload,
  });
}

const CATEGORIES = [
  { value: "PAYMENT", label: "Payment Issue" },
  { value: "COMMISSION", label: "Commission Query" },
  { value: "CUSTOMER", label: "Customer Problem" },
  { value: "SUBSCRIPTION", label: "Subscription Issue" },
  { value: "KYC", label: "KYC / Documents" },
  { value: "ACCOUNT", label: "My Account" },
  { value: "OTHER", label: "Other" },
];

const PRIORITIES = [
  { value: "HIGH", label: "Urgent — needs fast reply" },
  { value: "MEDIUM", label: "Normal — within a day or two" },
  { value: "LOW", label: "Low — no rush" },
];

export default function PartnerServiceDeskPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // form state
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("OTHER");
  const [priority, setPriority] = useState("MEDIUM");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; msg: string } | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchTickets();
      setTickets(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load tickets.");
    } finally {
      if (mode === "refresh") setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => { void load("initial"); }, [load]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      setNotice({ tone: "error", msg: "Please fill in the subject and description." });
      return;
    }
    setSubmitting(true);
    setNotice(null);
    try {
      await submitTicket({ subject: subject.trim(), category, priority, description: description.trim() });
      setNotice({ tone: "success", msg: "Your request has been sent! Admin will reply soon." });
      setSubject(""); setDescription(""); setCategory("OTHER"); setPriority("MEDIUM");
      setShowForm(false);
      void load("refresh");
    } catch (err) {
      setNotice({ tone: "error", msg: err instanceof Error ? err.message : "Could not submit. Try again." });
    } finally {
      setSubmitting(false);
    }
  }, [subject, category, priority, description, load]);

  const openCount = tickets.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS").length;
  const resolvedCount = tickets.filter((t) => t.status === "RESOLVED" || t.status === "CLOSED").length;

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
            <h1 className="text-2xl font-bold text-foreground">Help & Service Desk</h1>
            <p className="mt-1 text-sm text-muted-foreground">Send a request to admin for any help or problem</p>
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

      {/* KPI row */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: "Open Requests", value: openCount, icon: Clock, color: "text-amber-600" },
          { label: "Resolved", value: resolvedCount, icon: CheckCircle2, color: "text-green-600" },
          { label: "Total Submitted", value: tickets.length, icon: MessageCircle, color: "text-blue-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
              <Icon className={`size-5 ${color}`} />
            </div>
            <div>
              <div className="text-xl font-extrabold leading-none text-foreground">{value}</div>
              <div className="mt-0.5 text-xs font-medium text-muted-foreground">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {notice ? (
        <div className="mb-4">
          <Notice tone={notice.tone}>{notice.msg}</Notice>
        </div>
      ) : null}

      {/* New request button / form */}
      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mb-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground transition hover:bg-primary/90 active:scale-[0.98]"
        >
          <Send className="size-5" />
          Send a New Request
        </button>
      ) : (
        <div className="mb-6 rounded-3xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
              <Send className="size-4 text-primary" />
            </div>
            <h2 className="text-base font-bold text-foreground">New Request</h2>
            <button type="button" onClick={() => setShowForm(false)} className="ml-auto text-sm font-medium text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 p-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-foreground" htmlFor="sd-subject">
                What is this about? <span className="text-red-500">*</span>
              </label>
              <input
                id="sd-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Short subject — e.g. Commission not credited"
                required
                className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-foreground" htmlFor="sd-category">Category</label>
                <select
                  id="sd-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-foreground" htmlFor="sd-priority">How urgent?</label>
                <select
                  id="sd-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-foreground" htmlFor="sd-desc">
                Describe your problem <span className="text-red-500">*</span>
              </label>
              <textarea
                id="sd-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explain what happened, customer name, subscription number if any…"
                required
                rows={4}
                className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground transition hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {submitting ? "Sending…" : "Send Request"}
            </button>
          </form>
        </div>
      )}

      {/* Ticket list */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-foreground">My Requests</h2>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading your requests…
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-8 text-center dark:border-red-900 dark:bg-red-950/20">
            <TriangleAlert className="size-8 text-red-400" />
            <p className="text-sm font-medium text-red-700 dark:text-red-300">{loadError}</p>
            <button onClick={() => void load("refresh")} className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-800 dark:bg-transparent dark:text-red-300">
              Try again
            </button>
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-4 py-12 text-center">
            <MessageCircle className="size-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">No requests yet. Send one above if you need help.</p>
          </div>
        ) : (
          tickets.map((ticket) => (
            <div key={ticket.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground leading-snug">{ticket.subject}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <StatusBadge status={ticket.status} />
                    <PriorityBadge priority={ticket.priority} />
                    <span className="text-xs text-muted-foreground">{fmtDate(ticket.created_at)}</span>
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </div>

              <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{ticket.description}</p>

              {ticket.response ? (
                <div className="mt-3 rounded-xl bg-green-50 border border-green-200 px-3 py-2.5 dark:bg-green-950/20 dark:border-green-900">
                  <p className="text-xs font-semibold text-green-800 dark:text-green-300 mb-1">Admin reply:</p>
                  <p className="text-xs text-green-800 dark:text-green-300">{ticket.response}</p>
                </div>
              ) : null}

              <div className="mt-2 text-xs text-muted-foreground">
                Category: {CATEGORIES.find((c) => c.value === ticket.category)?.label ?? ticket.category}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
