"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import {
  AccountingNotice,
  AccountingRefreshButton,
  accountingDate,
  accountingErrorMessage,
  accountingFieldClassName,
  accountingMoney,
} from "@/components/accounting/shared";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  approveExpenseClaim,
  createExpenseClaim,
  createExpenseClaimPayment,
  listChartOfAccounts,
  listEmployees,
  listExpenseClaimPayments,
  listExpenseClaims,
  listFinanceAccounts,
  postExpenseClaim,
  rejectExpenseClaim,
  type ChartOfAccount,
  type EmployeeExpenseClaim,
  type EmployeeExpenseClaimPayment,
  type EmployeeProfile,
  type FinanceAccount,
} from "@/services/accounting";

type ExpenseClaimFormState = {
  employee: string;
  claim_date: string;
  expense_date: string;
  category: string;
  expense_account: string;
  claimed_amount: string;
  bill_no: string;
  notes: string;
};

type ReimbursementFormState = {
  expense_claim: string;
  payment_date: string;
  amount: string;
  finance_account: string;
  reference_no: string;
};

const today = new Date().toISOString().slice(0, 10);

const CLAIM_EMPTY: ExpenseClaimFormState = {
  employee: "",
  claim_date: today,
  expense_date: today,
  category: "",
  expense_account: "",
  claimed_amount: "0.00",
  bill_no: "",
  notes: "",
};

const PAYMENT_EMPTY: ReimbursementFormState = {
  expense_claim: "",
  payment_date: today,
  amount: "0.00",
  finance_account: "",
  reference_no: "",
};

