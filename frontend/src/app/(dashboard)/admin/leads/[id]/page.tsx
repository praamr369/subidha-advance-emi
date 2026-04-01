"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { apiFetch } from "@/lib/api";
import {
  completeAdminLeadConversion,
  getAdminLead,
  updateAdminLeadAssignee,
  updateAdminLeadNotes,
  updateAdminLeadStatus,
  type AdminLeadDetail,
  type AdminLeadStatus,
} from "@/services/admin-leads";
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
    } catch {
      return raw;
    }
    return raw;
  }
  return "Unable to load lead detail.";
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN");
}

function parsePositiveInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function statusTone(status?: string | null): string {
  switch ((status || "").toUpperCase()) {
    case "NEW":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "IN_PROGRESS":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "CONTACTED":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "CONVERTED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "CLOSED":
      return "border-slate-200 bg-slate-100 text-slate-700";
    default:
      return "border-border bg-muted text-foreground";
  }
}

function summarizeAuditEntry(entry: AuditEntry): string {
  const metadata = entry.metadata || {};

  if (entry.action_type === "LEAD_CREATED") {
    return "Public lead was created from the live apply flow.";
  }

  if (entry.action_type === "LEAD_STATUS_UPDATED") {
    return `Status changed from ${String(metadata.old_status || "—")} to ${String(
      metadata.new_status || "—"
    )}.`;
  }

  if (entry.action_type === "LEAD_ASSIGNED") {
    const previous = String(metadata.previous_assignee_username || "unassigned");
    const next = String(metadata.next_assignee_username || "unassigned");
    return `Owner changed from ${previous} to ${next}.`;
  }

  if (entry.action_type === "LEAD_NOTE_UPDATED") {
    return `${String(metadata.mode || "append")} note update: ${String(
      metadata.note_excerpt || ""
    )}`.trim();
  }

  if (entry.action_type === "LEAD_CUSTOMER_LINKED") {
    return `Converted customer linked to #${String(
      metadata.next_customer_id || "—"
    )}.`;
  }

  if (entry.action_type === "LEAD_SUBSCRIPTION_LINKED") {
    return `Converted subscription linked to #${String(
      metadata.next_subscription_id || "—"
    )}.`;
  }

  if (entry.action_type === "LEAD_CONVERTED") {
    return "Lead conversion was completed against real created records.";
  }

  return "Lead activity recorded.";
}

function buildCustomerCreateHref(lead: AdminLeadDetail): string {
  const params = new URLSearchParams();
  params.set("lead", String(lead.id));
  params.set("name", lead.name || "");
  params.set("phone", lead.phone || "");
  if (lead.city) params.set("city", lead.city);
  if (lead.interested_product) params.set("interested_product", lead.interested_product);
  if (lead.product_id) params.set("product", String(lead.product_id));
  if (lead.product_name) params.set("product_name", lead.product_name);
  if (lead.product_code) params.set("product_code", lead.product_code);
  if (lead.submitted_notes) params.set("notes", lead.submitted_notes);
  return `/admin/customers/create?${params.toString()}`;
}

