"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import {
  AccountingNotice,
  accountingDate,
  accountingErrorMessage,
  accountingMoney,
} from "@/components/accounting/shared";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { DetailItem, WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  approveSalarySheetSafe as approveSalarySheet,
  getSalarySheetSafe as getSalarySheet,
  listSalaryPayments,
  postSalarySheetSafe as postSalarySheet,
  type SalaryPayment,
  type SalarySheet,
} from "@/services/accounting";

function toErrorMessage(error: unknown): string {
  return accountingErrorMessage(error, "Unable to load salary sheet.");
}

export default function AdminSalarySheetDetailPage() {
  const params = useParams<{ id: string }>();
  const salarySheetId = params?.id;

  const [salarySheet, setSalarySheet] = useState<SalarySheet | null>(null);
  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPage = useCallback(async () => {
    if (!salarySheetId) {
      setLoading(false);
      setError("Salary sheet id is missing.");
      return;
    }

    try {
      setLoading(true);
      const [sheet, paymentsPayload] = await Promise.all([
        getSalarySheet(Number(salarySheetId)),
        listSalaryPayments({ salary_sheet: salarySheetId }),
      ]);
      setSalarySheet(sheet);
      setPayments(paymentsPayload.results);
      setError(null);
    } catch (err) {
      setSalarySheet(null);
      setPayments([]);
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [salarySheetId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  async function handleApprove() {
    if (!salarySheet) return;
    try {
      setSaving(true);
      setNotice(null);
      await approveSalarySheet(salarySheet.id);
      setNotice("Salary sheet approved.");
      await loadPage();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handlePost() {
    if (!salarySheet) return;
    try {
      setSaving(true);
      setNotice(null);
      await postSalarySheet(salarySheet.id);
      setNotice("Salary sheet posted.");
      await loadPage();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ERPPageShell
      title={salarySheet ? `${salarySheet.employee_code} Payroll` : "Salary Sheet"}
      subtitle="This detail view keeps payslip-ready earnings and deduction lines, approval posture, journal linkage, and payment settlement visible in one place while accounting remains the posted truth."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Salary", href: ROUTES.admin.accountingSalary },
        { label: salarySheet?.employee_code || "Detail" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingSalary, label: "Back to Salary", variant: "secondary" },
        { href: ROUTES.admin.accountingStaff, label: "Staff Register", variant: "secondary" },
        { href: ROUTES.admin.accountingStaffLedger, label: "Staff Ledger", variant: "primary" },
      ]}
      stats={[
        { label: "Status", value: salarySheet?.status || "—", tone: "info" },
        { label: "Net", value: accountingMoney(salarySheet?.net_amount), tone: "default" },
        { label: "Paid", value: accountingMoney(salarySheet?.payment_total), tone: "success" },
        { label: "Outstanding", value: accountingMoney(salarySheet?.outstanding_amount), tone: "warning" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        {notice ? <AccountingNotice message={notice} /> : null}
        {error ? <AccountingNotice tone="danger" message={error} /> : null}

        {loading ? <LoadingBlock label="Loading salary sheet..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load salary sheet"
            description={error}
            onRetry={() => void loadPage()}
          />
        ) : null}

        {!loading && !error && !salarySheet ? (
          <EmptyState
            title="Salary sheet not found"
            description="The requested salary sheet could not be loaded."
          />
        ) : null}

        {!loading && !error && salarySheet ? (
          <>
            <WorkspaceSection
              title="Payroll Summary"
              description="Approval, posting, and payment remain distinct control steps even when the same staff member appears on multiple periods."
              contentClassName="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
            >
              <DetailItem label="Employee" value={`${salarySheet.employee_code} · ${salarySheet.employee_name || "—"}`} />
              <DetailItem label="Period" value={salarySheet.payroll_period_code || `${salarySheet.year}-${String(salarySheet.month).padStart(2, "0")}`} />
              <DetailItem label="Designation" value={salarySheet.employee_designation || "—"} />
              <DetailItem label="Department" value={salarySheet.employee_department || "—"} />
              <DetailItem label="Gross" value={accountingMoney(salarySheet.gross_amount)} />
              <DetailItem label="Deductions" value={accountingMoney(salarySheet.deductions_amount)} />
              <DetailItem label="Net" value={accountingMoney(salarySheet.net_amount)} />
              <DetailItem label="Posted Journal" value={salarySheet.posted_journal_entry_no || "—"} />
            </WorkspaceSection>

            <WorkspaceSection
              title="Controls"
              description="Posting remains service-layer based. Historical journals and salary payments are not editable from this page."
            >
              <div className="flex flex-wrap gap-3">
                {salarySheet.status === "DRAFT" ? (
                  <button
                    type="button"
                    onClick={() => void handleApprove()}
                    disabled={saving}
                    className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
                  >
                    {saving ? "Working..." : "Approve Salary Sheet"}
                  </button>
                ) : null}
                {salarySheet.status === "APPROVED" ? (
                  <button
                    type="button"
                    onClick={() => void handlePost()}
                    disabled={saving}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:opacity-60"
                  >
                    {saving ? "Posting..." : "Post Salary Sheet"}
                  </button>
                ) : null}
              </div>
            </WorkspaceSection>

            <WorkspaceSection
              title="Payslip Breakdown"
              description="These salary lines are the operational source for payroll explanation. Accounting posting derives the summarized accrual from them."
            >
              {salarySheet.lines && salarySheet.lines.length > 0 ? (
                <div className="grid gap-3">
                  {salarySheet.lines.map((line) => (
                    <div
                      key={line.id}
                      className="rounded-xl border border-border bg-card p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">
                            {line.component_name}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {line.component_type} • {line.source_type} • {line.source_reference || "No source ref"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-foreground">
                            {accountingMoney(line.amount)}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Qty {line.quantity || "—"} • Rate {line.rate || "—"}
                          </div>
                        </div>
                      </div>
                      {line.notes ? (
                        <div className="mt-3 text-xs text-muted-foreground">{line.notes}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No salary lines"
                  description="This salary sheet has no detailed lines attached."
                />
              )}
            </WorkspaceSection>

            <WorkspaceSection
              title="Salary Payments"
              description="Payments settle salary payable against the selected finance account. They do not change the original salary-sheet breakdown."
            >
              {payments.length > 0 ? (
                <div className="grid gap-3">
                  {payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="rounded-xl border border-border bg-card p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">
                            {accountingDate(payment.payment_date)}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {payment.finance_account_name} • {payment.reference_no || "No reference"}
                          </div>
                        </div>
                        <div className="text-right text-sm font-semibold text-foreground">
                          {accountingMoney(payment.amount)}
                        </div>
                      </div>
                      {payment.posted_journal_entry_no ? (
                        <div className="mt-3 text-xs text-muted-foreground">
                          Journal {payment.posted_journal_entry_no}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No salary payments yet"
                  description="Payments will appear here after the posted sheet is settled."
                />
              )}
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
