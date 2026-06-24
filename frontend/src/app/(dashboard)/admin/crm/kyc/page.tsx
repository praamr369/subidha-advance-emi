"use client";

/**
 * Admin CRM-wide KYC Review Queue.
 *
 * Aggregates pending / submitted / rejected / resubmission-required KYC
 * documents across customers, partners, vendors and staff from the canonical
 * stores via `/admin/kyc/review-queue/`. Admin-only review actions (approve /
 * reject / request resubmission) delegate to the existing service-layer review
 * logic. No fabricated data: rows, statuses and counts come straight from the
 * backend; an empty queue renders an explicit empty state (never a fake
 * "verified" row).
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  approveKycQueueDocument,
  kycStatusLabel,
  kycStatusTone,
  listKycReviewQueue,
  rejectKycQueueDocument,
  requestKycQueueResubmission,
  type KycOwnerType,
  type KycQueueRow,
  type KycReviewQueueResponse,
  type KycStatusTone,
} from "@/services/kyc";

const OWNER_BADGE: Record<KycOwnerType, { label: string; className: string }> = {
  customer: { label: "Customer", className: "border-sky-200 bg-sky-50 text-sky-700" },
  partner: { label: "Partner", className: "border-violet-200 bg-violet-50 text-violet-700" },
  vendor: { label: "Vendor", className: "border-amber-200 bg-amber-50 text-amber-700" },
  staff: { label: "Staff", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
};

const OWNER_DETAIL_BASE: Record<KycOwnerType, string> = {
  customer: ROUTES.admin.customers,
  partner: ROUTES.admin.partners,
  vendor: ROUTES.admin.vendors,
  staff: ROUTES.admin.hrStaff,
};

function toneClass(tone: KycStatusTone): string {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "danger":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-border bg-muted text-foreground";
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN");
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    const raw = error.message.trim();
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.detail === "string" && parsed.detail.trim()) return parsed.detail;
      for (const [field, value] of Object.entries(parsed)) {
        if (Array.isArray(value) && value.length > 0) return `${field}: ${String(value[0])}`;
        if (typeof value === "string" && value.trim()) return `${field}: ${value}`;
      }
    } catch {
      return raw;
    }
    return raw;
  }
  return fallback;
}

const inputClass =
  "h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-ring";
const btnGhost =
  "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground transition hover:bg-muted disabled:opacity-50";
const btnPrimary =
  "inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60";

const STATUS_OPTIONS = [
  { value: "", label: "Pending queue (default)" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "PENDING", label: "Pending Review" },
  { value: "REJECTED", label: "Rejected" },
  { value: "RESUBMISSION_REQUIRED", label: "Resubmission Required" },
];

const OWNER_OPTIONS: Array<{ value: KycOwnerType | ""; label: string }> = [
  { value: "", label: "All owner types" },
  { value: "customer", label: "Customers" },
  { value: "partner", label: "Partners" },
  { value: "vendor", label: "Vendors" },
  { value: "staff", label: "Staff" },
];

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass(
        kycStatusTone(status)
      )}`}
    >
      {kycStatusLabel(status)}
    </span>
  );
}

export default function AdminCrmKycReviewQueuePage() {
  const [data, setData] = useState<KycReviewQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [ownerType, setOwnerType] = useState<KycOwnerType | "">("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [expiresWithinDays, setExpiresWithinDays] = useState<number | undefined>(undefined);

  // Per-row reasoned action (reject / resubmission).
  const [actionRowKey, setActionRowKey] = useState<string | null>(null);
  const [actionKind, setActionKind] = useState<"reject" | "resubmission" | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const rowKey = (row: KycQueueRow) => `${row.owner_type}:${row.document_id}`;

  const load = useCallback(
    async (filters?: { ownerType?: KycOwnerType | ""; statusFilter?: string; search?: string; expiresWithinDays?: number | undefined }) => {
      try {
        setLoading(true);
        const expDays = filters?.expiresWithinDays !== undefined ? filters.expiresWithinDays : expiresWithinDays;
        const next = await listKycReviewQueue({
          owner_type: filters?.ownerType ?? ownerType,
          status: filters?.statusFilter ?? statusFilter,
          search: filters?.search ?? search,
          ...(expDays !== undefined ? { expires_within_days: expDays } : {}),
        });
        setData(next);
        setError(null);
      } catch (err) {
        setData(null);
        setError(toErrorMessage(err, "Unable to load the KYC review queue."));
      } finally {
        setLoading(false);
      }
    },
    [ownerType, statusFilter, search, expiresWithinDays]
  );

  useEffect(() => {
    // Intentional empty-deps: runs once on mount with explicit empty filter overrides.
    // Subsequent loads are triggered by the "Apply filters" button (calls load() with current state)
    // or by post-action handlers (approve/reject). Not a missing-dep bug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    void load({ ownerType: "", statusFilter: "", search: "", expiresWithinDays: undefined });
  }, []);

  function openAction(row: KycQueueRow, kind: "reject" | "resubmission") {
    setActionRowKey(rowKey(row));
    setActionKind(kind);
    setActionReason("");
    setActionError(null);
  }

  function closeAction() {
    setActionRowKey(null);
    setActionKind(null);
    setActionReason("");
    setActionError(null);
  }

  async function approve(row: KycQueueRow) {
    setActionBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await approveKycQueueDocument(row.owner_type, row.document_id);
      setNotice(`Approved ${OWNER_BADGE[row.owner_type].label} document #${row.document_id}.`);
      closeAction();
      await load();
    } catch (err) {
      setActionError(toErrorMessage(err, "Could not approve document."));
    } finally {
      setActionBusy(false);
    }
  }

  async function confirmReasonedAction(row: KycQueueRow) {
    const reason = actionReason.trim();
    if (!reason) {
      setActionError("A reason is required.");
      return;
    }
    setActionBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      if (actionKind === "reject") {
        await rejectKycQueueDocument(row.owner_type, row.document_id, reason);
        setNotice(`Rejected ${OWNER_BADGE[row.owner_type].label} document #${row.document_id}.`);
      } else {
        await requestKycQueueResubmission(row.owner_type, row.document_id, reason);
        setNotice(`Requested resubmission for document #${row.document_id}.`);
      }
      closeAction();
      await load();
    } catch (err) {
      setActionError(toErrorMessage(err, "Action failed."));
    } finally {
      setActionBusy(false);
    }
  }

  const rows = data?.results ?? [];
  const summary = data?.summary;

  const stats = useMemo(
    () => [
      { label: "In Queue", value: String(summary?.total ?? 0), tone: "info" as const },
      { label: "Customers", value: String(summary?.by_owner_type?.CUSTOMER ?? 0) },
      { label: "Partners", value: String(summary?.by_owner_type?.PARTNER ?? 0) },
      { label: "Vendors", value: String(summary?.by_owner_type?.VENDOR ?? 0) },
      { label: "Staff", value: String(summary?.by_owner_type?.STAFF ?? 0) },
    ],
    [summary]
  );

  return (
    <PortalPage
      eyebrow="CRM & Requests"
      title="KYC Review Queue"
      subtitle="One admin queue for KYC documents awaiting review across customers, partners, vendors and staff. Documents are read from each owner's canonical KYC store — no duplicate KYC records are created here."
      helperNote="Approve, reject (reason required) or request resubmission (reason required). Decisions delegate to each owner's existing KYC workflow and are written to the KYC audit trail. Contract KYC gating is unaffected."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "CRM", href: ROUTES.admin.crm },
        { label: "KYC Review" },
      ]}
      actions={[
        { href: ROUTES.admin.crm, label: "CRM Overview", variant: "secondary" },
        { href: ROUTES.admin.crmParties, label: "Party Directory", variant: "secondary" },
      ]}
      stats={stats}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>KYC Expiry Gate Active:</strong> Expired KYC documents now block contract activation and handover.
          Use &quot;Mark renewal required&quot; on expired documents to notify the owner, then upload renewed documents via the owner&apos;s profile.
        </div>

        <WorkspaceSection
          title="Filters"
          description="Narrow the queue by owner type, status, or owner name / phone / email."
        >
          <div className="flex flex-wrap items-end gap-2">
            <select
              value={ownerType}
              onChange={(e) => setOwnerType(e.target.value as KycOwnerType | "")}
              className={inputClass}
              aria-label="Owner type filter"
            >
              {OWNER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={inputClass}
              aria-label="Status filter"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search owner name / phone / email"
              className={`${inputClass} min-w-[16rem]`}
              aria-label="Search owners"
            />
            <select
              value={expiresWithinDays ?? ""}
              onChange={(e) => setExpiresWithinDays(e.target.value ? Number(e.target.value) : undefined)}
              className={inputClass}
              aria-label="Expiry filter"
            >
              <option value="">Any expiry</option>
              <option value="0">Expired</option>
              <option value="7">Expiring within 7 days</option>
              <option value="30">Expiring within 30 days</option>
              <option value="90">Expiring within 90 days</option>
            </select>
            <button type="button" className={btnPrimary} onClick={() => void load()} disabled={loading}>
              {loading ? "Loading…" : "Apply filters"}
            </button>
            <button
              type="button"
              className={btnGhost}
              onClick={() => {
                setOwnerType("");
                setStatusFilter("");
                setSearch("");
                setExpiresWithinDays(undefined);
                void load({ ownerType: "", statusFilter: "", search: "", expiresWithinDays: undefined });
              }}
              disabled={loading}
            >
              Reset
            </button>
          </div>
        </WorkspaceSection>

        {notice ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </div>
        ) : null}

        {loading ? <LoadingBlock label="Loading KYC review queue..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load the KYC review queue"
            description={error}
            onRetry={() => void load()}
          />
        ) : null}

        {!loading && !error && rows.length === 0 ? (
          <EmptyState
            title="No KYC documents awaiting review"
            description="There are no pending, submitted, rejected, or resubmission-required KYC documents for the current filters."
          />
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <WorkspaceSection
            title="Pending KYC documents"
            description="Each row links back to the owner's profile, where the full per-owner KYC panel and audit trail live."
          >
            <ul className="space-y-2">
              {rows.map((row) => {
                const key = rowKey(row);
                const isActionOpen = actionRowKey === key && actionKind != null;
                const badge = OWNER_BADGE[row.owner_type];
                const detailHref = `${OWNER_DETAIL_BASE[row.owner_type]}/${row.owner_id}`;
                return (
                  <li
                    key={key}
                    className="rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                          <Link
                            href={detailHref}
                            className="font-medium text-primary underline-offset-4 hover:underline"
                          >
                            {row.owner_name || `#${row.owner_id}`}
                          </Link>
                          <StatusPill status={row.status} />
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {row.document_type || "Document"}
                          {row.category ? ` · ${row.category}` : ""}
                          {row.owner_phone ? ` · ${row.owner_phone}` : ""}
                          {row.owner_email ? ` · ${row.owner_email}` : ""}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {row.upload_source ? `Source: ${row.upload_source} · ` : ""}
                          Uploaded {formatDateTime(row.uploaded_at)}
                          {row.uploaded_by ? ` by ${row.uploaded_by}` : ""}
                        </div>
                        {row.expiry_date ? (
                          <div className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
                            row.expiry_status === "EXPIRED"
                              ? "border-red-200 bg-red-50 text-red-700"
                              : row.expiry_status === "EXPIRING_SOON"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          }`}>
                            {row.expiry_status === "EXPIRED" ? "Expired" : row.expiry_status === "EXPIRING_SOON" ? "Expiring soon" : "Valid until"}{" "}
                            {row.expiry_date}
                          </div>
                        ) : null}
                        {row.status === "REJECTED" && row.rejection_reason ? (
                          <div className="mt-1 text-xs font-medium text-red-700">
                            Reason: {row.rejection_reason}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {row.download_url ? (
                          <a
                            href={row.download_url}
                            target="_blank"
                            rel="noreferrer"
                            className={btnGhost}
                          >
                            View file
                          </a>
                        ) : null}
                        {row.allowed_actions.includes("approve") ? (
                          <button
                            type="button"
                            className={btnGhost}
                            onClick={() => void approve(row)}
                            disabled={actionBusy}
                          >
                            Approve
                          </button>
                        ) : null}
                        {row.expiry_status === "EXPIRED" ? (
                          <button
                            type="button"
                            className="inline-flex h-9 items-center justify-center rounded-lg border border-red-300 bg-red-50 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                            onClick={() => {
                              openAction(row, "resubmission");
                              setActionReason("Document has expired. Please upload a renewed/valid document.");
                            }}
                            disabled={actionBusy}
                          >
                            Mark renewal required
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={btnGhost}
                          onClick={() => openAction(row, "reject")}
                          disabled={actionBusy}
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          className={btnGhost}
                          onClick={() => openAction(row, "resubmission")}
                          disabled={actionBusy}
                        >
                          Request resubmission
                        </button>
                      </div>
                    </div>

                    {isActionOpen ? (
                      <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
                        <label className="text-xs font-medium text-muted-foreground">
                          {actionKind === "reject" ? "Rejection reason" : "Resubmission reason"}{" "}
                          <span className="text-red-600">*</span>
                        </label>
                        <textarea
                          value={actionReason}
                          onChange={(e) => setActionReason(e.target.value)}
                          rows={2}
                          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                          placeholder="Explain what the owner must correct…"
                        />
                        {actionError ? (
                          <div className="mt-2 text-xs font-medium text-red-700">{actionError}</div>
                        ) : null}
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            type="button"
                            className={btnGhost}
                            onClick={closeAction}
                            disabled={actionBusy}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className={btnPrimary}
                            onClick={() => void confirmReasonedAction(row)}
                            disabled={actionBusy || !actionReason.trim()}
                          >
                            {actionBusy
                              ? "Submitting…"
                              : actionKind === "reject"
                              ? "Confirm rejection"
                              : "Request resubmission"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </WorkspaceSection>
        ) : null}
      </div>
    </PortalPage>
  );
}
