"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { DetailItem, WorkspaceSection } from "@/components/ui/workspace";
import {
  buildAdminBillingDocumentRoute,
  buildAdminDeliveryRoute,
  buildAdminSubscriptionRoute,
  buildAdminSupportRequestsRoute,
} from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import {
  completeServiceDeskDeliveryReturn,
  getServiceDeskCase,
  linkServiceDeskReplacementSale,
  postServiceDeskCreditNote,
  postServiceDeskDebitNote,
  requestServiceDeskDeliveryReturn,
  updateServiceDeskCaseStatus,
  type ServiceDeskCase,
  type ServiceDeskCaseStatus,
} from "@/services/service-desk";

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN");
}

function money(value?: string | null): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unable to load the service desk case.";
}

export default function AdminServiceDeskCaseDetailPage() {
  const params = useParams<{ id: string }>();
  const caseId = params?.id;

  const [serviceCase, setServiceCase] = useState<ServiceDeskCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState<ServiceDeskCaseStatus>("UNDER_REVIEW");
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [replacementSaleId, setReplacementSaleId] = useState("");

  const loadPage = useCallback(async () => {
    if (!caseId) {
      setLoading(false);
      setError("Service desk case id is missing.");
      return;
    }

    try {
      setLoading(true);
      const next = await getServiceDeskCase(caseId);
      setServiceCase(next);
      setNextStatus(
        next.status === "DRAFT" ? "OPEN" : next.status === "OPEN" ? "UNDER_REVIEW" : "RESOLVED"
      );
      setError(null);
    } catch (err) {
      setServiceCase(null);
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  async function handleStatusUpdate() {
    if (!serviceCase) return;
    try {
      setSaving(true);
      setNotice(null);
      const response = await updateServiceDeskCaseStatus(serviceCase.id, {
        status: nextStatus,
        resolution_summary: resolutionSummary || undefined,
      });
      setServiceCase(response.service_case);
      setNotice(`Case moved to ${response.service_case.status}.`);
      if (nextStatus === "RESOLVED" || nextStatus === "REJECTED") {
        setResolutionSummary("");
      }
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleRequestDeliveryReturn() {
    if (!serviceCase) return;
    try {
      setSaving(true);
      setNotice(null);
      const response = await requestServiceDeskDeliveryReturn(serviceCase.id, deliveryNotes);
      setServiceCase(response.service_case);
      setNotice("Delivery return requested from the service case.");
      setDeliveryNotes("");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleCompleteDeliveryReturn() {
    if (!serviceCase) return;
    try {
      setSaving(true);
      setNotice(null);
      const response = await completeServiceDeskDeliveryReturn(serviceCase.id, deliveryNotes);
      setServiceCase(response.service_case);
      setNotice("Delivery return completed and stock bridge settlement recorded.");
      setDeliveryNotes("");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handlePostCreditNote() {
    if (!serviceCase) return;
    try {
      setSaving(true);
      setNotice(null);
      const response = await postServiceDeskCreditNote(serviceCase.id);
      setServiceCase(response.service_case);
      setNotice(`Credit note ${response.service_case.credit_note_no || response.credit_note_id} posted.`);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handlePostDebitNote() {
    if (!serviceCase) return;
    try {
      setSaving(true);
      setNotice(null);
      const response = await postServiceDeskDebitNote(serviceCase.id);
      setServiceCase(response.service_case);
      setNotice(`Debit note ${response.service_case.debit_note_no || response.debit_note_id} posted.`);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleLinkReplacementSale() {
    if (!serviceCase || !replacementSaleId.trim()) return;
    try {
      setSaving(true);
      setNotice(null);
      const response = await linkServiceDeskReplacementSale(serviceCase.id, Number(replacementSaleId));
      setServiceCase(response.service_case);
      setNotice("Replacement direct sale linked.");
      setReplacementSaleId("");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const supportHref =
    serviceCase?.support_request != null
      ? buildAdminSupportRequestsRoute({ q: String(serviceCase.support_request) })
      : null;

  return (
    <PortalPage
      title={serviceCase?.case_no || "Service Desk Case"}
      subtitle="This case detail is the explicit operational control surface for returns, exchanges, complaints, and after-sales service. Inventory, billing, delivery, and accounting remain linked but separate truths."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Service Desk", href: ROUTES.admin.serviceDesk },
        {
          label:
            serviceCase?.case_type === "SERVICE"
              ? "Service Tickets"
              : serviceCase?.case_type === "COMPLAINT"
                ? "Complaints"
                : "Returns",
          href:
            serviceCase?.case_type === "SERVICE"
              ? ROUTES.admin.serviceDeskTickets
              : serviceCase?.case_type === "COMPLAINT"
                ? ROUTES.admin.serviceDeskComplaints
                : ROUTES.admin.serviceDeskReturns,
        },
        { label: serviceCase?.case_no || "Detail" },
      ]}
      actions={[
        { href: ROUTES.admin.serviceDesk, label: "Overview", variant: "secondary" },
        {
          href:
            serviceCase?.case_type === "SERVICE"
              ? ROUTES.admin.serviceDeskTickets
              : serviceCase?.case_type === "COMPLAINT"
                ? ROUTES.admin.serviceDeskComplaints
                : ROUTES.admin.serviceDeskReturns,
          label: "Back to Register",
          variant: "secondary",
        },
        ...(serviceCase?.billing_invoice
          ? [
              {
                href: buildAdminBillingDocumentRoute(serviceCase.billing_invoice),
                label: "Open Billing Document",
                variant: "secondary" as const,
              },
            ]
          : []),
        ...(serviceCase?.delivery
          ? [
              {
                href: buildAdminDeliveryRoute(serviceCase.delivery),
                label: "Open Delivery",
                variant: "secondary" as const,
              },
            ]
          : []),
        ...(serviceCase?.subscription
          ? [
              {
                href: buildAdminSubscriptionRoute(serviceCase.subscription),
                label: "Open Subscription",
                variant: "secondary" as const,
              },
            ]
          : []),
      ]}
      stats={[
        { label: "Status", value: serviceCase?.status || "—", tone: "info" },
        { label: "Branch", value: serviceCase?.branch_code || serviceCase?.branch_name || "—", tone: "info" },
        { label: "Finance", value: serviceCase?.finance_status || "—" },
        { label: "Stock", value: serviceCase?.stock_status || "—" },
        { label: "Total", value: money(serviceCase?.total_amount) },
      ]}
      statusBadge={{ label: serviceCase?.case_type || "Case", tone: "info" }}
    >
      <div className="space-y-6">
        {loading ? <LoadingBlock label="Loading service desk case..." /> : null}
        {!loading && error && !serviceCase ? (
          <ErrorState title="Unable to load the case" description={error} onRetry={() => void loadPage()} />
        ) : null}
        {!loading && !error && !serviceCase ? (
          <EmptyState title="Case not found" description="The requested service desk case could not be loaded." />
        ) : null}

        {serviceCase ? (
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
                title="Case Summary"
                description="The case carries operational context, while the linked modules remain authoritative for their own documents and movements."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <DetailItem label="Case Type" value={serviceCase.case_type} />
                  <DetailItem label="Priority" value={serviceCase.priority} />
                  <DetailItem label="Issue" value={serviceCase.issue_summary} />
                  <DetailItem label="Reporter" value={serviceCase.reporter_name_snapshot || "—"} />
                  <DetailItem label="Reporter Phone" value={serviceCase.reporter_phone_snapshot || "—"} />
                  <DetailItem label="Warranty" value={serviceCase.warranty_status} />
                  <DetailItem
                    label="Branch"
                    value={
                      serviceCase.branch_code || serviceCase.branch_name
                        ? [serviceCase.branch_code, serviceCase.branch_name]
                            .filter(Boolean)
                            .join(" · ")
                        : "—"
                    }
                  />
                  <DetailItem label="Assigned To" value={serviceCase.assigned_to_username || "Unassigned"} />
                  <DetailItem label="Created" value={formatDateTime(serviceCase.created_at)} />
                </div>
                <div className="mt-4 rounded-2xl border border-border bg-background p-4 text-sm text-foreground">
                  {serviceCase.issue_details || "No extended issue details recorded."}
                </div>
              </WorkspaceSection>

              <WorkspaceSection
                title="Cross-Module Trace"
                description="Use these links to review the original delivery, sale, invoice, or complaint without turning this case into the source of truth for those records."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <DetailItem
                    label="Party"
                    value={
                      serviceCase.party ? (
                        <Link
                          href={`${ROUTES.admin.crmParties}/${serviceCase.party}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {serviceCase.party_no || serviceCase.party_display_name || `Party ${serviceCase.party}`}
                        </Link>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <DetailItem
                    label="Support Request"
                    value={
                      supportHref ? (
                        <Link href={supportHref} className="text-primary underline-offset-4 hover:underline">
                          #{serviceCase.support_request}
                        </Link>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <DetailItem
                    label="Direct Sale"
                    value={
                      serviceCase.direct_sale ? (
                        <Link
                          href={`${ROUTES.admin.billingDirectSales}?focus_sale=${serviceCase.direct_sale}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {serviceCase.direct_sale_no || `Sale ${serviceCase.direct_sale}`}
                        </Link>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <DetailItem
                    label="Billing Document"
                    value={
                      serviceCase.billing_invoice ? (
                        <Link
                          href={buildAdminBillingDocumentRoute(serviceCase.billing_invoice)}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {serviceCase.billing_invoice_no || `Invoice ${serviceCase.billing_invoice}`}
                        </Link>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <DetailItem
                    label="Delivery"
                    value={
                      serviceCase.delivery ? (
                        <Link
                          href={buildAdminDeliveryRoute(serviceCase.delivery)}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {serviceCase.delivery_reference || `Delivery ${serviceCase.delivery}`}
                        </Link>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <DetailItem
                    label="Replacement Sale"
                    value={
                      serviceCase.replacement_direct_sale ? (
                        <Link
                          href={`${ROUTES.admin.billingDirectSales}?focus_sale=${serviceCase.replacement_direct_sale}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {serviceCase.replacement_direct_sale_no || `Sale ${serviceCase.replacement_direct_sale}`}
                        </Link>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <DetailItem label="Credit Note" value={serviceCase.credit_note_no || "—"} />
                  <DetailItem label="Debit Note" value={serviceCase.debit_note_no || "—"} />
                </div>
              </WorkspaceSection>
            </div>

            <WorkspaceSection
              title="Case Lines"
              description="These lines drive the eventual note posting amounts and any stock-related detail. Historical invoice or ledger rows are never edited in place."
            >
              <div className="space-y-3">
                {serviceCase.lines.length === 0 ? (
                  <EmptyState
                    title="No lines recorded"
                    description="Add lines from the create flow or update the case through the API before posting a finance document."
                  />
                ) : (
                  serviceCase.lines.map((line, index) => (
                    <div
                      key={line.id || index}
                      className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="font-medium text-foreground">{line.description}</div>
                          <div className="text-sm text-muted-foreground">
                            {line.product_code || "No product"} · {line.inventory_item_sku || "No inventory item"} ·{" "}
                            {line.disposition}
                          </div>
                        </div>
                        <div className="text-right text-sm text-foreground">
                          <div>Qty {line.quantity}</div>
                          <div>{money(line.line_total)}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </WorkspaceSection>

            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <WorkspaceSection
                title="Status Control"
                description="Move the case deliberately. Resolution and rejection require an explicit summary."
              >
                <div className="grid gap-3">
                  <label className="grid gap-2 text-sm">
                    <span>Next Status</span>
                    <select
                      value={nextStatus}
                      onChange={(event) => setNextStatus(event.target.value as ServiceDeskCaseStatus)}
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    >
                      <option value="OPEN">Open</option>
                      <option value="UNDER_REVIEW">Under Review</option>
                      <option value="AUTHORIZED">Authorized</option>
                      <option value="IN_SERVICE">In Service</option>
                      <option value="RESOLVED">Resolved</option>
                      <option value="REJECTED">Rejected</option>
                      <option value="CLOSED">Closed</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Resolution Summary</span>
                    <textarea
                      rows={4}
                      value={resolutionSummary}
                      onChange={(event) => setResolutionSummary(event.target.value)}
                      className="rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </label>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => void handleStatusUpdate()}
                      disabled={saving}
                      className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                    >
                      {saving ? "Saving..." : "Update Status"}
                    </button>
                  </div>
                </div>
              </WorkspaceSection>

              <WorkspaceSection
                title="Operational Actions"
                description="Delivery return, credit note, debit note, and replacement sale actions stay explicit here and push their effects into the correct downstream modules."
              >
                <div className="grid gap-4">
                  {serviceCase.delivery ? (
                    <div className="rounded-2xl border border-border bg-background p-4">
                      <div className="text-sm font-medium text-foreground">Delivery Return Bridge</div>
                      <label className="mt-3 grid gap-2 text-sm">
                        <span>Notes</span>
                        <textarea
                          rows={3}
                          value={deliveryNotes}
                          onChange={(event) => setDeliveryNotes(event.target.value)}
                          className="rounded-xl border border-border bg-card px-3 py-2"
                        />
                      </label>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleRequestDeliveryReturn()}
                          disabled={saving}
                          className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground"
                        >
                          Request Delivery Return
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCompleteDeliveryReturn()}
                          disabled={saving}
                          className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground"
                        >
                          Complete Delivery Return
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {serviceCase.credit_note_required ? (
                    <button
                      type="button"
                      onClick={() => void handlePostCreditNote()}
                      disabled={saving || serviceCase.credit_note != null}
                      className="rounded-xl border border-border bg-background px-4 py-3 text-left text-sm font-medium text-foreground disabled:opacity-60"
                    >
                      {serviceCase.credit_note_no
                        ? `Credit Note Posted · ${serviceCase.credit_note_no}`
                        : "Post Credit Note"}
                    </button>
                  ) : null}

                  {serviceCase.debit_note_required ? (
                    <button
                      type="button"
                      onClick={() => void handlePostDebitNote()}
                      disabled={saving || serviceCase.debit_note != null}
                      className="rounded-xl border border-border bg-background px-4 py-3 text-left text-sm font-medium text-foreground disabled:opacity-60"
                    >
                      {serviceCase.debit_note_no
                        ? `Debit Note Posted · ${serviceCase.debit_note_no}`
                        : "Post Debit Note"}
                    </button>
                  ) : null}

                  {serviceCase.case_type === "EXCHANGE" ? (
                    <div className="rounded-2xl border border-border bg-background p-4">
                      <div className="text-sm font-medium text-foreground">Replacement Sale Link</div>
                      <label className="mt-3 grid gap-2 text-sm">
                        <span>Replacement Direct Sale ID</span>
                        <input
                          value={replacementSaleId}
                          onChange={(event) => setReplacementSaleId(event.target.value)}
                          className="rounded-xl border border-border bg-card px-3 py-2"
                        />
                      </label>
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => void handleLinkReplacementSale()}
                          disabled={saving}
                          className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground"
                        >
                          Link Replacement Sale
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </WorkspaceSection>
            </div>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
