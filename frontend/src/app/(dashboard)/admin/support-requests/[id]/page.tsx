"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { apiFetch } from "@/lib/api";
import {
  getAdminSupportRequest,
  resolveAdminSupportRequest,
  updateAdminSupportRequestAssignee,
  updateAdminSupportRequestNotes,
  updateAdminSupportRequestStatus,
  type AdminSupportRequest,
  type AdminSupportRequestStatus,
} from "@/services/admin-support-requests";
import {
  listInternalUsers,
  type InternalUserRecord,
} from "@/services/internal-users";

type AuditEntry = {
  id: number;
  action_type: string;
  performed_by?: number | null;
  performed_by_username?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string | null;
};

type AuditTimelineResponse = {
  count: number;
  results: AuditEntry[];
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    const raw = error.message.trim();
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.detail === "string" && parsed.detail.trim()) {
        return parsed.detail;
      }
      const firstValue = Object.values(parsed)[0];
      if (Array.isArray(firstValue) && firstValue.length > 0) {
        return String(firstValue[0]);
      }
      if (typeof firstValue === "string") {
        return firstValue;
      }
      return raw;
    } catch {
      return raw;
    }
  }
  return "Unable to load support request detail.";
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN");
}

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function statusTone(status?: string | null): string {
  switch ((status || "").toUpperCase()) {
    case "SUBMITTED":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "UNDER_REVIEW":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "CLOSED":
      return "border-slate-200 bg-slate-100 text-slate-700";
    default:
      return "border-border bg-muted text-foreground";
  }
}

function summarizeAuditEntry(entry: AuditEntry): string {
  const metadata = entry.metadata || {};

  if (entry.action_type === "SUPPORT_REQUEST_CREATED") {
    return "Customer submitted the support request.";
  }

  if (entry.action_type === "SUPPORT_REQUEST_STATUS_UPDATED") {
    return `Status changed from ${String(metadata.old_status || "—")} to ${String(
      metadata.new_status || "—"
    )}.`;
  }

  if (entry.action_type === "SUPPORT_REQUEST_ASSIGNED") {
    const previous = String(metadata.previous_assignee_username || "unassigned");
    const next = String(metadata.next_assignee_username || "unassigned");
    return `Owner changed from ${previous} to ${next}.`;
  }

  if (entry.action_type === "SUPPORT_REQUEST_NOTE_UPDATED") {
    return `${String(metadata.mode || "append")} note update: ${String(
      metadata.note_excerpt || ""
    )}`.trim();
  }

  if (entry.action_type === "SUPPORT_REQUEST_RESOLUTION_RECORDED") {
    return `Resolution summary recorded: ${String(
      metadata.resolution_summary || ""
    )}`.trim();
  }

  if (entry.action_type === "SUPPORT_REQUEST_RESOLVED") {
    return "Support request was resolved and closed.";
  }

  return "Support request activity recorded.";
}

function DetailValue({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm text-foreground">{value}</div>
    </div>
  );
}