function buildSubscriptionCreateHref(
  lead: AdminLeadDetail,
  preferredCustomerId?: number | null
): string {
  const params = new URLSearchParams();
  params.set("lead", String(lead.id));
  params.set("lead_name", lead.name || "");
  params.set("lead_phone", lead.phone || "");
  if (preferredCustomerId) params.set("customer", String(preferredCustomerId));
  if (lead.city) params.set("lead_city", lead.city);
  if (lead.submitted_notes) params.set("lead_notes", lead.submitted_notes);
  if (lead.interested_product) params.set("interested_product", lead.interested_product);
  if (lead.product_id) params.set("product", String(lead.product_id));
  if (lead.product_name) params.set("product_name", lead.product_name);
  if (lead.product_code) params.set("product_code", lead.product_code);
  return `/admin/subscriptions/create?${params.toString()}`;
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

export default function AdminLeadDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const leadId = Number(params?.id || 0);
  const searchParamKey = searchParams.toString();

  const [lead, setLead] = useState<AdminLeadDetail | null>(null);
  const [timeline, setTimeline] = useState<AuditEntry[]>([]);
  const [assignees, setAssignees] = useState<InternalUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [statusInput, setStatusInput] = useState<AdminLeadStatus>("NEW");
  const [assigneeInput, setAssigneeInput] = useState<string>("");
  const [noteInput, setNoteInput] = useState("");
  const [noteMode, setNoteMode] = useState<"append" | "replace">("append");
  const [conversionCustomerInput, setConversionCustomerInput] = useState("");
  const [conversionSubscriptionInput, setConversionSubscriptionInput] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!leadId) {
        setError("Lead id is invalid.");
        setLoading(false);
        return;
      }

      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const [leadPayload, assigneePayload, timelinePayload] = await Promise.all([
          getAdminLead(leadId),
          listInternalUsers({ is_active: "true" }),
          apiFetch<AuditTimelineResponse>(`/admin/audit-logs/timeline/PublicLead/${leadId}/`),
        ]);

        setLead(leadPayload);
        setStatusInput(leadPayload.status);
        setAssigneeInput(
          typeof leadPayload.assigned_to_id === "number"
            ? String(leadPayload.assigned_to_id)
            : ""
        );
        setAssignees(assigneePayload.results);
        setTimeline(timelinePayload.results || []);
        setError(null);
      } catch (err) {
        setLead(null);
        setTimeline([]);
        setError(toErrorMessage(err));
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [leadId]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  useEffect(() => {
    if (!lead) return;

    const prefilledCustomer =
      searchParams.get("converted_customer") ||
      (lead.converted_customer_id ? String(lead.converted_customer_id) : "");
    const prefilledSubscription =
      searchParams.get("converted_subscription") ||
      (lead.converted_subscription_id ? String(lead.converted_subscription_id) : "");

    setConversionCustomerInput(prefilledCustomer);
    setConversionSubscriptionInput(prefilledSubscription);
  }, [lead, searchParamKey, searchParams]);

  const customerCreateHref = useMemo(
    () => (lead ? buildCustomerCreateHref(lead) : "/admin/customers/create"),
    [lead]
  );
  const subscriptionCreateHref = useMemo(() => {
    if (!lead) return "/admin/subscriptions/create";
    const candidateCustomerId =
      parsePositiveInteger(searchParams.get("converted_customer") || "") ||
      lead.converted_customer_id ||
      null;
    return buildSubscriptionCreateHref(lead, candidateCustomerId);
  }, [lead, searchParams]);

  async function handleStatusUpdate() {
    if (!lead) return;

    try {
      setActionLoading("status");
      setMessage(null);
      const updated = await updateAdminLeadStatus(lead.id, statusInput);
      setLead(updated);
      setMessage(`Lead status updated to ${updated.status}.`);
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleAssigneeUpdate() {
    if (!lead) return;

    try {
      setActionLoading("assignee");
      setMessage(null);
      const updated = await updateAdminLeadAssignee(
        lead.id,
        assigneeInput ? Number(assigneeInput) : null
      );
      setLead(updated);
      setMessage("Lead assignment updated.");
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleNoteUpdate() {
    if (!lead) return;

    try {
      setActionLoading("notes");
      setMessage(null);
      const updated = await updateAdminLeadNotes(lead.id, {
        note: noteInput,
        mode: noteMode,
      });
      setLead(updated);
      setNoteInput("");
      setMessage(
        noteMode === "append" ? "Lead note appended." : "Lead note replaced."
      );
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleConversionComplete() {
    if (!lead) return;

    try {
      setActionLoading("convert");
      setMessage(null);
      const updated = await completeAdminLeadConversion(lead.id, {
        customer_id: parsePositiveInteger(conversionCustomerInput),
        subscription_id: parsePositiveInteger(conversionSubscriptionInput),
      });
      setLead(updated);
      setStatusInput(updated.status);
      setConversionCustomerInput(
        updated.converted_customer_id ? String(updated.converted_customer_id) : ""
      );
      setConversionSubscriptionInput(
        updated.converted_subscription_id
          ? String(updated.converted_subscription_id)
          : ""
      );
      setMessage("Lead conversion linked to the selected live records.");
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <PortalPage
      title={lead ? `Lead #${lead.id}` : "Lead Detail"}
      subtitle="Review the submitted enquiry, update the intake lifecycle, assign ownership, and hand the lead off into customer or subscription creation without silent mutation."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Leads", href: "/admin/leads" },
        { label: lead ? `Lead #${lead.id}` : "Detail" },
      ]}
      actions={[
        { href: "/admin/leads", label: "Back to Inbox", variant: "secondary" },
        { href: customerCreateHref, label: "Create Customer", variant: "secondary" },
        { href: subscriptionCreateHref, label: "Create Subscription", variant: "primary" },
      ]}
      stats={[
        {
          label: "Status",
          value: lead?.status || "—",
          tone: lead?.status === "CONVERTED" ? "success" : lead?.status === "CLOSED" ? "danger" : "warning",
        },
        {
          label: "Assignee",
          value: lead?.assigned_to_full_name || lead?.assigned_to_username || "Unassigned",
        },
        {
          label: "Submitted",
          value: formatDateTime(lead?.created_at),
        },
        {
          label: "Timeline Events",
          value: String(timeline.length),
        },
      ]}
      statusBadge={{ label: "Lead Triage", tone: "info" }}
    >
      <div className="space-y-6">
        {loading ? <LoadingBlock label="Loading lead detail..." /> : null}

        {!loading && error && !lead ? (
          <ErrorState
            title="Unable to load lead detail"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !lead ? (
          <EmptyState
            title="Lead not found"
            description="The requested lead could not be loaded."
          />
        ) : null}

        {!loading && lead ? (
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
                <h2 className="text-base font-semibold text-foreground">Submitted Lead Context</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Customer-facing enquiry details captured from the public apply flow.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <DetailValue label="Lead Reference" value={`Lead #${lead.id}`} />
                  <DetailValue label="Submitted At" value={formatDateTime(lead.created_at)} />
                  <DetailValue label="Name" value={lead.name || "—"} />
                  <DetailValue label="Phone" value={lead.phone || "—"} />
                  <DetailValue label="City" value={lead.city || "—"} />
                  <DetailValue label="Source" value={lead.source || "—"} />
                  <DetailValue
                    label="Interested Product"
                    value={lead.product_name || lead.interested_product || "—"}
                  />
                  <DetailValue
                    label="Preferred EMI"
                    value={
                      lead.preferred_emi_amount ? `₹${lead.preferred_emi_amount}` : "—"
                    }
                  />
                </div>

                <div className="mt-4 rounded-xl border border-border bg-background p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Customer Submitted Notes
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                    {lead.submitted_notes || "No customer note submitted."}
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-base font-semibold text-foreground">Workflow State</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Operational lifecycle, owner assignment, and backend timestamps.
                </p>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <DetailValue
                    label="Current Status"
                    value={
                      <span
                        className={[
                          "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                          statusTone(lead.status),
                        ].join(" ")}
                      >
                        {lead.status.replace("_", " ")}
                      </span>
                    }
                  />
                  <DetailValue
                    label="Current Owner"
                    value={lead.assigned_to_full_name || lead.assigned_to_username || "Unassigned"}
                  />
                  <DetailValue
                    label="Linked Customer"
                    value={
                      lead.converted_customer_id ? (
                        <Link
                          href={`/admin/customers/${lead.converted_customer_id}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {lead.converted_customer_name || `Customer #${lead.converted_customer_id}`}
                        </Link>
                      ) : (
                        "Not linked yet"
                      )
                    }
                  />
                  <DetailValue
                    label="Linked Subscription"
                    value={
                      lead.converted_subscription_id ? (
                        <Link
                          href={`/admin/subscriptions/${lead.converted_subscription_id}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {lead.converted_subscription_number ||
                            `Subscription #${lead.converted_subscription_id}`}
                        </Link>
                      ) : (
                        "Not linked yet"
                      )
                    }
                  />
                  <DetailValue label="Assigned At" value={formatDateTime(lead.assigned_at)} />
                  <DetailValue label="Contacted At" value={formatDateTime(lead.contacted_at)} />
                  <DetailValue
                    label="Converted By"
                    value={
                      lead.converted_by_full_name ||
                      lead.converted_by_username ||
                      "Not recorded yet"
                    }
                  />
                  <DetailValue label="Converted At" value={formatDateTime(lead.converted_at)} />
                  <DetailValue label="Closed At" value={formatDateTime(lead.closed_at)} />
                </div>

                <div className="mt-5 grid gap-4">
                  <div className="rounded-xl border border-border bg-background p-4">
                    <div className="text-sm font-semibold text-foreground">Update Status</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Use the dedicated conversion action below before setting a lead to converted.
                    </p>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                      <select
                        value={statusInput}
                        onChange={(event) => setStatusInput(event.target.value as AdminLeadStatus)}
                        className="h-10 flex-1 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                      >
                        <option value="NEW">New</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="CONTACTED">Contacted</option>
                        <option value="CONVERTED">Converted</option>
                        <option value="CLOSED">Closed</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleStatusUpdate()}
                        disabled={actionLoading === "status"}
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
                <h2 className="text-base font-semibold text-foreground">Admin Notes</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Maintain the current working note with replace or append mode. Changes are auditable.
                </p>

                <div className="mt-4 rounded-xl border border-border bg-background p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Current Admin Notes
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                    {lead.admin_notes || "No admin note recorded yet."}
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  <textarea
                    rows={6}
                    value={noteInput}
                    onChange={(event) => setNoteInput(event.target.value)}
                    placeholder="Capture call outcome, visit request, or next step."
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
                <h2 className="text-base font-semibold text-foreground">Workflow Handoff</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Continue manually into the live admin customer or subscription workflows with context preserved in the URL.
                </p>

                {searchParams.get("converted_customer") || searchParams.get("converted_subscription") ? (
                  <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    Recent create flow returned with conversion candidates prefilled below. Review the ids, then complete the conversion explicitly.
                  </div>
                ) : null}

                <div className="mt-4 grid gap-4">
                  <div className="rounded-xl border border-border bg-background p-4">
                    <div className="text-sm font-semibold text-foreground">Create Customer</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Prefills lead contact details into the customer create form without creating anything silently.
                    </p>
                    <Link
                      href={customerCreateHref}
                      className="mt-4 inline-flex items-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                    >
                      Open Customer Create
                    </Link>
                  </div>

                  <div className="rounded-xl border border-border bg-background p-4">
                    <div className="text-sm font-semibold text-foreground">Create Subscription</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Preserves lead context and product context where available. Customer selection remains operator-controlled.
                    </p>
                    <Link
                      href={subscriptionCreateHref}
                      className="mt-4 inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95"
                    >
                      Open Subscription Create
                    </Link>
                  </div>

                  <div className="rounded-xl border border-border bg-background p-4">
                    <div className="text-sm font-semibold text-foreground">
                      Complete Conversion
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Link this lead to the real created customer or subscription. This action is auditable and marks the lead converted on the backend.
                    </p>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Converted Customer ID
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={conversionCustomerInput}
                          onChange={(event) => setConversionCustomerInput(event.target.value)}
                          placeholder="Enter created customer id"
                          className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Converted Subscription ID
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={conversionSubscriptionInput}
                          onChange={(event) => setConversionSubscriptionInput(event.target.value)}
                          placeholder="Enter created subscription id"
                          className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void handleConversionComplete()}
                        disabled={
                          actionLoading === "convert" ||
                          (!conversionCustomerInput.trim() &&
                            !conversionSubscriptionInput.trim())
                        }
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {actionLoading === "convert"
                          ? "Saving..."
                          : "Complete Conversion"}
                      </button>

                      {lead.converted_customer_id ? (
                        <Link
                          href={`/admin/customers/${lead.converted_customer_id}`}
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                        >
                          Open Linked Customer
                        </Link>
                      ) : null}

                      {lead.converted_subscription_id ? (
                        <Link
                          href={`/admin/subscriptions/${lead.converted_subscription_id}`}
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                        >
                          Open Linked Subscription
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Lead History</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Timeline of audited lead lifecycle changes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadPage("refresh")}
                  disabled={refreshing}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>

              {timeline.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    title="No lead history yet"
                    description="Lead lifecycle events will appear here once actions are recorded."
                  />
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {timeline.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-xl border border-border bg-background p-4"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="font-medium text-foreground">
                            {entry.action_type.replaceAll("_", " ")}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {summarizeAuditEntry(entry)}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {entry.performed_by_username || "System"} ·{" "}
                          {formatDateTime(entry.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
