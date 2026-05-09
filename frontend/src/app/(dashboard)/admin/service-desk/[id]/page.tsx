"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  assignAdminSupportTicket,
  closeAdminSupportTicket,
  commentAdminSupportTicket,
  getAdminSupportTicket,
  internalNoteAdminSupportTicket,
  linkAdminSupportTicket,
  patchAdminSupportTicket,
  rejectAdminSupportTicket,
  reopenAdminSupportTicket,
  resolveAdminSupportTicket,
  type SupportTicketDetail,
} from "@/services/support";

export default function AdminServiceDeskTicketDetailPage() {
  const params = useParams();
  const raw = params?.id;
  const id = typeof raw === "string" ? Number(raw) : NaN;

  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [assigneeId, setAssigneeId] = useState("");
  const [linkType, setLinkType] = useState("subscription");
  const [linkObjectId, setLinkObjectId] = useState("");
  const [publicComment, setPublicComment] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [resolution, setResolution] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [closeNote, setCloseNote] = useState("");

  const load = useCallback(async () => {
    if (!Number.isFinite(id) || id <= 0) {
      setError("Invalid ticket id.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const t = await getAdminSupportTicket(id);
      setTicket(t);
      setError(null);
    } catch (e) {
      setTicket(null);
      setError(e instanceof Error ? e.message : "Failed to load ticket.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<SupportTicketDetail>) {
    setBusy(true);
    setError(null);
    try {
      const t = await fn();
      setTicket(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <PortalPage title="Issue ticket" breadcrumbs={[{ label: "Service Desk", href: ROUTES.admin.serviceDesk }]}>
        <LoadingBlock label="Loading…" />
      </PortalPage>
    );
  }

  if (error && !ticket) {
    return (
      <PortalPage title="Issue ticket" breadcrumbs={[{ label: "Service Desk", href: ROUTES.admin.serviceDesk }]}>
        <ErrorState title="Error" description={error} onRetry={() => void load()} />
      </PortalPage>
    );
  }

  if (!ticket) return null;

  return (
    <PortalPage
      eyebrow="Issue management"
      title={ticket.ticket_no}
      subtitle={ticket.subject}
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Service Desk", href: ROUTES.admin.serviceDesk },
        { label: ticket.ticket_no },
      ]}
      actions={[{ href: ROUTES.admin.serviceDesk, label: "Desk home", variant: "secondary" }]}
      statusBadge={{ label: ticket.status, tone: "warning" }}
    >
      {error ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <WorkspaceSection title="Description">
            <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
          </WorkspaceSection>
          <WorkspaceSection title="Public comments">
            <ul className="space-y-2 text-sm">
              {ticket.comments
                .filter((c) => !c.is_internal)
                .map((c) => (
                  <li key={c.id} className="rounded border border-border px-2 py-1">
                    <span className="text-xs text-muted-foreground">{c.created_at}</span>
                    <p className="whitespace-pre-wrap">{c.body}</p>
                  </li>
                ))}
            </ul>
            <form
              className="mt-3 space-y-2"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void run(() => commentAdminSupportTicket(ticket.id, publicComment.trim()));
                setPublicComment("");
              }}
            >
              <textarea
                className="w-full rounded border px-2 py-1 text-sm"
                value={publicComment}
                onChange={(ev) => setPublicComment(ev.target.value)}
                placeholder="Public reply to customer"
              />
              <ActionButton type="submit" disabled={busy || !publicComment.trim()}>
                Post
              </ActionButton>
            </form>
          </WorkspaceSection>
          <WorkspaceSection title="Internal notes">
            <ul className="space-y-2 text-sm">
              {ticket.comments
                .filter((c) => c.is_internal)
                .map((c) => (
                  <li key={c.id} className="rounded border border-dashed border-border px-2 py-1">
                    <span className="text-xs text-muted-foreground">{c.created_at}</span>
                    <p className="whitespace-pre-wrap">{c.body}</p>
                  </li>
                ))}
            </ul>
            <form
              className="mt-3 space-y-2"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void run(() => internalNoteAdminSupportTicket(ticket.id, internalNote.trim()));
                setInternalNote("");
              }}
            >
              <textarea
                className="w-full rounded border px-2 py-1 text-sm"
                value={internalNote}
                onChange={(ev) => setInternalNote(ev.target.value)}
                placeholder="Staff-only"
              />
              <ActionButton type="submit" disabled={busy || !internalNote.trim()}>
                Save internal note
              </ActionButton>
            </form>
          </WorkspaceSection>
          <WorkspaceSection title="Timeline">
            <ul className="max-h-64 space-y-1 overflow-auto text-xs text-muted-foreground">
              {ticket.timeline.map((row, i) => (
                <li key={i}>{JSON.stringify(row)}</li>
              ))}
            </ul>
          </WorkspaceSection>
        </div>

        <div className="space-y-4 text-sm">
          <div className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={ticket.status} />
              <StatusBadge status={ticket.priority} />
            </div>
            {ticket.customer_detail ? (
              <div className="mt-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Customer</div>
                <Link className="text-primary underline" href={`${ROUTES.admin.customers}/${ticket.customer}`}>
                  {ticket.customer_detail.name} · {ticket.customer_detail.phone}
                </Link>
              </div>
            ) : null}
          </div>

          <WorkspaceSection title="Workflow">
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                const st = (e.currentTarget.elements.namedItem("status") as HTMLSelectElement).value;
                void run(() => patchAdminSupportTicket(ticket.id, { status: st }));
              }}
            >
              <select name="status" className="w-full rounded border px-2 py-1" defaultValue={ticket.status}>
                <option value="OPEN">OPEN</option>
                <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
                <option value="IN_REVIEW">IN_REVIEW</option>
                <option value="WAITING_FOR_CUSTOMER">WAITING_FOR_CUSTOMER</option>
                <option value="WAITING_FOR_INTERNAL_ACTION">WAITING_FOR_INTERNAL_ACTION</option>
                <option value="REOPENED">REOPENED</option>
              </select>
              <ActionButton type="submit" disabled={busy} variant="outline">
                Update status
              </ActionButton>
            </form>
          </WorkspaceSection>

          <WorkspaceSection title="Assign">
            <div className="flex gap-2">
              <input
                className="w-full rounded border px-2 py-1"
                placeholder="Internal user id (or empty to clear)"
                value={assigneeId}
                onChange={(ev) => setAssigneeId(ev.target.value)}
              />
              <ActionButton
                type="button"
                disabled={busy}
                onClick={() => {
                  const raw = assigneeId.trim();
                  const parsed = raw === "" ? null : Number(raw);
                  if (parsed !== null && !Number.isFinite(parsed)) {
                    setError("Assignee id must be numeric.");
                    return;
                  }
                  void run(() => assignAdminSupportTicket(ticket.id, parsed));
                }}
              >
                Assign
              </ActionButton>
            </div>
            <p className="text-xs text-muted-foreground">Send null assignee_id to unassign (clear field).</p>
          </WorkspaceSection>

          <WorkspaceSection title="Link object">
            <div className="space-y-2">
              <select
                className="w-full rounded border px-2 py-1"
                value={linkType}
                onChange={(ev) => setLinkType(ev.target.value)}
              >
                <option value="subscription">subscription</option>
                <option value="payment">payment</option>
                <option value="emi">emi</option>
                <option value="direct_sale">direct_sale</option>
                <option value="delivery">delivery</option>
                <option value="billing_invoice">billing_invoice</option>
              </select>
              <input
                className="w-full rounded border px-2 py-1"
                placeholder="Object id"
                value={linkObjectId}
                onChange={(ev) => setLinkObjectId(ev.target.value)}
              />
              <ActionButton
                type="button"
                disabled={busy}
                onClick={() => {
                  const oid = Number(linkObjectId);
                  if (!Number.isFinite(oid) || oid <= 0) {
                    setError("Object id must be a positive number.");
                    return;
                  }
                  void run(() => linkAdminSupportTicket(ticket.id, linkType, oid));
                }}
              >
                Add link
              </ActionButton>
            </div>
          </WorkspaceSection>

          <WorkspaceSection title="Resolve / reject / close">
            <textarea
              className="w-full rounded border px-2 py-1"
              placeholder="Resolution summary"
              value={resolution}
              onChange={(ev) => setResolution(ev.target.value)}
            />
            <ActionButton
              type="button"
              disabled={busy}
              onClick={() => void run(() => resolveAdminSupportTicket(ticket.id, resolution.trim()))}
            >
              Resolve
            </ActionButton>
            <textarea
              className="mt-3 w-full rounded border px-2 py-1"
              placeholder="Reject reason"
              value={rejectReason}
              onChange={(ev) => setRejectReason(ev.target.value)}
            />
            <ActionButton
              type="button"
              className="mt-1"
              disabled={busy}
              variant="outline"
              onClick={() => void run(() => rejectAdminSupportTicket(ticket.id, rejectReason.trim()))}
            >
              Reject
            </ActionButton>
            <textarea
              className="mt-3 w-full rounded border px-2 py-1"
              placeholder="Close note (optional)"
              value={closeNote}
              onChange={(ev) => setCloseNote(ev.target.value)}
            />
            <ActionButton
              type="button"
              className="mt-1"
              disabled={busy}
              variant="secondary"
              onClick={() => void run(() => closeAdminSupportTicket(ticket.id, closeNote.trim()))}
            >
              Close
            </ActionButton>
            <ActionButton
              type="button"
              className="mt-3"
              disabled={busy}
              variant="outline"
              onClick={() => void run(() => reopenAdminSupportTicket(ticket.id, "Reopened from desk"))}
            >
              Reopen
            </ActionButton>
          </WorkspaceSection>

          <WorkspaceSection title="Operational context (read-only)">
            <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(ticket.operational_context, null, 2)}
            </pre>
          </WorkspaceSection>
        </div>
      </div>
    </PortalPage>
  );
}
