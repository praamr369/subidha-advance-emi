"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { WorkspaceShell } from "@/components/admin/erp/WorkspaceShell";
import {
  CrmOperationalWorkspace,
  type CrmWorkspaceSectionCard,
} from "@/components/workspace/CrmOperationalWorkspace";
import { ROUTES } from "@/lib/routes";
import { getAdminCrmWorkspace, type CrmWorkspacePayload } from "@/services/admin-erp";
import { listCustomers } from "@/services/customers";
import { getCrmOverview, type CrmOverviewResponse } from "@/services/crm";

function findPipelineCount(payload: CrmWorkspacePayload | null, key: string): number {
  const row = payload?.crm_pipeline?.find((entry) => entry.key === key);
  return Number(row?.count || 0);
}

export default function AdminCrmOverviewPage() {
  const [workspace, setWorkspace] = useState<CrmWorkspacePayload | null>(null);
  const [overview, setOverview] = useState<CrmOverviewResponse | null>(null);
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const [workspaceResult, overviewResult, customerResult] = await Promise.allSettled([
        getAdminCrmWorkspace(),
        getCrmOverview(),
        listCustomers({ page: 1 }),
      ]);

      if (!active) return;

      if (workspaceResult.status === "fulfilled") {
        setWorkspace(workspaceResult.value);
      } else {
        setWorkspace(null);
        setError("CRM workspace status is unavailable.");
      }

      if (overviewResult.status === "fulfilled") {
        setOverview(overviewResult.value);
      } else {
        setOverview(null);
      }

      if (customerResult.status === "fulfilled") {
        setCustomerCount(Number(customerResult.value.count || 0));
      } else {
        setCustomerCount(null);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const cards = useMemo<CrmWorkspaceSectionCard[]>(() => {
    const customersLoaded = customerCount !== null;
    const partyCount = overview?.summary.party_count;
    const leadsCount = overview?.summary.lead_count;
    const followupsCount = overview?.summary.due_follow_up_count;
    const supportCount = findPipelineCount(workspace, "support_open");
    const kycCount = findPipelineCount(workspace, "pending_kyc");

    return [
      {
        key: "registered-customers",
        label: "Registered Customers",
        purpose: "Canonical customer profiles used by direct-sale existing-customer selection.",
        href: ROUTES.admin.customers,
        count: customersLoaded ? customerCount : null,
        status: customersLoaded ? "ready" : "loading",
        statusMessage: customersLoaded ? `${customerCount} customer profiles.` : "Loading customer register status...",
      },
      {
        key: "crm-parties",
        label: "CRM Parties",
        purpose: "Party 360 entries linked across customer, lead, partner, vendor, and staff roles.",
        href: ROUTES.admin.crmParties,
        count: typeof partyCount === "number" ? partyCount : null,
        status: typeof partyCount === "number" ? "ready" : "loading",
        statusMessage:
          typeof partyCount === "number"
            ? `${partyCount} party records.`
            : "Loading party directory status...",
      },
      {
        key: "leads",
        label: "Leads / Enquiries",
        purpose: "Lead pipeline and enquiry conversion workflow.",
        href: ROUTES.admin.crmLeads,
        count: typeof leadsCount === "number" ? leadsCount : null,
        status: typeof leadsCount === "number" ? "ready" : "loading",
        statusMessage:
          typeof leadsCount === "number"
            ? `${leadsCount} lead/enquiry records.`
            : "Loading leads status...",
      },
      {
        key: "followups",
        label: "Follow-ups",
        purpose: "Open interaction follow-up queue and due-call reminders.",
        href: ROUTES.admin.crmFollowUps,
        count: typeof followupsCount === "number" ? followupsCount : null,
        status: typeof followupsCount === "number" ? "ready" : "loading",
        statusMessage:
          typeof followupsCount === "number"
            ? `${followupsCount} due follow-ups.`
            : "Loading follow-up queue status...",
      },
      {
        key: "kyc",
        label: "KYC",
        purpose: "Pending customer KYC verification queue for operational controls.",
        href: ROUTES.admin.crmKyc,
        count: workspace ? kycCount : null,
        status: workspace ? "ready" : "loading",
        statusMessage: workspace
          ? `${kycCount} KYC records pending review.`
          : "Loading KYC queue status...",
      },
      {
        key: "support",
        label: "Support / Service Cases",
        purpose: "Customer service and support escalation queue.",
        href: ROUTES.admin.supportRequests,
        count: workspace ? supportCount : null,
        status: workspace ? "ready" : "loading",
        statusMessage: workspace
          ? `${supportCount} open support/service cases.`
          : "Loading support queue status...",
      },
    ];
  }, [customerCount, overview, workspace]);

  return (
    <WorkspaceShell
      title="CRM Workspace"
      subtitle="Operational CRM hub with explicit separation between registered customers and CRM party records."
    >
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <p>
          Direct-sale existing-customer search uses the registered customer source (`/api/v1/admin/customers/search/`).
          CRM parties remain a separate model and are not submitted as `customer` IDs in direct-sale payloads.
        </p>
        <p className="mt-2">
          CRM Pipeline visibility is handled through the Leads / Enquiries and Follow-ups sections in this workspace.
        </p>
        <p className="mt-2">
          Create-customer-from-party action path: unavailable (backend endpoint not present). Use{" "}
          <Link href={`${ROUTES.admin.customers}/create`} className="font-medium text-primary underline-offset-4 hover:underline">
            customer create
          </Link>{" "}
          for now.
        </p>
      </section>

      <CrmOperationalWorkspace cards={cards} />
    </WorkspaceShell>
  );
}
