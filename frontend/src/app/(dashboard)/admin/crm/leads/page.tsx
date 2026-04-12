"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { buildAdminCrmPartyRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import {
  listAdminLeads,
  type AdminLeadDetail,
  type AdminLeadStatus,
} from "@/services/admin-leads";

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unable to load CRM lead register.";
}

export default function AdminCrmLeadRegisterPage() {
  const [rows, setRows] = useState<AdminLeadDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AdminLeadStatus | "">("");

  const loadPage = useCallback(
    async (nextStatus: AdminLeadStatus | "" = status) => {
      try {
        setLoading(true);
        const payload = await listAdminLeads({ status: nextStatus });
        setRows(payload.results as AdminLeadDetail[]);
        setError(null);
      } catch (err) {
        setRows([]);
        setError(toErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [status]
  );

  useEffect(() => {
    void loadPage("");
  }, [loadPage]);

  const columns: EnterpriseColumnDef<AdminLeadDetail>[] = [
    {
      key: "id",
      header: "Lead",
      render: (row) => (
        <div>
          <div className="font-medium text-foreground">Lead #{row.id}</div>
          <div className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</div>
        </div>
      ),
    },
    {
      key: "name",
      header: "Contact",
      render: (row) => (
        <div>
          <div className="font-medium text-foreground">{row.name}</div>
          <div className="text-xs text-muted-foreground">
            {row.phone} · {row.city || "No city"}
          </div>
        </div>
      ),
    },
    {
      key: "party_display_name",
      header: "Party",
      render: (row) =>
        row.party_id ? (
          <Link
            href={buildAdminCrmPartyRoute(row.party_id)}
            className="text-primary underline-offset-4 hover:underline"
          >
            {row.party_no || row.party_display_name || `Party #${row.party_id}`}
          </Link>
        ) : (
          "Pending sync"
        ),
    },
    {
      key: "interested_product",
      header: "Product Context",
      render: (row) => row.product_name || row.interested_product || "—",
    },
    { key: "status", header: "Lead Status" },
    {
      key: "follow_up_state",
      header: "Follow-Up",
      render: (row) =>
        `${row.follow_up_state || "NONE"} · ${row.open_follow_up_count ?? 0} open`,
    },
    {
      key: "converted_subscription_id",
      header: "Live Handoff",
      render: (row) => {
        if (row.converted_subscription_id) {
          return row.converted_subscription_number || `Subscription #${row.converted_subscription_id}`;
        }
        if (row.converted_direct_sale_id) {
          return row.converted_direct_sale_no || `Direct Sale #${row.converted_direct_sale_id}`;
        }
        if (row.converted_customer_id) {
          return row.converted_customer_name || `Customer #${row.converted_customer_id}`;
        }
        return "Not linked";
      },
    },
  ];

  return (
    <PortalPage
      title="CRM Lead Register"
      subtitle="Review lead pipeline with party continuity and follow-up state, while the actual conversion, subscription, and direct-sale creation still happen in their bounded operational modules."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "CRM", href: ROUTES.admin.crm },
        { label: "Leads" },
      ]}
      actions={[
        { href: ROUTES.admin.crm, label: "CRM Overview", variant: "secondary" },
        { href: ROUTES.admin.crmParties, label: "Party Directory", variant: "secondary" },
        { href: ROUTES.admin.leads, label: "Lead Triage", variant: "primary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      {loading ? <LoadingBlock label="Loading CRM leads..." /> : null}
      {!loading && error ? (
        <ErrorState
          title="Unable to load CRM leads"
          description={error}
          onRetry={() => void loadPage()}
        />
      ) : null}

      {!loading && !error ? (
        <WorkspaceSection
          title="Lead Register"
          description="This register mirrors the live admin lead workflow but adds party and follow-up continuity so staff can move between CRM and operational conversion screens safely."
          action={
            <div className="flex flex-wrap gap-2">
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as AdminLeadStatus | "")}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
              >
                <option value="">All statuses</option>
                <option value="NEW">New</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="CONTACTED">Contacted</option>
                <option value="CONVERTED">Converted</option>
                <option value="CLOSED">Closed</option>
              </select>
              <button
                type="button"
                onClick={() => void loadPage(status)}
                className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Apply
              </button>
            </div>
          }
        >
          <EnterpriseDataTable
            data={rows}
            columns={columns}
            onRowClick={(row) => {
              window.location.href = `${ROUTES.admin.leads}/${row.id}`;
            }}
            emptyTitle="No CRM leads found"
            emptyDescription="No lead rows match the current CRM register filter."
          />
        </WorkspaceSection>
      ) : null}
    </PortalPage>
  );
}
