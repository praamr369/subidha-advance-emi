"use client";

import { useEffect, useState } from "react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  getBranchReportingOverview,
  type BranchReportingOverview,
} from "@/services/branch-control";

function money(value?: string | number | null): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

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
    <PortalPage
      title="Branch Reporting"
      subtitle="Review branch-wise collections, direct sales, contract posture, overdue EMI, stock visibility, and people-cost signals from the existing operational and accounting truths."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Branch Reporting" },
      ]}
      actions={[
        { href: ROUTES.admin.branches, label: "Branches", variant: "secondary" },
        { href: ROUTES.admin.counters, label: "Counters", variant: "secondary" },
      ]}
      stats={[
        { label: "Branch Scope", value: selectedBranchLabel, tone: "info" },
        { label: "Collections", value: money(payload?.collections.gross_amount), tone: "success" },
        { label: "Direct Sales", value: money(payload?.direct_sales.gross_total), tone: "info" },
        { label: "Overdue EMI", value: money(payload?.subscriptions.overdue_emi_amount), tone: (Number(payload?.subscriptions.overdue_emi_amount || 0) > 0 ? "warning" : "success") },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm text-slate-700">
              <span className="mb-2 block font-medium">Branch</span>
              <select
                value={branchId}
                onChange={(event) => setBranchId(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              >
                <option value="">All branches</option>
                {payload?.branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.code} · {branch.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-2 block font-medium">From date</span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-2 block font-medium">To date</span>
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              />
            </label>
            <div className="flex items-end gap-3">
              <button
                type="button"
                onClick={() =>
                  void loadPage({
                    branch_id: branchId,
                    start_date: startDate,
                    end_date: endDate,
                  })
                }
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Apply Filters
              </button>
              <button
                type="button"
                onClick={() => {
                  setBranchId("");
                  setStartDate("");
                  setEndDate("");
                  void loadPage();
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {loading ? <LoadingBlock label="Loading branch reporting..." /> : null}
        {!loading && error ? (
          <ErrorState
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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Collection Count"
                value={String(payload.collections.count)}
                subtext={`Cash ${money(payload.collections.cash_total)} · Bank ${money(payload.collections.bank_total)} · UPI ${money(payload.collections.upi_total)}`}
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
                value={money(
                  Number(payload.people_costs.salary_paid_total || 0) +
                    Number(payload.people_costs.expense_total || 0) +
                    Number(payload.people_costs.reimbursement_total || 0)
                )}
                subtext={`Salary ${money(payload.people_costs.salary_paid_total)} · Expense ${money(payload.people_costs.expense_total)} · Reimbursement ${money(payload.people_costs.reimbursement_total)}`}
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
                    value={money(payload.collections.gross_amount)}
                    subtext={`${payload.collections.count} payment rows in the current branch/date scope`}
                    tone="success"
                  />
                  <StatCard
                    label="Direct Sales Gross"
                    value={money(payload.direct_sales.gross_total)}
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
                    subtext={money(payload.subscriptions.overdue_emi_amount)}
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
    </PortalPage>
  );
}
