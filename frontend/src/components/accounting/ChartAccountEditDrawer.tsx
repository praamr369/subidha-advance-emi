"use client";

import { CircleOff, Lock, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import DrawerShell from "@/components/ui/DrawerShell";
import {
  AccountingNotice,
  accountingErrorMessage,
  accountingFieldClassName,
} from "@/components/accounting/shared";
import {
  getChartOfAccount,
  updateChartOfAccount,
  type ChartOfAccount,
  type ChartOfAccountDetail,
} from "@/services/accounting";

type ChartAccountEditDrawerProps = {
  accountId: number | null;
  open: boolean;
  chartAccounts: ChartOfAccount[];
  onClose: () => void;
  onSaved: (account: ChartOfAccountDetail) => void | Promise<void>;
};

type ChartAccountFormState = {
  name: string;
  parent: string;
  allow_manual_posting: boolean;
  is_active: boolean;
  notes: string;
};

function emptyForm(): ChartAccountFormState {
  return {
    name: "",
    parent: "",
    allow_manual_posting: true,
    is_active: true,
    notes: "",
  };
}

function isEditable(detail: ChartOfAccountDetail | null, field: string): boolean {
  return Boolean(detail?.editability?.editable_fields?.includes(field));
}

function lockReason(detail: ChartOfAccountDetail | null, field: string): string | null {
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

export default function ChartAccountEditDrawer({
  accountId,
  open,
  chartAccounts,
  onClose,
  onSaved,
}: ChartAccountEditDrawerProps) {
  const [detail, setDetail] = useState<ChartOfAccountDetail | null>(null);
  const [form, setForm] = useState<ChartAccountFormState>(emptyForm());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextAccountId = accountId;
    if (!open || nextAccountId === null) {
      setDetail(null);
      setForm(emptyForm());
      setLoading(false);
      setSaving(false);
      setError(null);
      return;
    }
    const resolvedAccountId = nextAccountId;

    let cancelled = false;

    async function loadDetail() {
      setLoading(true);
      setError(null);
      try {
        const payload = await getChartOfAccount(resolvedAccountId);
        if (cancelled) return;
        setDetail(payload);
        setForm({
          name: payload.name || "",
          parent: payload.parent ? String(payload.parent) : "",
          allow_manual_posting: Boolean(payload.allow_manual_posting),
          is_active: Boolean(payload.is_active),
          notes: payload.notes || "",
        });
      } catch (err) {
        if (cancelled) return;
        setError(accountingErrorMessage(err, "Failed to load chart account detail."));
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
    try {
      const payload: Partial<ChartOfAccount> = {
        name: form.name,
        notes: form.notes,
      };

      if (isEditable(detail, "parent")) {
        payload.parent = form.parent ? Number(form.parent) : null;
      }
      if (isEditable(detail, "allow_manual_posting")) {
        payload.allow_manual_posting = form.allow_manual_posting;
      }
      if (isEditable(detail, "is_active")) {
        payload.is_active = form.is_active;
      }

      const updated = await updateChartOfAccount(accountId, payload);
      setDetail(updated);
      await onSaved(updated);
      onClose();
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to update chart account."));
    } finally {
      setSaving(false);
    }
  }

  const filteredParentOptions = chartAccounts.filter((account) => account.id !== accountId);

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      title={detail ? `${detail.code} · ${detail.name}` : "Edit chart account"}
      description="Safe edits stay available, while structural fields lock automatically once postings, finance links, or child accounts exist."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {detail?.editability.can_deactivate
              ? "Unused accounts can be archived by disabling Active."
              : detail?.editability.deactivate_reason || "Dangerous structural edits stay locked."}
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
              disabled={loading || saving || !detail}
              className="rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:bg-foreground/90 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {error ? <AccountingNotice tone="danger" message={error} /> : null}
        {loading ? <div className="text-sm text-muted-foreground">Loading account detail...</div> : null}

        {!loading && detail ? (
          <>
            <div className="flex flex-wrap gap-2">
              {detail.system_code ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  System account
                </span>
              ) : null}
              {detail.editability.usage_summary?.is_used ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                  <Lock className="h-3.5 w-3.5" />
                  Used account
                </span>
              ) : null}
              {!detail.is_active ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                  <CircleOff className="h-3.5 w-3.5" />
                  Inactive
                </span>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-muted-foreground">
                Code
                <input className={accountingFieldClassName()} value={detail.code} disabled />
                <FieldLockHint reason={lockReason(detail, "code")} />
              </label>

              <label className="text-sm text-muted-foreground">
                Account type
                <input className={accountingFieldClassName()} value={detail.account_type} disabled />
                <FieldLockHint reason={lockReason(detail, "account_type")} />
              </label>

              <label className="text-sm text-muted-foreground">
                Name
                <input
                  className={accountingFieldClassName()}
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="text-sm text-muted-foreground">
                Parent
                <select
                  className={accountingFieldClassName()}
                  value={form.parent}
                  disabled={!isEditable(detail, "parent")}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      parent: event.target.value,
                    }))
                  }
                >
                  <option value="">Root account</option>
                  {filteredParentOptions.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} · {account.name}
                    </option>
                  ))}
                </select>
                <FieldLockHint reason={lockReason(detail, "parent")} />
              </label>

              <label className="text-sm text-muted-foreground">
                System code
                <input
                  className={accountingFieldClassName()}
                  value={detail.system_code || "—"}
                  disabled
                />
                <FieldLockHint reason={lockReason(detail, "system_code")} />
              </label>

              <div className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Structure
                </div>
                <div className="mt-3 grid gap-2 text-sm text-foreground">
                  <div>Children: {detail.child_count || 0}</div>
                  <div>Linked finance accounts: {detail.finance_account_count || 0}</div>
                  <div>Parent label: {detail.parent_code ? `${detail.parent_code} · ${detail.parent_name || "—"}` : "Root account"}</div>
                </div>
              </div>

              <label className="text-sm text-muted-foreground md:col-span-2">
                Notes
                <textarea
                  rows={4}
                  className={accountingFieldClassName()}
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="grid gap-3 rounded-xl border border-border bg-[var(--surface-card-elevated)] p-4">
              <label className="flex items-start gap-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-border"
                  checked={form.allow_manual_posting}
                  disabled={!isEditable(detail, "allow_manual_posting")}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      allow_manual_posting: event.target.checked,
                    }))
                  }
                />
                <span>
                  <span className="block font-medium">Allow manual posting</span>
                  <span className="block text-muted-foreground">
                    Toggle only while the account is still structurally unused.
                  </span>
                  <FieldLockHint reason={lockReason(detail, "allow_manual_posting")} />
                </span>
              </label>

              <label className="flex items-start gap-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-border"
                  checked={form.is_active}
                  disabled={!isEditable(detail, "is_active")}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      is_active: event.target.checked,
                    }))
                  }
                />
                <span>
                  <span className="block font-medium">Active</span>
                  <span className="block text-muted-foreground">
                    Deactivation is only allowed when the account is unused and not system-required.
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
