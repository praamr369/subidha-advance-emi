"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Send } from "lucide-react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import CustomerPageShell, { CPageCard, CPageSection } from "@/components/layout/CustomerPageShell";
import { ROUTES } from "@/lib/routes";
import {
  commentCustomerSupportTicket,
  getCustomerSupportTicket,
  reopenCustomerSupportTicket,
  type SupportTicketDetail,
} from "@/services/support";

export default function CustomerSupportTicketDetailPage() {
  const params = useParams();
  const rawId = params?.id;
  const id = typeof rawId === "string" ? Number(rawId) : NaN;

  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(id) || id <= 0) { setError("Invalid ticket."); setLoading(false); return; }
    setLoading(true);
    try {
      const t = await getCustomerSupportTicket(id);
      setTicket(t);
      setError(null);
    } catch (e) {
      setTicket(null);
      setError(e instanceof Error ? e.message : "Unable to load ticket.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function onComment(e: FormEvent) {
    e.preventDefault();
    if (!ticket || !comment.trim()) return;
    setBusy(true);
    try {
      const next = await commentCustomerSupportTicket(ticket.id, comment.trim());
      setTicket(next);
      setComment("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment.");
    } finally {
      setBusy(false);
    }
  }

  async function onReopen() {
    if (!ticket) return;
    setBusy(true);
    try {
      const next = await reopenCustomerSupportTicket(ticket.id, "");
      setTicket(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reopen.");
    } finally {
      setBusy(false);
    }
  }

  const canReopen = ticket ? ["RESOLVED", "CLOSED", "REJECTED"].includes(ticket.status) : false;

  return (
    <CustomerPageShell
      title={ticket?.ticket_no || "Support Ticket"}
      subtitle={ticket?.subject || "Loading…"}
      backHref={ROUTES.customer.support}
      backLabel="Support"
    >
      {loading ? <ERPLoadingState label="Loading ticket…" /> : null}
      {!loading && error ? (
        <ERPErrorState title="Ticket unavailable" description={error} onRetry={() => void load()} />
      ) : null}
      {!loading && !error && !ticket ? (
        <ERPEmptyState title="Ticket not found" description="Could not load this support ticket." />
      ) : null}

      {ticket ? (
        <>
          {/* Status strip */}
          <CPageSection>
            <CPageCard>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <ERPStatusBadge status={ticket.status} />
                </div>
                <div className="space-y-1 text-right">
                  <div className="text-xs text-muted-foreground">Priority</div>
                  <ERPStatusBadge status={ticket.priority} label={ticket.priority.replaceAll("_", " ")} hideIcon />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Category</div>
                  <div className="text-xs font-semibold">{ticket.category.replaceAll("_", " ")}</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground">
                Opened {new Date(ticket.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              </div>
            </CPageCard>
          </CPageSection>

          {/* Description */}
          <CPageSection title="Issue">
            <CPageCard>
              <p className="whitespace-pre-wrap text-sm text-foreground">{ticket.description}</p>
              {ticket.resolution_summary ? (
                <div className="mt-4 rounded-xl border border-border bg-emerald-50 dark:bg-emerald-950/20 p-3 text-sm">
                  <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase mb-1">Resolution</div>
                  <p className="whitespace-pre-wrap text-foreground">{ticket.resolution_summary}</p>
                </div>
              ) : null}
            </CPageCard>
          </CPageSection>

          {/* Conversation */}
          <CPageSection title="Conversation">
            {ticket.comments.length === 0 ? (
              <ERPEmptyState title="No replies yet" description="The team will respond here." />
            ) : (
              <div className="space-y-2.5">
                {ticket.comments.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-border bg-card px-4 py-3">
                    <div className="text-xs text-muted-foreground mb-1.5">
                      {c.author?.username || "User"} · {new Date(c.created_at).toLocaleString("en-IN")}
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-foreground">{c.body}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Reply form */}
            <form onSubmit={(e) => void onComment(e)} className="mt-4 space-y-3">
              <textarea
                className="w-full resize-none rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 min-h-[100px]"
                placeholder="Add a reply…"
                value={comment}
                onChange={(ev) => setComment(ev.target.value)}
              />
              <button
                type="submit"
                disabled={busy || !comment.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground transition active:scale-95 disabled:opacity-50"
              >
                <Send className="size-4" />
                {busy ? "Sending…" : "Send Reply"}
              </button>
            </form>
          </CPageSection>

          {/* Reopen */}
          {canReopen ? (
            <CPageSection>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onReopen()}
                className="w-full rounded-2xl border border-border bg-background py-3 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
              >
                {busy ? "Processing…" : "Reopen Ticket"}
              </button>
            </CPageSection>
          ) : null}
        </>
      ) : null}
    </CustomerPageShell>
  );
}
