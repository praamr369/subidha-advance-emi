"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PartyKycPanel from "@/components/kyc/PartyKycPanel";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { DetailItem, WorkspaceSection } from "@/components/ui/workspace";
import {
  buildAdminBillingDocumentRoute,
  buildAdminDeliveryRoute,
  buildAdminServiceDeskCaseRoute,
  buildAdminSubscriptionRoute,
} from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import {
  createPartyInteraction,
  getCrmParty,
  updateCrmParty,
  updatePartyInteractionStatus,
  type PartyDetailResponse,
} from "@/services/crm";

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unable to load the party timeline.";
}

function buildTimelineHref(item: PartyDetailResponse["timeline"][number]): string | null {
  const link = item.link || {};
  if (typeof link.lead_id === "number") return `${ROUTES.admin.leads}/${link.lead_id}`;
  if (typeof link.subscription_id === "number") {
    return buildAdminSubscriptionRoute(link.subscription_id);
  }
  if (typeof link.direct_sale_id === "number") {
    return `${ROUTES.admin.billingDirectSales}?focus_sale=${link.direct_sale_id}`;
  }
  if (typeof link.billing_invoice_id === "number") {
    return buildAdminBillingDocumentRoute(link.billing_invoice_id);
  }
  if (typeof link.delivery_id === "number") {
    return buildAdminDeliveryRoute(link.delivery_id);
  }
  if (typeof link.service_case_id === "number") {
    return buildAdminServiceDeskCaseRoute(link.service_case_id);
  }
  if (typeof link.support_request_id === "number") {
    return ROUTES.admin.supportRequests;
  }
  if (typeof link.reminder_id === "number") {
    return ROUTES.admin.reminders;
  }
  return null;
}

