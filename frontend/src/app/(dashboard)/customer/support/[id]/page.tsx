"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import ActionButton from "@/components/ui/ActionButton";
import { DetailItem } from "@/components/ui/workspace";
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
    if (!Number.isFinite(id) || id <= 0) {
      setError("Invalid ticket.");
      setLoading(false);
      return;
    }
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

  useEffect(() => {
    void load();
  }, [load]);

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

  if (loading) {
    return (
      <ERPPageShell
        title="Support ticket"
        breadcrumbs={[{ label: "Support", href: ROUTES.customer.support }]}
        headerMode="erp"
      >
        <ERPLoadingState label="Loading ticket…" />
      </ERPPageShell>
    );
  }

  if (error || !ticket) {
    return (
      <ERPPageShell
        title="Support ticket"
        breadcrumbs={[{ label: "Support", href: ROUTES.customer.support }]}
        headerMode="erp"
      >
        <ERPErrorState title="Ticket unavailable" description={error || "Not found."} onRetry={() => void load()} />
      </ERPPageShell>
    );
  }

  const canReopen = ["RESOLVED", "CLOSED", "REJECTED"].includes(ticket.status);

  return (
    <ERPPageShell
      eyebrow="Support ticket"
      title={ticket.ticket_no}
      subtitle={ticket.subject}
      breadcrumbs={[
        { label: "Customer", href: ROUTES.customer.dashboard },
        { label: "Support", href: ROUTES.customer.support },
        { label: ticket.ticket_no },
      ]}
      actions={[{ href: ROUTES.customer.support, label: "All tickets", variant: "secondary" }]}
      statusBadge={{ label: ticket.status.replaceAll("_", " "), tone: "info" }}
      headerMode="erp"
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <ERPSectionShell title="Details">
            <p className="whitespace-pre-wrap text-sm text-foreground">{ticket.description}</p>
            {ticket.resolution_summary ? (
              <div className="mt-4 rounded-lg border border-border bg-[var(--surface-muted)]/40 p-3 text-sm">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Resolution</div>
                <p className="mt-1 whitespace-pre-wrap">{ticket.resolution_summary}</p>
              </div>
            ) : null}
          </ERPSectionShell>
          <ERPSectionShell title="Conversation">
            {ticket.comments.length === 0 ? (
              <ERPEmptyState title="No replies yet" description="The team will respond here." />
            ) : (
              <ul className="space-y-3">
                {ticket.comments.map((c) => (
                  <li key={c.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                    <div className="text-xs text-muted-foreground">
                      {c.author?.username || "User"} · {new Date(c.created_at).toLocaleString("en-IN")}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={onComment} className="mt-4 space-y-2">
              <textarea
                className="min-h-[100px] w-full rounded-lg border border-border bg-[var(--surface-card)] px-3 py-3 text-sm"
                placeholder="Add a message"
                value={comment}
                onChange={(ev) => setComment(ev.target.value)}
              />
              <ActionButton
                type="submit"
                className="min-h-11 w-full sm:w-auto"
                disabled={busy || !comment.trim()}
              >
                Send reply
              </ActionButton>
            </form>
          </ERPSectionShell>
          <ERPSectionShell title="Timeline (summary)">
            {ticket.timeline.length === 0 ? (
              <ERPEmptyState
                title="No timeline entries yet"
                description="Updates from the shop will appear here when the ticket moves forward."
              />
            ) : (
              <ul className="space-y-2 text-xs text-muted-foreground">
                {ticket.timeline.slice(-12).map((row, idx) => (
                  <li key={`${String(row.at)}-${idx}`}>
                    {String(row.event_type ?? row.kind ?? "")} · {String(row.at ?? "")}
                  </li>
                ))}
              </ul>
            )}
          </ERPSectionShell>
        </div>
        <div className="min-w-0 space-y-4">
          <div className="rounded-xl border border-border bg-[var(--surface-card)] p-4 text-sm">
            <DetailItem label="Status" value={<ERPStatusBadge status={ticket.status} />} />
            <DetailItem
              label="Priority"
              value={
                <ERPStatusBadge
                  status={ticket.priority}
                  label={ticket.priority.replaceAll("_", " ")}
                  hideIcon
                />
              }
            />
            <DetailItem label="Category" value={ticket.category.replaceAll("_", " ")} />
            <DetailItem label="Opened" value={new Date(ticket.created_at).toLocaleString("en-IN")} />
          </div>
          {canReopen ? (
            <ActionButton
              variant="outline"
              className="min-h-11 w-full sm:w-auto"
              disabled={busy}
              onClick={() => void onReopen()}
            >
              Reopen ticket
            </ActionButton>
          ) : null}
        </div>
      </div>
    </ERPPageShell>
  );
}
