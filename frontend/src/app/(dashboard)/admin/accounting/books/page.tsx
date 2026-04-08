"use client";

import { useEffect, useState, type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  createMoneyMovement,
  listFinanceAccounts,
  listMoneyMovements,
  postMoneyMovement,
  type FinanceAccount,
  type MoneyMovement,
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
  return "Failed to load books and money movements.";
}

function fieldClassName() {
  return "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground";
}

export default function AccountingBooksPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);
  const [moneyMovements, setMoneyMovements] = useState<MoneyMovement[]>([]);
  const [movementForm, setMovementForm] = useState({
    movement_date: new Date().toISOString().slice(0, 10),
    from_finance_account: "",
    to_finance_account: "",
    amount: "0.00",
    reference_no: "",
    notes: "",
  });

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [financePayload, movementPayload] = await Promise.all([
        listFinanceAccounts(),
        listMoneyMovements(),
      ]);
      setFinanceAccounts(financePayload.results);
      setMoneyMovements(movementPayload.results);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") {
        setFinanceAccounts([]);
        setMoneyMovements([]);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  async function handleCreateMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createMoneyMovement({
        movement_date: movementForm.movement_date,
        from_finance_account: Number(movementForm.from_finance_account),
        to_finance_account: Number(movementForm.to_finance_account),
        amount: movementForm.amount,
        reference_no: movementForm.reference_no,
        notes: movementForm.notes,
      });
      setMovementForm({
        movement_date: new Date().toISOString().slice(0, 10),
        from_finance_account: "",
        to_finance_account: "",
        amount: "0.00",
        reference_no: "",
        notes: "",
      });
      setNotice("Money movement created.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(toErrorMessage(err));
    }
  }

  async function handlePostMovement(id: number) {
    try {
      await postMoneyMovement(id);
      setNotice("Money movement posted.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(toErrorMessage(err));
    }
  }

  const postedCount = moneyMovements.filter((item) => item.status === "POSTED").length;

  return (
    <PortalPage
      title="Books"
      subtitle="Track finance accounts and inter-account money movement inside the accounting module, separate from store-level EMI collection records."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Books" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingChartOfAccounts, label: "Chart Setup", variant: "secondary" },
        { href: ROUTES.admin.accountingJournals, label: "Journals", variant: "secondary" },
      ]}
      stats={[
        { label: "Finance Accounts", value: String(financeAccounts.length), tone: "info" },
        { label: "Money Movements", value: String(moneyMovements.length) },
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

        {loading ? <LoadingBlock label="Loading books..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load books"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <WorkspaceSection
                title="Finance accounts"
                description="Operational finance accounts mapped to asset chart accounts. These are the source and destination controls for money movement posting."
              >
                {financeAccounts.length === 0 ? (
                  <EmptyState
                    title="No finance accounts yet"
                    description="Create finance accounts in chart setup before recording money movements."
                  />
                ) : (
                  <div className="grid gap-3">
                    {financeAccounts.map((account) => (
                      <div
                        key={account.id}
                        className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-foreground">
                              {account.name}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {account.kind} • {account.chart_account_code} • {account.chart_account_name}
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-foreground">
                            {money(account.opening_balance)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </WorkspaceSection>

              <WorkspaceSection
                title="Create money movement"
                description="Transfer value between finance accounts. Posting remains explicit so no duplicate bridge or transfer journal is created."
              >
                <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreateMovement}>
                  <label className="text-sm text-muted-foreground">
                    Movement date
                    <input
                      className={fieldClassName()}
                      type="date"
                      value={movementForm.movement_date}
                      onChange={(event) =>
                        setMovementForm((current) => ({
                          ...current,
                          movement_date: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Amount
                    <input
                      className={fieldClassName()}
                      type="number"
                      min="0"
                      step="0.01"
                      value={movementForm.amount}
                      onChange={(event) =>
                        setMovementForm((current) => ({
                          ...current,
                          amount: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    From account
                    <select
                      className={fieldClassName()}
                      value={movementForm.from_finance_account}
                      onChange={(event) =>
                        setMovementForm((current) => ({
                          ...current,
                          from_finance_account: event.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">Select source</option>
                      {financeAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-muted-foreground">
                    To account
                    <select
                      className={fieldClassName()}
                      value={movementForm.to_finance_account}
                      onChange={(event) =>
                        setMovementForm((current) => ({
                          ...current,
                          to_finance_account: event.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">Select destination</option>
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
                      className={fieldClassName()}
                      value={movementForm.reference_no}
                      onChange={(event) =>
                        setMovementForm((current) => ({
                          ...current,
                          reference_no: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="text-sm text-muted-foreground md:col-span-2">
                    Notes
                    <textarea
                      className={fieldClassName()}
                      value={movementForm.notes}
                      onChange={(event) =>
                        setMovementForm((current) => ({
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
                      Create movement
                    </button>
                  </div>
                </form>
              </WorkspaceSection>
            </div>

            <WorkspaceSection
              title="Money movement register"
              description="Draft transfers stay editable until posted. Posted rows expose the journal number generated by the accounting service."
            >
              {moneyMovements.length === 0 ? (
                <EmptyState
                  title="No money movements yet"
                  description="Create a movement above to transfer value between finance accounts."
                />
              ) : (
                <div className="grid gap-3">
                  {moneyMovements.map((movement) => (
                    <div
                      key={movement.id}
                      className="rounded-[1.4rem] border border-white/80 bg-white/75 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">
                            {movement.movement_no}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {movement.from_finance_account_name} → {movement.to_finance_account_name} • {formatDate(movement.movement_date)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-foreground">
                            {money(movement.amount)}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {movement.status}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {movement.status === "DRAFT" ? (
                          <button
                            type="button"
                            onClick={() => void handlePostMovement(movement.id)}
                            className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                          >
                            Post
                          </button>
                        ) : null}
                        {movement.posted_journal_entry_no ? (
                          <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                            Journal {movement.posted_journal_entry_no}
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
