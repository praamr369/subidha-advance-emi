"use client";

import { useMemo, useState, type FormEvent } from "react";

import DrawerShell from "@/components/ui/DrawerShell";
import {
  AccountingNotice,
  accountingErrorMessage,
  accountingFieldClassName,
} from "@/components/accounting/shared";
import { createChartOfAccount, type ChartOfAccount } from "@/services/accounting";

type ChartAccountCreateDrawerProps = {
  open: boolean;
  chartAccounts: ChartOfAccount[];
  onClose: () => void;
  onCreated: (account: ChartOfAccount) => void | Promise<void>;
};

const ACCOUNT_TYPES: ChartOfAccount["account_type"][] = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "INCOME",
  "EXPENSE",
];

export default function ChartAccountCreateDrawer({
  open,
  chartAccounts,
  onClose,
  onCreated,
}: ChartAccountCreateDrawerProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<ChartOfAccount["account_type"]>("ASSET");
  const [parentId, setParentId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [allowManualPosting, setAllowManualPosting] = useState(true);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parentOptions = useMemo(
    () => chartAccounts.filter((a) => a.account_type === accountType && a.is_active),
    [chartAccounts, accountType]
  );

  function reset() {
    setCode("");
    setName("");
    setAccountType("ASSET");
    setParentId("");
    setIsActive(true);
    setAllowManualPosting(true);
    setNotes("");
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await createChartOfAccount({
        code: code.trim() ? code.trim() : undefined,
        name: name.trim(),
        account_type: accountType,
        parent: parentId ? Number(parentId) : null,
        is_active: isActive,
        allow_manual_posting: allowManualPosting,
        notes: notes.trim() || undefined,
      });
      reset();
      await onCreated(created);
      onClose();
    } catch (err) {
      setError(accountingErrorMessage(err, "Could not create chart account."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerShell
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Create chart account"
      description="Manual accounts never receive a protected system code. Codes are optional; leave blank for an auto-generated code. Parent must match the selected account type."
      size="default"
      footer={
        <div className="flex w-full justify-end gap-2">
          <button
            type="button"
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="chart-account-create-form"
            disabled={submitting || !name.trim()}
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create account"}
          </button>
        </div>
      }
    >
      <form
        id="chart-account-create-form"
        data-testid="chart-account-create-form"
        className="space-y-4"
        onSubmit={(e) => void handleSubmit(e)}
      >
        {error ? <AccountingNotice tone="danger" message={error} /> : null}
        <label className="block text-sm text-muted-foreground">
          Code
          <input
            className={accountingFieldClassName()}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Optional — auto-generated if empty"
            autoComplete="off"
          />
        </label>
        <label className="block text-sm text-muted-foreground">
          Name
          <input
            className={accountingFieldClassName()}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Local petty cash"
          />
        </label>
        <label className="block text-sm text-muted-foreground">
          Account type
          <select
            className={accountingFieldClassName()}
            value={accountType}
            onChange={(e) => {
              setAccountType(e.target.value as ChartOfAccount["account_type"]);
              setParentId("");
            }}
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-muted-foreground">
          Parent (optional)
          <select
            className={accountingFieldClassName()}
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">No parent (root)</option>
            {parentOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-muted-foreground">
          Notes
          <textarea
            rows={3}
            className={accountingFieldClassName()}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal notes (optional)"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={allowManualPosting}
            onChange={(e) => setAllowManualPosting(e.target.checked)}
          />
          Allow manual journal posting to this account
        </label>
      </form>
    </DrawerShell>
  );
}
