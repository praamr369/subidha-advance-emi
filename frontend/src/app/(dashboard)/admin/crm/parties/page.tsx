"use client";

import Link from "next/link";
import { FolderKanban, UserRoundSearch, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ControlLaneGrid } from "@/components/admin/control-center/ControlLanes";
import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { buildAdminCrmPartyRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import {
  listCrmParties,
  type PartyFollowUpState,
  type PartyListRow,
  type PartyRoleType,
} from "@/services/crm";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unable to load party directory.";
}

export default function AdminCrmPartyDirectoryPage() {
  const [rows, setRows] = useState<PartyListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleType, setRoleType] = useState<PartyRoleType | "">("");
  const [followUpState, setFollowUpState] = useState<PartyFollowUpState | "">("");

  const loadPage = useCallback(
    async (
      nextRoleType: PartyRoleType | "" = roleType,
      nextFollowUpState: PartyFollowUpState | "" = followUpState
    ) => {
      try {
        setLoading(true);
        const payload = await listCrmParties({
          role_type: nextRoleType,
          follow_up_state: nextFollowUpState,
        });
        setRows(payload.results);
        setError(null);
      } catch (err) {
        setRows([]);
        setError(toErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [followUpState, roleType]
  );

  useEffect(() => {
    void loadPage("", "");
  }, [loadPage]);

  const columns: EnterpriseColumnDef<PartyListRow>[] = [
    {
      key: "party_no",
      header: "Party",
      render: (row) => (
        <div>
          <Link
            href={buildAdminCrmPartyRoute(row.id)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {row.party_no}
          </Link>
          <div className="text-xs text-muted-foreground">{row.party_kind}</div>
        </div>
      ),
    },
    { key: "display_name", header: "Display Name" },
    {
      key: "role_types",
      header: "Roles",
      render: (row) => row.role_types.join(", ") || "Unlinked",
    },
    {
      key: "primary_phone",
      header: "Primary Contact",
      render: (row) => row.primary_phone || row.primary_email || "—",
    },
    { key: "city", header: "City" },
    {
      key: "follow_up_state",
      header: "Follow-Up",
      render: (row) => `${row.follow_up_state} · ${row.open_follow_up_count} open`,
    },
    {
      key: "is_active",
      header: "Active",
      render: (row) => (row.is_active ? "Yes" : "No"),
    },
  ];

  return (
    <PortalPage
      title="Party Directory"
      subtitle="A shared additive identity layer above leads, customers, vendors, partners, and staff. It links records together; it does not replace the underlying source models."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "CRM", href: ROUTES.admin.crm },
        { label: "Party Directory" },
      ]}
      actions={[
        { href: ROUTES.admin.crm, label: "CRM Overview", variant: "secondary" },
        { href: ROUTES.admin.crmLeads, label: "CRM Leads", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      {loading ? <LoadingBlock label="Loading party directory..." /> : null}
      {!loading && error ? (
        <ErrorState
          title="Unable to load party directory"
          description={error}
          onRetry={() => void loadPage()}
        />
      ) : null}

      {!loading && !error ? (
        <>
          <ControlLaneGrid
            title="Directory lanes"
            description="The party directory is the identity map. Lead intake, customer work, and CRM overview stay in their own route-safe lanes."
            lanes={[
              {
                title: "CRM overview",
                description: "Cross-party CRM posture and recent interaction visibility.",
                href: ROUTES.admin.crm,
                icon: <FolderKanban className="h-4 w-4" />,
                badge: "CRM",
              },
              {
                title: "CRM leads",
                description: "Lead register with party continuity and follow-up posture.",
                href: ROUTES.admin.crmLeads,
                icon: <UserRoundSearch className="h-4 w-4" />,
                badge: "Leads",
              },
              {
                title: "Customer register",
                description: "Open the canonical customer module without replacing the shared identity layer.",
                href: ROUTES.admin.customers,
                icon: <Users className="h-4 w-4" />,
                badge: "Customer",
              },
            ]}
          />
          <WorkspaceSection
            title="Directory"
            description="The list is derived from CRM party master links and open follow-up state. Use it to drill into cross-module timelines, not to edit finance or subscription truth."
            action={
              <div className="flex flex-wrap gap-2">
                <select
                  value={roleType}
                  onChange={(event) => setRoleType(event.target.value as PartyRoleType | "")}
                  className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                >
                  <option value="">All roles</option>
                  <option value="LEAD">Lead</option>
                  <option value="CUSTOMER">Customer</option>
                  <option value="PARTNER">Partner</option>
                  <option value="VENDOR">Vendor</option>
                  <option value="STAFF">Staff</option>
                </select>
                <select
                  value={followUpState}
                  onChange={(event) =>
                    setFollowUpState(event.target.value as PartyFollowUpState | "")
                  }
                  className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                >
                  <option value="">All follow-up states</option>
                  <option value="DUE">Due</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="NONE">None</option>
                </select>
                <button
                  type="button"
                  onClick={() => void loadPage(roleType, followUpState)}
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
                window.location.href = buildAdminCrmPartyRoute(row.id);
              }}
              emptyTitle="No parties found"
              emptyDescription="No CRM parties match the current directory filter."
            />
          </WorkspaceSection>
        </>
      ) : null}
    </PortalPage>
  );
}
