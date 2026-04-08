"use client";

import { useEffect, useState, type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  approveExpenseVoucher,
  createExpenseVoucher,
  createVendor,
  listChartOfAccounts,
  listExpenses,
  listFinanceAccounts,
  listVendors,
  postExpenseVoucher,
  type ChartOfAccount,
  type ExpenseVoucher,
  type FinanceAccount,
  type Vendor,
} from "@/services/accounting";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Failed to load expense register.";
}

function fieldClassName() {
  return "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground";
}

export default function AccountingExpensesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [expenses, setExpenses] = useState<ExpenseVoucher[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<ChartOfAccount[]>([]);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);

  const [vendorForm, setVendorForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
  });
  const [expenseForm, setExpenseForm] = useState({
    expense_date: new Date().toISOString().slice(0, 10),
    vendor: "",
    expense_account: "",
    gross_amount: "0.00",
    tax_amount: "0.00",
    net_amount: "0.00",
    payment_mode: "CASH",
    finance_account: "",
    bill_no: "",
    bill_date: "",
    notes: "",
  });

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [vendorsPayload, expensesPayload, chartPayload, financePayload] =
        await Promise.all([
          listVendors(),
          listExpenses(),
          listChartOfAccounts(),
          listFinanceAccounts(),
        ]);

      setVendors(vendorsPayload.results);
      setExpenses(expensesPayload.results);
      setExpenseAccounts(
        chartPayload.results.filter((account) => account.account_type === "EXPENSE")
      );
      setFinanceAccounts(financePayload.results);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") {
        setVendors([]);
        setExpenses([]);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  async function handleCreateVendor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createVendor(vendorForm);
      setVendorForm({ name: "", phone: "", email: "", address: "" });
      setNotice("Vendor created.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(toErrorMessage(err));
    }
  }

  async function handleCreateExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createExpenseVoucher({
        expense_date: expenseForm.expense_date,
        vendor: expenseForm.vendor ? Number(expenseForm.vendor) : null,
        expense_account: Number(expenseForm.expense_account),
        gross_amount: expenseForm.gross_amount,
        tax_amount: expenseForm.tax_amount,
        net_amount: expenseForm.net_amount,
        payment_mode: expenseForm.payment_mode as ExpenseVoucher["payment_mode"],
        finance_account: expenseForm.finance_account
          ? Number(expenseForm.finance_account)
          : null,
        bill_no: expenseForm.bill_no,
        bill_date: expenseForm.bill_date || null,
        notes: expenseForm.notes,
      });
      setExpenseForm({
        expense_date: new Date().toISOString().slice(0, 10),
        vendor: "",
        expense_account: "",
        gross_amount: "0.00",
        tax_amount: "0.00",
        net_amount: "0.00",
        payment_mode: "CASH",
        finance_account: "",
        bill_no: "",
        bill_date: "",
        notes: "",
      });
      setNotice("Expense voucher created.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(toErrorMessage(err));
    }
  }

  async function handleApproveExpense(id: number) {
    try {
      await approveExpenseVoucher(id);
      setNotice("Expense voucher approved.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(toErrorMessage(err));
    }
  }

  async function handlePostExpense(id: number) {
    try {
      await postExpenseVoucher(id);
      setNotice("Expense voucher posted.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(toErrorMessage(err));
    }
  }

  const approvedCount = expenses.filter((item) => item.status === "APPROVED").length;
  const postedCount = expenses.filter((item) => item.status === "POSTED").length;

  return (
    <PortalPage
      title="Expenses"
      subtitle="Vendor-side expense vouchers move from draft to approved to posted through the new accounting books, without mutating EMI payment history."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Expenses" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingChartOfAccounts, label: "Chart Setup", variant: "secondary" },
        { href: ROUTES.admin.accountingJournals, label: "Journals", variant: "secondary" },
      ]}
      stats={[
        { label: "Vendors", value: String(vendors.length), tone: "info" },
        { label: "Expense Vouchers", value: String(expenses.length) },
        { label: "Approved", value: String(approvedCount), tone: approvedCount > 0 ? "warning" : "success" },
        { label: "Posted", value: String(postedCount), tone: "success" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={refreshing || loading}
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {notice ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {notice}
          </div>
        ) : null}

        {loading ? <LoadingBlock label="Loading expenses..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load expenses"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <WorkspaceSection
                title="Create vendor"
                description="Vendor master data stays separate from expense vouchers so GST and billing particulars can expand later without changing voucher history."
              >
                <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreateVendor}>
                  <label className="text-sm text-muted-foreground">
                    Name
                    <input
                      className={fieldClassName()}
                      value={vendorForm.name}
                      onChange={(event) =>
                        setVendorForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Phone
                    <input
                      className={fieldClassName()}
                      value={vendorForm.phone}
                      onChange={(event) =>
                        setVendorForm((current) => ({
                          ...current,
                          phone: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="text-sm text-muted-foreground md:col-span-2">
                    Email
                    <input
                      className={fieldClassName()}
                      type="email"
                      value={vendorForm.email}
                      onChange={(event) =>
                        setVendorForm((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="text-sm text-muted-foreground md:col-span-2">
                    Address
                    <textarea
                      className={fieldClassName()}
                      value={vendorForm.address}
                      onChange={(event) =>
                        setVendorForm((current) => ({
                          ...current,
                          address: event.target.value,
                        }))
                      }
                      rows={3}
                    />
                  </label>
                  <div className="md:col-span-2">
                    <button
                      type="submit"
                      className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                    >
                      Create vendor
                    </button>
                  </div>
                </form>
              </WorkspaceSection>

              <WorkspaceSection
                title="Create expense voucher"
                description="Expense vouchers stay draft until approval and posting. Net amount is what reaches the accounting journal in this phase."
              >
                <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreateExpense}>
                  <label className="text-sm text-muted-foreground">
                    Expense date
                    <input
                      className={fieldClassName()}
                      type="date"
                      value={expenseForm.expense_date}
                      onChange={(event) =>
                        setExpenseForm((current) => ({
                          ...current,
                          expense_date: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Vendor
                    <select
                      className={fieldClassName()}
                      value={expenseForm.vendor}
                      onChange={(event) =>
                        setExpenseForm((current) => ({
                          ...current,
                          vendor: event.target.value,
                        }))
                      }
                    >
                      <option value="">No vendor</option>
                      {vendors.map((vendor) => (
                        <option key={vendor.id} value={vendor.id}>
                          {vendor.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Expense account
                    <select
                      className={fieldClassName()}
                      value={expenseForm.expense_account}
                      onChange={(event) =>
                        setExpenseForm((current) => ({
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
                    Finance account
                    <select
                      className={fieldClassName()}
                      value={expenseForm.finance_account}
                      onChange={(event) =>
                        setExpenseForm((current) => ({
                          ...current,
                          finance_account: event.target.value,
                        }))
                      }
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
                    Gross amount
                    <input
                      className={fieldClassName()}
                      type="number"
                      min="0"
                      step="0.01"
                      value={expenseForm.gross_amount}
                      onChange={(event) =>
                        setExpenseForm((current) => ({
                          ...current,
                          gross_amount: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Tax amount
                    <input
                      className={fieldClassName()}
                      type="number"
                      min="0"
                      step="0.01"
                      value={expenseForm.tax_amount}
                      onChange={(event) =>
                        setExpenseForm((current) => ({
                          ...current,
                          tax_amount: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Net amount
                    <input
                      className={fieldClassName()}
                      type="number"
                      min="0"
                      step="0.01"
                      value={expenseForm.net_amount}
                      onChange={(event) =>
                        setExpenseForm((current) => ({
                          ...current,
                          net_amount: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Payment mode
                    <select
                      className={fieldClassName()}
                      value={expenseForm.payment_mode}
                      onChange={(event) =>
                        setExpenseForm((current) => ({
                          ...current,
                          payment_mode: event.target.value,
                        }))
                      }
                    >
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="BANK">Bank</option>
                    </select>
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Bill no
                    <input
                      className={fieldClassName()}
                      value={expenseForm.bill_no}
                      onChange={(event) =>
                        setExpenseForm((current) => ({
                          ...current,
                          bill_no: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Bill date
                    <input
                      className={fieldClassName()}
                      type="date"
                      value={expenseForm.bill_date}
                      onChange={(event) =>
                        setExpenseForm((current) => ({
                          ...current,
                          bill_date: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="text-sm text-muted-foreground md:col-span-2">
                    Notes
                    <textarea
                      className={fieldClassName()}
                      value={expenseForm.notes}
                      onChange={(event) =>
                        setExpenseForm((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      rows={3}
                    />
                  </label>
                  <div className="md:col-span-2">
                    <button
                      type="submit"
                      className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                    >
                      Create expense voucher
                    </button>
                  </div>
                </form>
              </WorkspaceSection>
            </div>

            <WorkspaceSection
              title="Expense vouchers"
              description="Approval and posting remain explicit. Posted vouchers hold the journal entry reference generated by the accounting module."
            >
              {expenses.length === 0 ? (
                <EmptyState
                  title="No expense vouchers yet"
                  description="Create the first vendor voucher above to start the expense register."
                />
              ) : (
                <div className="grid gap-3">
                  {expenses.map((expense) => (
                    <div
                      key={expense.id}
                      className="rounded-[1.4rem] border border-white/80 bg-white/75 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">
                            {expense.voucher_no}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {expense.vendor_name || "No vendor"} • {expense.expense_account_code} • {expense.payment_mode}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-foreground">
                            {money(expense.net_amount)}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {expense.status} • {formatDate(expense.expense_date)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {expense.status === "DRAFT" ? (
                          <button
                            type="button"
                            onClick={() => void handleApproveExpense(expense.id)}
                            className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                          >
                            Approve
                          </button>
                        ) : null}
                        {expense.status === "APPROVED" ? (
                          <button
                            type="button"
                            onClick={() => void handlePostExpense(expense.id)}
                            className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                          >
                            Post
                          </button>
                        ) : null}
                        {expense.posted_journal_entry_no ? (
                          <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                            Journal {expense.posted_journal_entry_no}
                          </span>
                        ) : null}
                      </div>
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
