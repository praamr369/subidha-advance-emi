"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { CustomerIntelligenceTrigger } from "@/components/customer-intelligence/CustomerIntelligenceTrigger";
import DataTable from "@/components/ui/DataTable";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { buildAdminServiceDeskCaseRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import {
  listServiceDeskComplaints,
  type ServiceDeskComplaint,
  type ServiceDeskComplaintListResponse,
} from "@/services/service-desk";

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unable to load the complaint register.";
}

export default function AdminServiceDeskComplaintsPage() {
  const [payload, setPayload] = useState<ServiceDeskComplaintListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadPage() {
      try {
        setLoading(true);
        const next = await listServiceDeskComplaints();
        if (cancelled) return;
        setPayload(next);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setPayload(null);
        setError(toErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadPage();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = payload?.results || [];
  const columns = useMemo(
    () => [
      {
        key: "id",
        title: "Complaint",
        render: (row: ServiceDeskComplaint) => (
          <div>
            <div className="font-medium text-foreground">#{row.id}</div>
            <div className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</div>
          </div>
        ),
      },
      {
        key: "customer_name",
        title: "Customer",
        render: (row: ServiceDeskComplaint) => (
          <div>
            <div className="font-medium text-foreground">
              <CustomerIntelligenceTrigger
                customerId={row.customer}
                customerName={row.customer_name || "—"}
                scope="admin"
              />
            </div>
            <div className="text-xs text-muted-foreground">{row.customer_phone || "—"}</div>
          </div>
        ),
      },
      { key: "category", title: "Category" },
      {
        key: "message",
        title: "Issue",
        render: (row: ServiceDeskComplaint) => (
          <div className="max-w-xl">
            <div className="line-clamp-2 text-sm text-foreground">{row.message}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {row.subscription_number || "No subscription"} ·{" "}
              {row.payment_reference_no || "No payment reference"}
            </div>
          </div>
        ),
      },
      { key: "status", title: "Support Status" },
      {
        key: "linked_service_case_no",
        title: "Service Desk Case",
        render: (row: ServiceDeskComplaint) =>
          row.linked_service_case_id ? (
            <Link
              href={buildAdminServiceDeskCaseRoute(row.linked_service_case_id)}
              className="text-primary underline-offset-4 hover:underline"
            >
              {row.linked_service_case_no || `Case ${row.linked_service_case_id}`}
            </Link>
          ) : (
            <span className="text-muted-foreground">Not linked</span>
          ),
      },
    ],
    []
  );

  return (
    <PortalPage
      title="Complaint Register"
      subtitle="Customer complaint intake stays anchored in support requests while linked service-desk cases capture the operational return, exchange, or after-sales work that follows."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Service Desk", href: ROUTES.admin.serviceDesk },
        { label: "Complaints" },
      ]}
      actions={[
        { href: ROUTES.admin.serviceDesk, label: "Overview", variant: "secondary" },
        { href: ROUTES.admin.supportRequests, label: "Support Requests", variant: "secondary" },
        { href: ROUTES.admin.serviceDeskReturns, label: "Returns", variant: "primary" },
      ]}
      stats={[
        { label: "Visible", value: String(payload?.count ?? 0), tone: "info" },
        { label: "Submitted", value: String(payload?.summary.submitted ?? 0) },
        { label: "Under Review", value: String(payload?.summary.under_review ?? 0), tone: "warning" },
        { label: "Linked Cases", value: String(payload?.summary.linked_case_count ?? 0) },
      ]}
      statusBadge={{ label: "Complaint Intake", tone: "info" }}
    >
      {loading ? <LoadingBlock label="Loading complaints..." /> : null}
      {!loading && error ? (
        <ErrorState title="Complaint register unavailable" description={error} />
      ) : null}
      {!loading && !error ? <DataTable columns={columns} rows={rows} emptyText="No complaints found." /> : null}
    </PortalPage>
  );
}