export default function AdminCrmPartyDetailPage() {
  const params = useParams<{ id: string }>();
  const partyId = Number(params?.id || 0);

  const [payload, setPayload] = useState<PartyDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    interaction_type: "FOLLOW_UP",
    subject: "",
    note: "",
    next_follow_up_at: "",
    create_follow_up_reminder: true,
  });
  const [partyForm, setPartyForm] = useState({
    display_name: "",
    party_kind: "PERSON",
    primary_phone: "",
    primary_email: "",
    city: "",
    notes_summary: "",
    is_active: true,
  });

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      try {
        if (mode === "initial") setLoading(true);
        else setRefreshing(true);
        const next = await getCrmParty(partyId);
        setPayload(next);
        setPartyForm({
          display_name: next.party.display_name || "",
          party_kind: next.party.party_kind || "PERSON",
          primary_phone: next.party.primary_phone || "",
          primary_email: next.party.primary_email || "",
          city: next.party.city || "",
          notes_summary: next.party.notes_summary || "",
          is_active: Boolean(next.party.is_active),
        });
        setError(null);
      } catch (err) {
        setPayload(null);
        setError(toErrorMessage(err));
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [partyId]
  );

  useEffect(() => {
    if (!partyId) {
      setError("Party id is invalid.");
      setLoading(false);
      return;
    }
    void loadPage("initial");
  }, [loadPage, partyId]);

  const quickLinks = useMemo(() => {
    if (!payload) return [];
    const links: Array<{ href: string; label: string }> = [];
    if (payload.related.leads[0]?.id) {
      links.push({ href: `${ROUTES.admin.leads}/${payload.related.leads[0].id}`, label: "Lead" });
    }
    if (typeof payload.related.subscriptions[0]?.id === "number") {
      links.push({
        href: buildAdminSubscriptionRoute(payload.related.subscriptions[0].id as number),
        label: "Subscription",
      });
    }
    if (typeof payload.related.direct_sales[0]?.id === "number") {
      links.push({
        href: `${ROUTES.admin.billingDirectSales}?focus_sale=${payload.related.direct_sales[0].id as number}`,
        label: "Direct Sale",
      });
    }
    if (typeof payload.related.invoices[0]?.id === "number") {
      links.push({
        href: buildAdminBillingDocumentRoute(payload.related.invoices[0].id as number),
        label: "Billing Detail",
      });
    }
    return links;
  }, [payload]);

  async function handleCreateInteraction() {
    if (!payload || !form.note.trim()) return;

    try {
      setSaving(true);
      setNotice(null);
      await createPartyInteraction(payload.party.id, {
        interaction_type: form.interaction_type,
        subject: form.subject,
        note: form.note,
        next_follow_up_at: form.next_follow_up_at
          ? new Date(form.next_follow_up_at).toISOString()
          : null,
        create_follow_up_reminder: form.create_follow_up_reminder,
      });
      setForm({
        interaction_type: "FOLLOW_UP",
        subject: "",
        note: "",
        next_follow_up_at: "",
        create_follow_up_reminder: true,
      });
      setNotice("Party interaction recorded.");
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleInteractionStatus(interactionId: number, status: "DONE" | "CANCELLED" | "OPEN") {
    try {
      setSaving(true);
      setNotice(null);
      await updatePartyInteractionStatus(interactionId, status);
      setNotice(`Interaction marked ${status}.`);
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateParty() {
    if (!payload) return;
    try {
      setSaving(true);
      setNotice(null);
      const next = await updateCrmParty(payload.party.id, {
        display_name: partyForm.display_name,
        party_kind: partyForm.party_kind,
        primary_phone: partyForm.primary_phone,
        primary_email: partyForm.primary_email,
        city: partyForm.city,
        notes_summary: partyForm.notes_summary,
        is_active: partyForm.is_active,
      });
      setPayload(next);
      setNotice("Party 360 profile updated.");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ERPPageShell
      title={payload ? `${payload.party.display_name} · Party 360` : "Party 360 Profile"}
      subtitle="Cross-module Party 360 profile for customers, partners, vendors, and staff. This view supports additive party-profile edits and interaction follow-ups while preserving source-system ownership."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "CRM", href: ROUTES.admin.crm },
        { label: "Parties", href: ROUTES.admin.crmParties },
        { label: payload?.party.party_no || "Detail" },
      ]}
      actions={[
        { href: ROUTES.admin.crmParties, label: "Back to Directory", variant: "secondary" },
        { href: ROUTES.admin.crmLeads, label: "CRM Leads", variant: "secondary" },
        ...quickLinks.map((item) => ({
          href: item.href,
          label: `Open ${item.label}`,
          variant: "secondary" as const,
        })),
      ]}
      stats={[
        { label: "Roles", value: String(payload?.party.role_types.length ?? 0), tone: "info" },
        { label: "Subscriptions", value: String(payload?.summary.subscription_count ?? 0) },
        { label: "Direct Sales", value: String(payload?.summary.direct_sale_count ?? 0) },
        { label: "Service Cases", value: String(payload?.summary.service_case_count ?? 0) },
        {
          label: "Open Follow-Ups",
          value: String(payload?.summary.open_follow_up_count ?? 0),
          tone: (payload?.summary.open_follow_up_count ?? 0) > 0 ? "warning" : "success",
        },
      ]}
      statusBadge={{ label: payload?.party.party_no || "Party", tone: "info" }}
    >
      <div className="space-y-6">
        {loading ? <LoadingBlock label="Loading party timeline..." /> : null}
        {!loading && error && !payload ? (
          <ErrorState
            title="Unable to load party timeline"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !payload ? (
          <EmptyState
            title="Party not found"
            description="The requested party timeline could not be loaded."
          />
        ) : null}

        {!loading && payload ? (
          <>
            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
            {notice ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {notice}
              </div>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <WorkspaceSection
                title="Party Summary"
                description="The party master is an identity and continuity layer only. Role-specific source models stay authoritative."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <DetailItem label="Party No" value={payload.party.party_no} />
                  <DetailItem label="Display Name" value={payload.party.display_name} />
                  <DetailItem label="Kind" value={payload.party.party_kind} />
                  <DetailItem label="Roles" value={payload.party.role_types.join(", ")} />
                  <DetailItem label="Primary Phone" value={payload.party.primary_phone || "—"} />
                  <DetailItem label="Primary Email" value={payload.party.primary_email || "—"} />
                  <DetailItem label="City" value={payload.party.city || "—"} />
                  <DetailItem label="Notes Summary" value={payload.party.notes_summary || "—"} />
                  <DetailItem
                    label="Follow-Up State"
                    value={`${payload.party.follow_up_state} · ${payload.summary.open_follow_up_count} open`}
                  />
                </div>
              </WorkspaceSection>

              <WorkspaceSection
                title="Cross-Module Snapshot"
                description="Use these counts to orient the operator before drilling into the full timeline below."
                action={
                  <button
                    type="button"
                    onClick={() => void loadPage("refresh")}
                    disabled={refreshing}
                    className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
                  >
                    {refreshing ? "Refreshing..." : "Refresh"}
                  </button>
                }
              >
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <DetailItem label="Leads" value={payload.summary.lead_count} />
                  <DetailItem label="Customers" value={payload.summary.customer_count} />
                  <DetailItem label="Invoices" value={payload.summary.invoice_count} />
                  <DetailItem label="Receipts" value={payload.summary.receipt_count} />
                  <DetailItem label="Deliveries" value={payload.summary.delivery_count} />
                  <DetailItem label="Support" value={payload.summary.support_count} />
                  <DetailItem label="Service Cases" value={payload.summary.service_case_count} />
                  <DetailItem label="Return Cases" value={payload.summary.return_case_count} />
                  <DetailItem label="Service Tickets" value={payload.summary.service_ticket_count} />
                  <DetailItem label="Reminders" value={payload.summary.reminder_count} />
                  <DetailItem label="Interactions" value={payload.summary.interaction_count} />
                </div>
              </WorkspaceSection>
            </div>

            <WorkspaceSection
              title="KYC"
              description="KYC routes to the party's linked canonical owner (customer, partner, vendor, or staff). Unconverted leads show a conversion-required state — no separate party KYC store is created."
            >
              <PartyKycPanel partyId={payload.party.id} />
            </WorkspaceSection>

            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <WorkspaceSection
                title="Edit Party Profile"
                description="Update additive party master fields here. Linked source records (customer, partner, vendor, staff, subscriptions, billing) remain authoritative in their own modules."
              >
                <div className="grid gap-3">
                  <label className="grid gap-2 text-sm">
                    <span>Display name</span>
                    <input
                      value={partyForm.display_name}
                      onChange={(event) =>
                        setPartyForm((current) => ({ ...current, display_name: event.target.value }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Party kind</span>
                    <select
                      value={partyForm.party_kind}
                      onChange={(event) =>
                        setPartyForm((current) => ({ ...current, party_kind: event.target.value }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    >
                      <option value="PERSON">Person</option>
                      <option value="ORGANIZATION">Organization</option>
                      <option value="HOUSEHOLD">Household</option>
                      <option value="UNKNOWN">Unknown</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Primary phone</span>
                    <input
                      value={partyForm.primary_phone}
                      onChange={(event) =>
                        setPartyForm((current) => ({ ...current, primary_phone: event.target.value }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Primary email</span>
                    <input
                      value={partyForm.primary_email}
                      onChange={(event) =>
                        setPartyForm((current) => ({ ...current, primary_email: event.target.value }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>City</span>
                    <input
                      value={partyForm.city}
                      onChange={(event) =>
                        setPartyForm((current) => ({ ...current, city: event.target.value }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Notes summary</span>
                    <textarea
                      rows={3}
                      value={partyForm.notes_summary}
                      onChange={(event) =>
                        setPartyForm((current) => ({ ...current, notes_summary: event.target.value }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-3 text-sm">
                    <input
                      type="checkbox"
                      checked={partyForm.is_active}
                      onChange={(event) =>
                        setPartyForm((current) => ({ ...current, is_active: event.target.checked }))
                      }
                    />
                    Party active
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleUpdateParty()}
                    disabled={saving || !partyForm.display_name.trim()}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {saving ? "Saving..." : "Save Party Profile"}
                  </button>
                </div>
              </WorkspaceSection>

              <WorkspaceSection
                title="Add Interaction"
                description="Record follow-up notes explicitly. Reminder creation stays optional and separate from financial reminder truth."
              >
                <div className="grid gap-3">
                  <label className="grid gap-2 text-sm">
                    <span>Interaction type</span>
                    <select
                      value={form.interaction_type}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, interaction_type: event.target.value }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    >
                      <option value="GENERAL">General</option>
                      <option value="CONTACT_NOTE">Contact note</option>
                      <option value="FOLLOW_UP">Follow up</option>
                      <option value="HANDOFF">Handoff</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Subject</span>
                    <input
                      value={form.subject}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, subject: event.target.value }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Note</span>
                    <textarea
                      rows={5}
                      value={form.note}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, note: event.target.value }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Next follow-up</span>
                    <input
                      type="datetime-local"
                      value={form.next_follow_up_at}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          next_follow_up_at: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-3 text-sm">
                    <input
                      type="checkbox"
                      checked={form.create_follow_up_reminder}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          create_follow_up_reminder: event.target.checked,
                        }))
                      }
                    />
                    Create linked internal follow-up reminder when a next follow-up date is set
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleCreateInteraction()}
                    disabled={saving || !form.note.trim()}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {saving ? "Saving..." : "Record Interaction"}
                  </button>
                </div>
              </WorkspaceSection>

              <WorkspaceSection
                title="Open Interactions"
                description="Close or cancel follow-up items explicitly. Historical notes remain immutable in the timeline below."
              >
                <div className="space-y-3">
                  {payload.related.interactions.length === 0 ? (
                    <EmptyState
                      title="No party interactions yet"
                      description="Add the first follow-up note or handoff record above."
                    />
                  ) : (
                    payload.related.interactions.map((interaction) => (
                      <div
                        key={interaction.id}
                        className="rounded-xl border border-border bg-muted/30 px-4 py-3"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="font-medium text-foreground">
                              {interaction.subject || interaction.interaction_type}
                            </div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              {interaction.note}
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              {interaction.status} · {formatDateTime(interaction.next_follow_up_at || interaction.happened_at)}
                              {interaction.reminder_no ? ` · ${interaction.reminder_no}` : ""}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {interaction.status !== "DONE" ? (
                              <button
                                type="button"
                                onClick={() => void handleInteractionStatus(interaction.id, "DONE")}
                                disabled={saving}
                                className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
                              >
                                Mark Done
                              </button>
                            ) : null}
                            {interaction.status !== "CANCELLED" ? (
                              <button
                                type="button"
                                onClick={() => void handleInteractionStatus(interaction.id, "CANCELLED")}
                                disabled={saving}
                                className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
                              >
                                Cancel
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </WorkspaceSection>
            </div>

            <WorkspaceSection
              title="Timeline"
              description="Every timeline item links back to the bounded operational module where the underlying source record still lives."
            >
              <div className="space-y-3">
                {payload.timeline.length === 0 ? (
                  <EmptyState
                    title="No party timeline yet"
                    description="Party-linked lead, sales, billing, delivery, support, and reminder events will appear here once recorded."
                  />
                ) : (
                  payload.timeline.map((item, index) => {
                    const href = buildTimelineHref(item);
                    const content = (
                      <>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="font-medium text-foreground">{item.label}</div>
                            <div className="text-sm text-muted-foreground">
                              {item.event_type} · {item.reference || item.status || "Event"}
                            </div>
                            {item.branch_code || item.branch_name ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                Branch: {item.branch_code || item.branch_name}
                                {item.branch_code && item.branch_name ? ` · ${item.branch_name}` : ""}
                              </div>
                            ) : null}
                            {item.detail ? (
                              <div className="mt-2 text-sm text-foreground">{item.detail}</div>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDateTime(item.event_at)}
                          </div>
                        </div>
                      </>
                    );

                    if (href) {
                      return (
                        <Link
                          key={`${item.event_type}-${index}`}
                          href={href}
                          className="block rounded-xl border border-border bg-muted/30 px-4 py-3 transition hover:-translate-y-0.5 hover:bg-white"
                        >
                          {content}
                        </Link>
                      );
                    }

                    return (
                      <div
                        key={`${item.event_type}-${index}`}
                        className="rounded-xl border border-border bg-muted/30 px-4 py-3"
                      >
                        {content}
                      </div>
                    );
                  })
                )}
              </div>
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
