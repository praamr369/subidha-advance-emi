"use client";

import { BarChart3, Building2, CircleDollarSign, PackageSearch, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { ControlLaneGrid } from "@/components/admin/control-center/ControlLanes";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ActionButton from "@/components/ui/ActionButton";
import StatCard from "@/components/ui/StatCard";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import {
  getBranchReportingOverview,
  type BranchReportingOverview,
} from "@/services/branch-control";


function qty(value?: string | number | null): string {
  return Number(value || 0).toFixed(2);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unable to load branch reporting.";
}

export default function AdminBranchReportingPage() {
  const [payload, setPayload] = useState<BranchReportingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  async function loadPage(params?: {
    branch_id?: string;
    start_date?: string;
    end_date?: string;
  }) {
    try {
      setLoading(true);
      const next = await getBranchReportingOverview({
        branch_id: params?.branch_id || undefined,
        start_date: params?.start_date || undefined,
        end_date: params?.end_date || undefined,
      });
      setPayload(next);
      setError(null);
    } catch (err) {
      setPayload(null);
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, []);

  const selectedBranchLabel = payload?.branch
    ? `${payload.branch.code} · ${payload.branch.name}`
    : "All branches";

  return (
    <ERPPageShell
      eyebrow="Branch Reporting"
      title="Branch Reporting"
      subtitle="Review branch-wise collections, direct sales, contract posture, overdue EMI, stock visibility, and people-cost signals from the existing operational and accounting truths."
      helperNote="Branch reporting is read from live operational and accounting registers. It does not rewrite collection, stock, payroll, or ledger history."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Branch Reporting" },
      ]}
      actions={[
        { href: ROUTES.admin.operations, label: "Operations", variant: "secondary" },
        { href: ROUTES.admin.branches, label: "Branches", variant: "secondary" },
        { href: ROUTES.admin.counters, label: "Counters", variant: "secondary" },
      ]}
      stats={[
        { label: "Branch Scope", value: selectedBranchLabel, tone: "info" },
        { label: "Collections", value: formatRupee(payload?.collections.gross_amount), tone: "success" },
        { label: "Direct Sales", value: formatRupee(payload?.direct_sales.gross_total), tone: "info" },
        { label: "Overdue EMI", value: formatRupee(payload?.subscriptions.overdue_emi_amount), tone: (Number(payload?.subscriptions.overdue_emi_amount || 0) > 0 ? "warning" : "success") },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        <ERPSectionShell
          title="Branch scope filters"
          description="Switch the reporting lens by branch and date range before drilling into collections, stock, and people-cost posture."
          footer={
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{selectedBranchLabel}</span>
              <span>·</span>
              <span>
                {startDate || "Start not set"} to {endDate || "today"}
              </span>
            </div>
          }
        >
          <ERPDataToolbar
            left={
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-sm text-foreground">
                  <span className="mb-2 block font-medium">Branch</span>
                  <select
                    value={branchId}
                    onChange={(event) => setBranchId(event.target.value)}
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-ring"
                  >
                    <option value="">All branches</option>
                    {payload?.branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.code} · {branch.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-foreground">
                  <span className="mb-2 block font-medium">From date</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-ring"
                  />
                </label>
                <label className="text-sm text-foreground">
                  <span className="mb-2 block font-medium">To date</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-ring"
                  />
                </label>
                <div className="flex flex-wrap items-end gap-2">
                  <ActionButton
                    type="button"
                    variant="primary"
                    onClick={() =>
                      void loadPage({
                        branch_id: branchId,
                        start_date: startDate,
                        end_date: endDate,
                      })
                    }
                  >
                    Apply Filters
                  </ActionButton>
                  <ActionButton
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setBranchId("");
                      setStartDate("");
                      setEndDate("");
                      void loadPage();
                    }}
                  >
                    Reset
                  </ActionButton>
                </div>
              </div>
            }
            right={
              <ActionButton
                variant="outline"
                onClick={() =>
                  void loadPage({
                    branch_id: branchId,
                    start_date: startDate,
                    end_date: endDate,
                  })
                }
              >
                Refresh scope
              </ActionButton>
            }
          />
        </ERPSectionShell>

        {loading ? <ERPLoadingState label="Loading branch reporting..." /> : null}
        {!loading && error ? (
          <ERPErrorState
            title="Unable to load branch reporting"
            description={error}
            onRetry={() =>
              void loadPage({
                branch_id: branchId,
                start_date: startDate,
                end_date: endDate,
              })
            }
          />
        ) : null}

        {!loading && !error && payload ? (
          <>
            <ControlLaneGrid
              title="Branch control lanes"
              description="Branch reporting aggregates real branch-scoped truth. Open the dedicated registers to act on collections, counters, stock, and people-cost drivers."
              lanes={[
                {
                  title: "Branch governance",
                  description: "Manage branch identity and operational scope.",
                  href: ROUTES.admin.branches,
                  icon: <Building2 className="h-4 w-4" />,
                  badge: "Setup",
                },
                {
                  title: "Counter control",
                  description: "Review counter mapping and front-desk collection control points.",
                  href: ROUTES.admin.counters,
                  icon: <CircleDollarSign className="h-4 w-4" />,
                  badge: "Counter",
                },
                {
                  title: "Operations cockpit",
                  description: "Monitor daily work queues and branch-linked attention surfaces.",
                  href: ROUTES.admin.operations,
                  icon: <BarChart3 className="h-4 w-4" />,
                  badge: "Ops",
                },
                {
                  title: "Inventory visibility",
                  description: "Open branch-relevant stock and movement registers.",
                  href: ROUTES.admin.inventoryStockOnHand,
                  icon: <PackageSearch className="h-4 w-4" />,
                  badge: "Stock",
                },
                {
                  title: "People-cost controls",
                  description: "Keep staff and salary workflows explicit instead of hiding them inside branch totals.",
                  href: ROUTES.admin.accountingStaff,
                  icon: <Users className="h-4 w-4" />,
                  badge: "Workforce",
                },
              ]}
            />
            <WorkspaceDirectory
              title="Branch operating lenses"
              description="Switch between branch governance, branch performance, and branch-linked follow-up surfaces without collapsing them into one ledger or collection rail."
              groups={[
                {
                  title: "Branch governance",
                  description: "Setup and desk-level controls for real shop operations.",
                  items: [
                    {
                      title: "Branches",
                      description: "Maintain branch identity, scope, and activation posture.",
                      href: ROUTES.admin.branches,
                      icon: <Building2 className="h-4 w-4" />,
                      badge: "Setup",
                    },
                    {
                      title: "Counters",
                      description: "Desk-level collection and cashier control points by branch.",
                      href: ROUTES.admin.counters,
                      icon: <CircleDollarSign className="h-4 w-4" />,
                      badge: "Desk",
                    },
                  ],
                },
                {
                  title: "Branch execution",
                  description: "Commercial and service surfaces that matter at branch level.",
                  items: [
                    {
                      title: "Operations workspace",
                      description: "Cross-module action queues for branch-linked work.",
                      href: ROUTES.admin.operations,
                      icon: <BarChart3 className="h-4 w-4" />,
                      badge: "Ops",
                    },
                    {
                      title: "Collections workspace",
                      description: "Due follow-up and collection execution by branch-linked customers.",
                      href: ROUTES.admin.collections,
                      icon: <CircleDollarSign className="h-4 w-4" />,
                      badge: "Collection",
                    },
                    {
                      title: "Billing operations",
                      description: "Direct-sale and billing document posture for branch retail work.",
                      href: ROUTES.admin.billing,
                      icon: <BarChart3 className="h-4 w-4" />,
                      badge: "Billing",
                    },
                  ],
                },
                {
                  title: "Branch risk and support",
                  description: "Supporting lanes for stock visibility and people-cost review.",
                  items: [
                    {
                      title: "Stock on hand",
                      description: "Branch-facing inventory visibility and location posture.",
                      href: ROUTES.admin.inventoryStockOnHand,
                      icon: <PackageSearch className="h-4 w-4" />,
                      badge: "Stock",
                    },
                    {
                      title: "Staff operations",
                      description: "People-cost and staff posture that influence branch performance.",
                      href: ROUTES.admin.accountingStaff,
                      icon: <Users className="h-4 w-4" />,
                      badge: "Workforce",
                    },
                    {
                      title: "Reports overview",
                      description: "Escalate from branch posture into broader operational reporting.",
                      href: ROUTES.admin.reports,
                      icon: <BarChart3 className="h-4 w-4" />,
                      badge: "Reports",
                    },
                  ],
                },
              ]}
            />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Collection Count"
                value={String(payload.collections.count)}
                subtext={`Cash ${formatRupee(payload.collections.cash_total)} · Bank ${formatRupee(payload.collections.bank_total)} · UPI ${formatRupee(payload.collections.upi_total)}`}
                tone="success"
              />
              <StatCard
                label="Active Contracts"
                value={String(payload.subscriptions.active_contracts)}
                subtext={`${payload.subscriptions.completed_contracts} completed contracts in the same branch scope`}
                tone="info"
              />
              <StatCard
                label="Stock Locations"
                value={String(payload.stock.location_count)}
                subtext={`${payload.stock.movement_count} stock movements · On hand ${qty(payload.stock.on_hand_qty)}`}
                tone="default"
              />
              <StatCard
                label="People Costs"
                value={formatRupee(
                  Number(payload.people_costs.salary_paid_total || 0) +
                    Number(payload.people_costs.expense_total || 0) +
                    Number(payload.people_costs.reimbursement_total || 0)
                )}
                subtext={`Salary ${formatRupee(payload.people_costs.salary_paid_total)} · Expense ${formatRupee(payload.people_costs.expense_total)} · Reimbursement ${formatRupee(payload.people_costs.reimbursement_total)}`}
                tone="warning"
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <WorkspaceSection
                title="Collections & Sales"
                description="Branch-level collection totals stay tied to real payment rows, while direct retail sales remain separate from EMI truth."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <StatCard
                    label="Collections Gross"
                    value={formatRupee(payload.collections.gross_amount)}
                    subtext={`${payload.collections.count} payment rows in the current branch/date scope`}
                    tone="success"
                  />
                  <StatCard
                    label="Direct Sales Gross"
                    value={formatRupee(payload.direct_sales.gross_total)}
                    subtext={`${payload.direct_sales.count} direct-sale source records in scope`}
                    tone="info"
                  />
                </div>
              </WorkspaceSection>

              <WorkspaceSection
                title="Contract & Stock Risk"
                description="Overdue EMI and stock visibility remain derived from existing subscription and inventory truth, not spreadsheet summaries."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <StatCard
                    label="Overdue EMI Count"
                    value={String(payload.subscriptions.overdue_emi_count)}
                    subtext={formatRupee(payload.subscriptions.overdue_emi_amount)}
                    tone={payload.subscriptions.overdue_emi_count > 0 ? "warning" : "success"}
                  />
                  <StatCard
                    label="Stock On Hand"
                    value={qty(payload.stock.on_hand_qty)}
                    subtext={`${payload.stock.location_count} locations · ${payload.stock.movement_count} movements`}
                    tone="default"
                  />
                </div>
              </WorkspaceSection>
            </div>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