export default function AccountingExpenseClaimsPage() {
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<ChartOfAccount[]>([]);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);
  const [claims, setClaims] = useState<EmployeeExpenseClaim[]>([]);
  const [claimPayments, setClaimPayments] = useState<EmployeeExpenseClaimPayment[]>([]);
  const [claimForm, setClaimForm] = useState<ExpenseClaimFormState>(CLAIM_EMPTY);
  const [paymentForm, setPaymentForm] = useState<ReimbursementFormState>(PAYMENT_EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const [
          employeesPayload,
          chartPayload,
          financePayload,
          claimsPayload,
          claimPaymentsPayload,
        ] = await Promise.all([
          listEmployees({ is_active: 1 }),
          listChartOfAccounts(),
          listFinanceAccounts({ is_active: 1 }),
          listExpenseClaims(),
          listExpenseClaimPayments(),
        ]);
        setEmployees(employeesPayload.results);
        setExpenseAccounts(
          chartPayload.results.filter((account) => account.account_type === "EXPENSE")
        );
        setFinanceAccounts(financePayload.results);
        setClaims(claimsPayload.results);
        setClaimPayments(claimPaymentsPayload.results);
        if (!claimForm.employee && employeesPayload.results[0]) {
          setClaimForm((current) => ({
            ...current,
            employee: String(employeesPayload.results[0].id),
          }));
        }
        setError(null);
      } catch (err) {
        setError(accountingErrorMessage(err, "Failed to load expense claims."));
        if (mode === "initial") {
          setEmployees([]);
          setExpenseAccounts([]);
          setFinanceAccounts([]);
          setClaims([]);
          setClaimPayments([]);
        }
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [claimForm.employee]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const payableClaims = useMemo(
    () =>
      claims.filter(
        (claim) => claim.status === "POSTED" || claim.status === "PAID_PARTIAL"
      ),
    [claims]
  );

  async function handleCreateClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await createExpenseClaim({
        employee: Number(claimForm.employee),
        claim_date: claimForm.claim_date,
        expense_date: claimForm.expense_date,
        category: claimForm.category,
        expense_account: Number(claimForm.expense_account),
        claimed_amount: claimForm.claimed_amount,
        bill_no: claimForm.bill_no,
        notes: claimForm.notes,
      });
      setClaimForm((current) => ({
        ...CLAIM_EMPTY,
        employee: current.employee,
      }));
      setNotice("Expense claim created.");
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to create expense claim."));
    } finally {
      setSaving(false);
    }
  }

  async function handleApproveClaim(claim: EmployeeExpenseClaim) {
    const approvedAmount =
      window.prompt(
        `Approve claim ${claim.claim_no}. Leave blank to approve the full claimed amount.`,
        claim.claimed_amount
      ) ?? "";
    setError(null);
    setNotice(null);
    try {
      await approveExpenseClaim(claim.id, approvedAmount.trim() || undefined);
      setNotice(`Expense claim ${claim.claim_no} approved.`);
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to approve expense claim."));
    }
  }

  async function handleRejectClaim(claim: EmployeeExpenseClaim) {
    const reason = window.prompt(`Reject claim ${claim.claim_no}. Reason`, "") ?? "";
    if (!reason.trim()) return;
    setError(null);
    setNotice(null);
    try {
      await rejectExpenseClaim(claim.id, reason);
      setNotice(`Expense claim ${claim.claim_no} rejected.`);
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to reject expense claim."));
    }
  }

  async function handlePostClaim(claim: EmployeeExpenseClaim) {
    setError(null);
    setNotice(null);
    try {
      await postExpenseClaim(claim.id);
      setNotice(`Expense claim ${claim.claim_no} posted.`);
      setPaymentForm((current) => ({
        ...current,
        expense_claim: String(claim.id),
        amount: claim.outstanding_amount || claim.approved_amount,
      }));
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to post expense claim."));
    }
  }

  async function handleCreatePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await createExpenseClaimPayment({
        expense_claim: Number(paymentForm.expense_claim),
        payment_date: paymentForm.payment_date,
        amount: paymentForm.amount,
        finance_account: Number(paymentForm.finance_account),
        reference_no: paymentForm.reference_no,
      });
      setPaymentForm(PAYMENT_EMPTY);
      setNotice("Reimbursement payment posted.");
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to post reimbursement payment."));
    } finally {
      setSaving(false);
    }
  }

  const postedCount = claims.filter((claim) => claim.status === "POSTED").length;
  const approvedCount = claims.filter((claim) => claim.status === "APPROVED").length;

  return (
    <PortalPage
      title="Expense Claims"
      subtitle="Employee reimbursement stays separate from vendor procurement and customer billing. Claims move from draft to approval to accounting accrual, then settle through explicit reimbursement payments."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Expense Claims" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingStaff, label: "Staff Register", variant: "secondary" },
        { href: ROUTES.admin.accountingSalary, label: "Salary Register", variant: "secondary" },
        { href: ROUTES.admin.accountingStaffLedger, label: "Staff Ledger", variant: "primary" },
      ]}
      stats={[
        { label: "Claims", value: String(claims.length), tone: "info" },
        { label: "Approved", value: String(approvedCount), tone: approvedCount > 0 ? "warning" : "success" },
        { label: "Posted", value: String(postedCount), tone: "default" },
        { label: "Payments", value: String(claimPayments.length), tone: "success" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <AccountingRefreshButton
            loading={loading}
            refreshing={refreshing}
            onClick={() => void loadPage("refresh")}
          />
        </div>

        {notice ? <AccountingNotice message={notice} /> : null}
        {error ? <AccountingNotice tone="danger" message={error} /> : null}
        {loading ? <LoadingBlock label="Loading expense claims..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load expense claims"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <WorkspaceSection
                title="Create Expense Claim"
                description="Claims capture staff-side operational spending without mixing it into vendor vouchers or customer billing documents."
              >
                <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreateClaim}>
                  <label className="text-sm text-muted-foreground">
                    Staff
                    <select
                      className={accountingFieldClassName()}
                      value={claimForm.employee}
                      onChange={(event) =>
                        setClaimForm((current) => ({
                          ...current,
                          employee: event.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">Select staff</option>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.employee_code} · {employee.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Category
                    <input
                      className={accountingFieldClassName()}
                      value={claimForm.category}
                      onChange={(event) =>
                        setClaimForm((current) => ({
                          ...current,
                          category: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Claim date
                    <input
                      type="date"
                      className={accountingFieldClassName()}
                      value={claimForm.claim_date}
                      onChange={(event) =>
                        setClaimForm((current) => ({
                          ...current,
                          claim_date: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Expense date
                    <input
                      type="date"
                      className={accountingFieldClassName()}
                      value={claimForm.expense_date}
                      onChange={(event) =>
                        setClaimForm((current) => ({
                          ...current,
                          expense_date: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Expense account
                    <select
                      className={accountingFieldClassName()}
                      value={claimForm.expense_account}
                      onChange={(event) =>
                        setClaimForm((current) => ({
                          ...current,
                          expense_account: event.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">Select expense account</option>
                      {expenseAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} · {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Claimed amount
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      className={accountingFieldClassName()}
                      value={claimForm.claimed_amount}
                      onChange={(event) =>
                        setClaimForm((current) => ({
                          ...current,
                          claimed_amount: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Bill no
                    <input
                      className={accountingFieldClassName()}
                      value={claimForm.bill_no}
                      onChange={(event) =>
                        setClaimForm((current) => ({
                          ...current,
                          bill_no: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="text-sm text-muted-foreground md:col-span-2">
                    Notes
                    <textarea
                      rows={3}
                      className={accountingFieldClassName()}
                      value={claimForm.notes}
                      onChange={(event) =>
                        setClaimForm((current) => ({ ...current, notes: event.target.value }))
                      }
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:opacity-60 md:col-span-2"
                  >
                    {saving ? "Saving..." : "Create Claim"}
                  </button>
                </form>
              </WorkspaceSection>

              <WorkspaceSection
                title="Post Reimbursement"
                description="Reimbursement payment clears employee reimbursement payable into the selected finance account after the claim accrual is posted."
              >
                <form className="grid gap-3" onSubmit={handleCreatePayment}>
                  <label className="text-sm text-muted-foreground">
                    Expense claim
                    <select
                      className={accountingFieldClassName()}
                      value={paymentForm.expense_claim}
                      onChange={(event) =>
                        setPaymentForm((current) => ({
                          ...current,
                          expense_claim: event.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">Select payable claim</option>
                      {payableClaims.map((claim) => (
                        <option key={claim.id} value={claim.id}>
                          {claim.claim_no} · {claim.employee_code} · Outstanding {accountingMoney(claim.outstanding_amount)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Payment date
                    <input
                      type="date"
                      className={accountingFieldClassName()}
                      value={paymentForm.payment_date}
                      onChange={(event) =>
                        setPaymentForm((current) => ({
                          ...current,
                          payment_date: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Amount
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      className={accountingFieldClassName()}
                      value={paymentForm.amount}
                      onChange={(event) =>
                        setPaymentForm((current) => ({
                          ...current,
                          amount: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Finance account
                    <select
                      className={accountingFieldClassName()}
                      value={paymentForm.finance_account}
                      onChange={(event) =>
                        setPaymentForm((current) => ({
                          ...current,
                          finance_account: event.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">Select finance account</option>
                      {financeAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Reference no
                    <input
                      className={accountingFieldClassName()}
                      value={paymentForm.reference_no}
                      onChange={(event) =>
                        setPaymentForm((current) => ({
                          ...current,
                          reference_no: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:opacity-60"
                  >
                    {saving ? "Posting..." : "Post Reimbursement"}
                  </button>
                </form>
              </WorkspaceSection>
            </div>

            <WorkspaceSection
              title="Expense Claims Register"
              description="Draft claims are operational requests. Approved claims await accrual posting. Posted claims await reimbursement settlement."
            >
              {claims.length === 0 ? (
                <EmptyState
                  title="No expense claims yet"
                  description="Create the first claim above."
                />
              ) : (
                <div className="grid gap-3">
                  {claims.map((claim) => (
                    <div
                      key={claim.id}
                      className="rounded-[1.35rem] border border-white/80 bg-white/75 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">
                            {claim.claim_no} · {claim.employee_code} · {claim.employee_name}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {accountingDate(claim.expense_date)} • {claim.category || claim.expense_account_name} • {claim.status}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-foreground">
                            {accountingMoney(claim.approved_amount || claim.claimed_amount)}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Outstanding {accountingMoney(claim.outstanding_amount)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {claim.status === "DRAFT" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleApproveClaim(claim)}
                              className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRejectClaim(claim)}
                              className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                            >
                              Reject
                            </button>
                          </>
                        ) : null}
                        {claim.status === "APPROVED" ? (
                          <button
                            type="button"
                            onClick={() => void handlePostClaim(claim)}
                            className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95"
                          >
                            Post Accrual
                          </button>
                        ) : null}
                        {(claim.status === "POSTED" || claim.status === "PAID_PARTIAL") ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPaymentForm({
                                expense_claim: String(claim.id),
                                payment_date: today,
                                amount: claim.outstanding_amount || claim.approved_amount,
                                finance_account: "",
                                reference_no: "",
                              })
                            }
                            className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                          >
                            Prepare Payment
                          </button>
                        ) : null}
                        {claim.posted_journal_entry_no ? (
                          <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                            Journal {claim.posted_journal_entry_no}
                          </span>
                        ) : null}
                      </div>

                      {claim.notes ? (
                        <div className="mt-3 text-xs text-muted-foreground">{claim.notes}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </WorkspaceSection>

            <WorkspaceSection
              title="Reimbursement Payments"
              description="Employee reimbursement payments are separate posted events. They reduce employee reimbursement payable and appear in the staff ledger."
            >
              {claimPayments.length === 0 ? (
                <EmptyState
                  title="No reimbursement payments yet"
                  description="Payments will appear here after posted claims are settled."
                />
              ) : (
                <div className="grid gap-3">
                  {claimPayments.map((payment) => (
                    <div
                      key={payment.id}
                      className="rounded-[1.25rem] border border-white/80 bg-white/75 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">
                            {payment.expense_claim_no} · {payment.employee_code} · {payment.employee_name}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {accountingDate(payment.payment_date)} • {payment.finance_account_name} • {payment.reference_no || "No reference"}
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
              )}
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