export default function AdminSupportRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const supportRequestId = Number(params?.id || 0);

  const [supportRequest, setSupportRequest] = useState<AdminSupportRequest | null>(null);
  const [timeline, setTimeline] = useState<AuditEntry[]>([]);
  const [assignees, setAssignees] = useState<InternalUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [statusInput, setStatusInput] =
    useState<AdminSupportRequestStatus>("SUBMITTED");
  const [assigneeInput, setAssigneeInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [noteMode, setNoteMode] = useState<"append" | "replace">("append");
  const [resolutionInput, setResolutionInput] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const backHref = useMemo(() => {
    const query = searchParams.toString();
    return query ? `/admin/support-requests?${query}` : "/admin/support-requests";
  }, [searchParams]);

  const statusOptions = useMemo(() => {
    if (supportRequest?.status === "CLOSED") {
      return [
        { value: "CLOSED" as const, label: "Closed" },
        { value: "UNDER_REVIEW" as const, label: "Under Review" },
      ];
    }

    return [
      { value: "SUBMITTED" as const, label: "Submitted" },
      { value: "UNDER_REVIEW" as const, label: "Under Review" },
    ];
  }, [supportRequest?.status]);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!supportRequestId) {
        setError("Support request id is invalid.");
        setLoading(false);
        return;
      }

      if (mode === "initial") setLoading(true);

      try {
        const [requestPayload, assigneePayload, timelinePayload] = await Promise.all([
          getAdminSupportRequest(supportRequestId),
          listInternalUsers({ is_active: "true" }),
          apiFetch<AuditTimelineResponse>(
            `/admin/audit-logs/timeline/CustomerSupportRequest/${supportRequestId}/`
          ),
        ]);

        setSupportRequest(requestPayload);
        setStatusInput(requestPayload.status);
        setAssigneeInput(
          typeof requestPayload.assigned_to_id === "number"
            ? String(requestPayload.assigned_to_id)
            : ""
        );
        setResolutionInput(requestPayload.resolution_summary || "");
        setAssignees(assigneePayload.results);
        setTimeline(timelinePayload.results || []);
        setError(null);
      } catch (err) {
        setSupportRequest(null);
        setTimeline([]);
        setError(toErrorMessage(err));
      } finally {
        if (mode === "initial") setLoading(false);
      }
    },
    [supportRequestId]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  async function handleStatusUpdate() {
    if (!supportRequest) return;

    try {
      setActionLoading("status");
      setMessage(null);
      const updated = await updateAdminSupportRequestStatus(
        supportRequest.id,
        statusInput
      );
      setSupportRequest(updated);
      setMessage(`Support request status updated to ${updated.status}.`);
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleAssigneeUpdate() {
    if (!supportRequest) return;

    try {
      setActionLoading("assignee");
      setMessage(null);
      const updated = await updateAdminSupportRequestAssignee(
        supportRequest.id,
        assigneeInput ? Number(assigneeInput) : null
      );
      setSupportRequest(updated);
      setMessage("Support request owner updated.");
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleNoteUpdate() {
    if (!supportRequest) return;

    try {
      setActionLoading("notes");
      setMessage(null);
      const updated = await updateAdminSupportRequestNotes(supportRequest.id, {
        note: noteInput,
        mode: noteMode,
      });
      setSupportRequest(updated);
      setNoteInput("");
      setMessage(
        noteMode === "append"
          ? "Support request note appended."
          : "Support request note replaced."
      );
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResolve() {
    if (!supportRequest) return;

    try {
      setActionLoading("resolve");
      setMessage(null);
      const updated = await resolveAdminSupportRequest(supportRequest.id, {
        resolution_summary: resolutionInput,
      });
      setSupportRequest(updated);
      setStatusInput(updated.status);
      setResolutionInput(updated.resolution_summary || "");
      setMessage("Support request resolved with explicit closure metadata.");
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <ERPPageShell
      title={supportRequest ? `Support Request #${supportRequest.id}` : "Support Request Detail"}
      subtitle="Review the customer-submitted issue, update triage ownership and status, and follow the linked records without leaving the support workflow."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Support Requests", href: backHref },
        { label: supportRequest ? `Request #${supportRequest.id}` : "Detail" },
      ]}
      actions={[
        { href: backHref, label: "Back to Inbox", variant: "secondary" },
        ...(typeof supportRequest?.customer === "number"
          ? [
              {
                href: `/admin/customers/${supportRequest.customer}`,
                label: "Customer",
                variant: "secondary" as const,
              },
            ]
          : []),
        ...(typeof supportRequest?.payment === "number"
          ? [
              {
                href: `/admin/payments/${supportRequest.payment}`,
                label: "Payment",
                variant: "secondary" as const,
              },
            ]
          : []),
        ...(typeof supportRequest?.subscription === "number"
          ? [
              {
                href: `/admin/subscriptions/${supportRequest.subscription}`,
                label: "Subscription",
                variant: "primary" as const,
              },
            ]
          : []),
      ]}
      stats={[
        {
          label: "Status",
          value: supportRequest?.status || "—",
          tone:
            supportRequest?.status === "CLOSED"
              ? "danger"
              : supportRequest?.status === "UNDER_REVIEW"
                ? "info"
                : "warning",
        },
        {
          label: "Owner",
          value:
            supportRequest?.assigned_to_full_name ||
            supportRequest?.assigned_to_username ||
            "Unassigned",
        },
        {
          label: "Submitted",
          value: formatDateTime(supportRequest?.created_at),
        },
        {
          label: "Timeline Events",
          value: String(timeline.length),
        },
      ]}
      statusBadge={{ label: "Support Triage", tone: "info" }}
      headerMode="erp"
    >
      <div className="space-y-6">
        {loading ? <ERPLoadingState label="Loading support request detail..." /> : null}

        {!loading && error && !supportRequest ? (
          <ERPErrorState
            title="Unable to load support request detail"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !supportRequest ? (
          <ERPEmptyState
            title="Support request not found"
            description="The requested support request could not be loaded."
          />
        ) : null}

        {!loading && supportRequest ? (
          <>
            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {message ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {message}
              </div>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-2">
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-base font-semibold text-foreground">Submitted Request Context</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Customer-facing issue details captured from the self-service support flow.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <DetailValue label="Request Reference" value={`Request #${supportRequest.id}`} />
                  <DetailValue label="Submitted At" value={formatDateTime(supportRequest.created_at)} />
                  <DetailValue label="Customer" value={supportRequest.customer_name || "—"} />
                  <DetailValue label="Phone" value={supportRequest.customer_phone || "—"} />
                  <DetailValue label="Category" value={supportRequest.category.replaceAll("_", " ")} />
                  <DetailValue label="Updated At" value={formatDateTime(supportRequest.updated_at)} />
                  <DetailValue
                    label="Payment Reference"
                    value={
                      supportRequest.payment_reference_no ||
                      (supportRequest.payment ? `Payment #${supportRequest.payment}` : "—")
                    }
                  />
                  <DetailValue
                    label="Subscription"
                    value={
                      supportRequest.subscription_number ||
                      (supportRequest.subscription
                        ? `SUB-${supportRequest.subscription}`
                        : "—")
                    }
                  />
                  <DetailValue
                    label="Payment Amount"
                    value={
                      supportRequest.payment_amount
                        ? money(supportRequest.payment_amount)
                        : "—"
                    }
                  />
                  <DetailValue
                    label="Payment Method"
                    value={supportRequest.payment_method || "—"}
                  />
                  <DetailValue
                    label="Payment Date"
                    value={formatDateTime(supportRequest.payment_date)}
                  />
                </div>

                <div className="mt-4 rounded-xl border border-border bg-background p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Customer Message
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                    {supportRequest.message || "No message submitted."}
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-base font-semibold text-foreground">Triage Workflow State</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Assign ownership and move the request through the narrow support workflow.
                </p>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <DetailValue
                    label="Current Status"
                    value={
                      <span
                        className={[
                          "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                          statusTone(supportRequest.status),
                        ].join(" ")}
                      >
                        {supportRequest.status.replace("_", " ")}
                      </span>
                    }
                  />
                  <DetailValue
                    label="Current Owner"
                    value={
                      supportRequest.assigned_to_full_name ||
                      supportRequest.assigned_to_username ||
                      "Unassigned"
                    }
                  />
                  <DetailValue
                    label="Assigned At"
                    value={formatDateTime(supportRequest.assigned_at)}
                  />
                  <DetailValue
                    label="Resolved By"
                    value={
                      supportRequest.resolved_by_full_name ||
                      supportRequest.resolved_by_username ||
                      "Not resolved yet"
                    }
                  />
                  <DetailValue
                    label="Resolved At"
                    value={formatDateTime(supportRequest.resolved_at)}
                  />
                  <DetailValue
                    label="Linked Records"
                    value={
                      [supportRequest.payment ? "Payment" : null, supportRequest.subscription ? "Subscription" : null]
                        .filter(Boolean)
                        .join(" · ") || "General support request"
                    }
                  />
                  <DetailValue
                    label="Resolution Summary"
                    value={supportRequest.resolution_summary || "No resolution recorded yet."}
                  />
                </div>

                <div className="mt-5 grid gap-4">
                  <div className="rounded-xl border border-border bg-background p-4">
                    <div className="text-sm font-semibold text-foreground">Update Status</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Use the dedicated resolution action below to close the request with a required summary.
                    </p>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                      <select
                        value={statusInput}
                        onChange={(event) =>
                          setStatusInput(event.target.value as AdminSupportRequestStatus)
                        }
                        className="h-10 flex-1 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                      >
                        {statusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleStatusUpdate()}
                        disabled={
                          actionLoading === "status" ||
                          statusInput === supportRequest.status ||
                          statusInput === "CLOSED"
                        }
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {actionLoading === "status" ? "Saving..." : "Save Status"}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-background p-4">
                    <div className="text-sm font-semibold text-foreground">Assign Owner</div>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                      <select
                        value={assigneeInput}
                        onChange={(event) => setAssigneeInput(event.target.value)}
                        className="h-10 flex-1 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                      >
                        <option value="">Unassigned</option>
                        {assignees.map((user) => (
                          <option key={user.id} value={String(user.id)}>
                            {user.full_name || user.username} ({user.role})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleAssigneeUpdate()}
                        disabled={actionLoading === "assignee"}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {actionLoading === "assignee" ? "Saving..." : "Save Owner"}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-base font-semibold text-foreground">Internal Notes</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Keep working notes inside the request. Changes are explicit and auditable.
                </p>

                <div className="mt-4 rounded-xl border border-border bg-background p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Current Internal Notes
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                    {supportRequest.internal_notes || "No internal note recorded yet."}
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  <textarea
                    rows={6}
                    value={noteInput}
                    onChange={(event) => setNoteInput(event.target.value)}
                    placeholder="Capture the call outcome, store follow-up, or next action."
                    className="rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring"
                  />
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <select
                      value={noteMode}
                      onChange={(event) =>
                        setNoteMode(event.target.value as "append" | "replace")
                      }
                      className="h-10 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                    >
                      <option value="append">Append</option>
                      <option value="replace">Replace</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleNoteUpdate()}
                      disabled={actionLoading === "notes" || !noteInput.trim()}
                      className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoading === "notes" ? "Saving..." : "Save Note"}
                    </button>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-base font-semibold text-foreground">Resolution</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Close the request with an explicit resolution summary. This records closure metadata and audit events together.
                </p>

                <div className="mt-4 rounded-xl border border-border bg-background p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Current Resolution Summary
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                    {supportRequest.resolution_summary || "No resolution recorded yet."}
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  <textarea
                    rows={6}
                    value={resolutionInput}
                    onChange={(event) => setResolutionInput(event.target.value)}
                    placeholder="Explain how the issue was resolved before closing the request."
                    className="rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring"
                  />
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void handleResolve()}
                      disabled={
                        actionLoading === "resolve" ||
                        supportRequest.status === "CLOSED" ||
                        !resolutionInput.trim()
                      }
                      className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoading === "resolve" ? "Saving..." : "Resolve and Close"}
                    </button>
                    {supportRequest.status === "CLOSED" ? (
                      <div className="inline-flex h-10 items-center rounded-xl border border-border bg-background px-4 text-sm text-muted-foreground">
                        Reopen through status update before recording a new resolution.
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-base font-semibold text-foreground">Audit Timeline</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Request creation, triage changes, and resolution history are tracked here.
                </p>

                <div className="mt-4 space-y-3">
                  {timeline.length === 0 ? (
                    <ERPEmptyState
                      title="No audit entries yet"
                      description="Support request activity will appear here as triage actions are taken."
                    />
                  ) : (
                    timeline.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-xl border border-border bg-background p-4"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-sm font-medium text-foreground">
                            {entry.action_type.replaceAll("_", " ")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDateTime(entry.created_at)}
                          </div>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {summarizeAuditEntry(entry)}
                        </p>
                        <div className="mt-2 text-xs text-muted-foreground">
                          By: {entry.performed_by_username || "System"}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
