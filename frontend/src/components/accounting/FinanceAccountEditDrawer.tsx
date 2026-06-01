"use client";

import { CircleOff, Landmark, Lock, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

import DrawerShell from "@/components/ui/DrawerShell";
import {
  AccountingNotice,
  accountingErrorMessage,
  accountingFieldClassName,
  accountingMoney,
} from "@/components/accounting/shared";
import {
  getFinanceAccount,
  updateFinanceAccount,
  type ChartOfAccount,
  type FinanceAccount,
  type FinanceAccountDetail,
} from "@/services/accounting";
import { updateFinanceAccountMapping } from "@/services/accounting-setup";

type FinanceAccountEditDrawerProps = {
  accountId: number | null;
  open: boolean;
  chartAccounts: ChartOfAccount[];
  onClose: () => void;
  onSaved: (account: FinanceAccountDetail) => void | Promise<void>;
};

type FinanceAccountFormState = {
  name: string;
  kind: FinanceAccount["kind"];
  chart_account: string;
  opening_balance: string;
  bank_last4: string;
  upi_handle: string;
  is_active: boolean;
  notes: string;
};

function emptyForm(): FinanceAccountFormState {
  return {
    name: "",
    kind: "CASH",
    chart_account: "",
    opening_balance: "0.00",
    bank_last4: "",
    upi_handle: "",
    is_active: true,
    notes: "",
  };
}

function isEditable(detail: FinanceAccountDetail | null, field: string): boolean {
  return Boolean(detail?.editability?.editable_fields?.includes(field));
}

function lockReason(detail: FinanceAccountDetail | null, field: string): string | null {
  return detail?.editability?.locked_fields?.[field] ?? null;
}

function FieldLockHint({ reason }: { reason?: string | null }) {
  if (!reason) return null;
  return (
    <div className="mt-2 flex items-start gap-2 text-xs text-amber-700">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{reason}</span>
    </div>
  );
}

export default function FinanceAccountEditDrawer({
  accountId,
  open,
  chartAccounts,
  onClose,
  onSaved,
}: FinanceAccountEditDrawerProps) {
  const [detail, setDetail] = useState<FinanceAccountDetail | null>(null);
  const [form, setForm] = useState<FinanceAccountFormState>(emptyForm());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const nextAccountId = accountId;
    if (!open || nextAccountId === null) {
      setDetail(null);
      setForm(emptyForm());
      setLoading(false);
      setSaving(false);
      setRepairing(false);
      setError(null);
      setNotice(null);
      return;
    }
    const resolvedAccountId = nextAccountId;

    let cancelled = false;

    async function loadDetail() {
      setLoading(true);
      setError(null);
      setNotice(null);
      try {
        const payload = await getFinanceAccount(resolvedAccountId);
        if (cancelled) return;
        setDetail(payload);
        setForm({
          name: payload.name || "",
          kind: payload.kind,
          chart_account: payload.chart_account ? String(payload.chart_account) : "",
          opening_balance: payload.opening_balance || "0.00",
          bank_last4: payload.bank_last4 || "",
          upi_handle: payload.upi_handle || "",
          is_active: Boolean(payload.is_active),
          notes: payload.notes || "",
        });
      } catch (err) {
        if (cancelled) return;
        setError(accountingErrorMessage(err, "Failed to load finance account detail."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [accountId, open]);

  async function handleSave() {
    if (!accountId || !detail) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload: Partial<FinanceAccount> = {
        name: form.name,
        bank_last4: form.bank_last4,
        upi_handle: form.upi_handle,
        notes: form.notes,
      };

      if (isEditable(detail, "kind")) {
        payload.kind = form.kind;
      }
      if (isEditable(detail, "chart_account")) {
        payload.chart_account = Number(form.chart_account);
      }
      if (isEditable(detail, "opening_balance")) {
        payload.opening_balance = form.opening_balance;
      }
      if (isEditable(detail, "is_active")) {
        payload.is_active = form.is_active;
      }

      const updated = await updateFinanceAccount(accountId, payload);
      setDetail(updated);
      await onSaved(updated);
      onClose();
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to update finance account."));
    } finally {
      setSaving(false);
    }
  }

  async function handleAutoRepairCollectionMapping() {
    if (!accountId) return;
    setRepairing(true);
    setError(null);
    setNotice(null);
    try {
      await updateFinanceAccountMapping(accountId, { auto_create_posting_account: true });
      const refreshed = await getFinanceAccount(accountId);
      setDetail(refreshed);
      setForm((current) => ({
        ...current,
        chart_account: refreshed.chart_account ? String(refreshed.chart_account) : current.chart_account,
      }));
      setNotice("Finance account remapped to a posting-enabled ASSET leaf account. No payments, receipts, journals, settlements, or reconciliation rows were changed.");
      await onSaved(refreshed);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to repair collection mapping."));
    } finally {
      setRepairing(false);
    }
  }

  const assetChartAccounts = chartAccounts.filter((account) => account.account_type === "ASSET" && account.is_active);
  const canAutoRepair = Boolean(
    detail &&
      !detail.collection_ready &&
      detail.is_active &&
      detail.chart_account &&
      detail.mapped_chart_account_type === "ASSET"
  );

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      title={detail ? detail.name : "Edit finance account"}
      description="Operational finance accounts can change only while they are still unused. Once counters, billing, or accounting usage exists, structural fields are locked."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {detail?.editability.can_deactivate
              ? "Archive by disabling Active only while the account is unused."
              : detail?.editability.deactivate_reason || "Used finance accounts stay structurally locked."}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={loading || saving || repairing || !detail}
              className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {error ? <AccountingNotice tone="danger" message={error} /> : null}
        {notice ? <AccountingNotice tone="success" message={notice} /> : null}
        {loading ? <div className="text-sm text-muted-foreground">Loading finance account detail...</div> : null}

        {!loading && detail ? (
          <>
            <div className="flex flex-wrap gap-2">
              {detail.editability.usage_summary?.is_used ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                  <Lock className="h-3.5 w-3.5" />
                  Used account
                </span>
              ) : null}
              {!detail.is_active ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  <CircleOff className="h-3.5 w-3.5" />
                  Inactive
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900">
                <Wallet className="h-3.5 w-3.5" />
                {detail.kind}
              </span>
              {detail.collection_ready ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                  Collection ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                  Collection mapping needs setup
                </span>
              )}
            </div>

            {!detail.collection_ready ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                <div className="font-semibold">Collection selector warning</div>
                <p className="mt-1">{detail.collection_blocker_reason || "This finance account is not ready for cashier/admin collection selectors."}</p>
                <p className="mt-1 text-xs text-amber-900">
                  {detail.recommended_action || "Map this finance account to an active posting-enabled leaf ASSET chart account."}
                </p>
                {canAutoRepair ? (
                  <button
                    type="button"
                    onClick={() => void handleAutoRepairCollectionMapping()}
                    disabled={repairing || saving}
                    className="mt-3 rounded-xl bg-amber-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-950 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {repairing ? "Repairing..." : "Create posting leaf & remap safely"}
                  </button>
                ) : null}
                <p className="mt-2 text-[11px] text-amber-900">
                  Repair changes only this finance-account chart mapping and may create a child ASSET posting account. It does not post payments, receipts, journals, settlements, day-close, or reconciliation records.
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-muted-foreground">
                Name
                <input
                  className={accountingFieldClassName()}
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
              </label>

              <label className="text-sm text-muted-foreground">
                Kind
                <select
                  className={accountingFieldClassName()}
                  value={form.kind}
                  disabled={!isEditable(detail, "kind")}
                  onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as FinanceAccount["kind"] }))}
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK">Bank</option>
                  <option value="UPI">UPI</option>
                </select>
                <FieldLockHint reason={lockReason(detail, "kind")} />
              </label>

              <label className="text-sm text-muted-foreground">
                Linked chart account
                <select
                  className={accountingFieldClassName()}
                  value={form.chart_account}
                  disabled={!isEditable(detail, "chart_account")}
                  onChange={(event) => setForm((current) => ({ ...current, chart_account: event.target.value }))}
                >
                  <option value="">Select active asset account</option>
                  {assetChartAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} · {account.name}
                    </option>
                  ))}
                </select>
                <FieldLockHint reason={lockReason(detail, "chart_account")} />
              </label>

              <label className="text-sm text-muted-foreground">
                Opening balance
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={accountingFieldClassName()}
                  value={form.opening_balance}
                  disabled={!isEditable(detail, "opening_balance")}
                  onChange={(event) => setForm((current) => ({ ...current, opening_balance: event.target.value }))}
                />
                <FieldLockHint reason={lockReason(detail, "opening_balance")} />
              </label>

              <label className="text-sm text-muted-foreground">
                Bank last 4
                <input
                  maxLength={4}
                  className={accountingFieldClassName()}
                  value={form.bank_last4}
                  onChange={(event) => setForm((current) => ({ ...current, bank_last4: event.target.value }))}
                />
              </label>

              <label className="text-sm text-muted-foreground">
                UPI handle
                <input
                  className={accountingFieldClassName()}
                  value={form.upi_handle}
                  onChange={(event) => setForm((current) => ({ ...current, upi_handle: event.target.value }))}
                />
              </label>

              <div className="rounded-2xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <Landmark className="h-3.5 w-3.5" />
                  Usage posture
                </div>
                <div className="mt-3 grid gap-2 text-sm text-foreground">
                  <div>Branch: {detail.branch_code || detail.branch_name || "Primary default"}</div>
                  <div>Linked chart: {detail.chart_account_code || "—"} · {detail.chart_account_name || "—"}</div>
                  <div>Opening balance: {accountingMoney(detail.opening_balance)}</div>
                </div>
              </div>

              <label className="text-sm text-muted-foreground md:col-span-2">
                Notes
                <textarea
                  rows={4}
                  className={accountingFieldClassName()}
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                />
              </label>
            </div>

            <div className="rounded-2xl border border-border bg-[var(--surface-card-elevated)] p-4">
              <label className="flex items-start gap-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-border"
                  checked={form.is_active}
                  disabled={!isEditable(detail, "is_active")}
                  onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
                />
                <span>
                  <span className="block font-medium">Active</span>
                  <span className="block text-muted-foreground">
                    Deactivation is blocked once counters, books, payouts, or posted history depend on this account.
                  </span>
                  <FieldLockHint reason={lockReason(detail, "is_active")} />
                </span>
              </label>
            </div>
          </>
        ) : null}
      </div>
    </DrawerShell>
  );
}
