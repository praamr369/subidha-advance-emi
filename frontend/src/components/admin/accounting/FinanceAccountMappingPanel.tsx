"use client";

import ActionButton from "@/components/ui/ActionButton";
import ChartAccountPostingBadge from "@/components/admin/accounting/ChartAccountPostingBadge";
import FinanceAccountReadinessBadge from "@/components/admin/accounting/FinanceAccountReadinessBadge";
import type {
  AccountingSetupReadinessChartAccount,
  AccountingSetupReadinessFinanceAccount,
} from "@/services/accounting-setup";

type FinanceAccountMappingPanelProps = {
  financeAccounts: AccountingSetupReadinessFinanceAccount[];
  chartAccounts: AccountingSetupReadinessChartAccount[];
  saving?: boolean;
  editingId?: number | null;
  repairId?: number | null;
  selectedChartAccountId?: string;
  onEdit: (financeAccount: AccountingSetupReadinessFinanceAccount) => void;
  onCancelEdit: () => void;
  onChartAccountChange: (chartAccountId: string) => void;
  onSave: () => void;
  onRepair?: (financeAccount: AccountingSetupReadinessFinanceAccount) => void;
  onRepairAll?: (financeAccounts: AccountingSetupReadinessFinanceAccount[]) => void;
};

function paymentMethodLabel(kind: string): string {
  if (kind === "CASH") return "Cash";
  if (kind === "BANK") return "Bank";
  if (kind === "UPI") return "UPI";
  return kind || "-";
}

function chartLabel(account?: AccountingSetupReadinessChartAccount | null): string {
  if (!account) return "Create posting leaf below current group/control account";
  const parent = account.parent?.code ? ` under ${account.parent.code}` : "";
  return `${account.code} · ${account.name}${parent}`;
}

function isPostingChartAccount(account: AccountingSetupReadinessChartAccount): boolean {
  return Boolean(account.is_posting || account.is_posting_ready || account.allowed_for_collection);
}

function isSelectableCollectionAccount(account: AccountingSetupReadinessFinanceAccount): boolean {
  return Boolean(account.selectable_for_collection || account.is_selectable_collection_account || account.collection_ready);
}

function canRepairCollectionMapping(account: AccountingSetupReadinessFinanceAccount): boolean {
  return Boolean(account.can_auto_create_posting_account && !isSelectableCollectionAccount(account) && !account.diagnostic_only);
}

export default function FinanceAccountMappingPanel({
  financeAccounts,
  chartAccounts,
  saving,
  editingId,
  repairId,
  selectedChartAccountId,
  onEdit,
  onCancelEdit,
  onChartAccountChange,
  onSave,
  onRepair,
  onRepairAll,
}: FinanceAccountMappingPanelProps) {
  const postingChartAccounts = chartAccounts.filter(isPostingChartAccount);
  const repairableAccounts = financeAccounts.filter(canRepairCollectionMapping);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">Business Finance Accounts</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Finance Accounts are where money is received or paid. Collection accounts must map to active posting-enabled leaf ASSET accounts.
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ActionButton
            size="sm"
            variant="primary"
            onClick={() => onRepairAll?.(repairableAccounts)}
            disabled={saving || repairableAccounts.length === 0 || Boolean(repairId)}
          >
            {repairId ? "Repairing..." : `Repair all blocked (${repairableAccounts.length})`}
          </ActionButton>
          <div className="text-xs text-muted-foreground">Operational collection accounts only</div>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
        Blocked from collection selectors until mapped to a posting-enabled leaf ASSET account. System posting profiles are not shown here.
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="px-2 py-2">Finance Account</th>
              <th className="px-2 py-2">Used For</th>
              <th className="px-2 py-2">Payment Method</th>
              <th className="px-2 py-2">Mapped Posting COA</th>
              <th className="px-2 py-2">Suggested Posting Account</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Recommended Action</th>
              <th className="px-2 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {financeAccounts.length === 0 ? (
              <tr>
                <td className="px-2 py-3 text-muted-foreground" colSpan={8}>
                  No operational finance accounts found.
                </td>
              </tr>
            ) : (
              financeAccounts.map((account) => {
                const mapped = account.mapped_chart_account;
                const suggested = account.suggested_chart_account;
                const isEditing = editingId === account.id;
                const isRepairing = repairId === account.id;
                const blocker = account.blocker_reason || account.collection_blocker_reason || null;
                const canRepair = canRepairCollectionMapping(account);
                const selectable = isSelectableCollectionAccount(account);
                return (
                  <tr key={account.id} className="border-t border-border align-top">
                    <td className="px-2 py-2">
                      <div className="font-medium text-foreground">{account.name}</div>
                      <div className="text-[11px] text-muted-foreground">{account.branch?.name || "All branches"}</div>
                    </td>
                    <td className="px-2 py-2">Payment collection</td>
                    <td className="px-2 py-2">{paymentMethodLabel(account.kind)}</td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <select
                          value={selectedChartAccountId || ""}
                          onChange={(event) => onChartAccountChange(event.target.value)}
                          className="h-10 min-w-[260px] rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                        >
                          <option value="">Choose posting-enabled leaf ASSET account</option>
                          {postingChartAccounts.map((chart) => (
                            <option key={chart.id} value={chart.id}>
                              {chart.code} · {chart.name} · {chart.type || chart.account_type}
                            </option>
                          ))}
                        </select>
                      ) : mapped ? (
                        <div>
                          <div className="font-medium text-foreground">
                            {mapped.code} · {mapped.name}
                          </div>
                          <ChartAccountPostingBadge isPosting={isPostingChartAccount(mapped)} />
                        </div>
                      ) : (
                        "No chart account mapped"
                      )}
                    </td>
                    <td className="max-w-[260px] px-2 py-2">
                      <div className={isPostingChartAccount(suggested as AccountingSetupReadinessChartAccount) ? "text-emerald-700" : "text-muted-foreground"}>{chartLabel(suggested)}</div>
                      {canRepair ? (
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          Repair creates or reuses a posting leaf account and remaps this finance account only.
                        </div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      <FinanceAccountReadinessBadge ready={selectable} blocker={blocker} />
                    </td>
                    <td className="max-w-[280px] px-2 py-2 text-amber-700">
                      {selectable ? "Ready for collection selectors." : blocker || account.recommended_action || "Blocked from collection selectors until mapped to a posting-enabled leaf ASSET account."}
                    </td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <div className="flex flex-wrap gap-2">
                          <ActionButton size="sm" variant="primary" onClick={onSave} disabled={saving || !selectedChartAccountId}>
                            {saving ? "Saving..." : "Save"}
                          </ActionButton>
                          <ActionButton size="sm" variant="ghost" onClick={onCancelEdit} disabled={saving}>
                            Cancel
                          </ActionButton>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {canRepair ? (
                            <ActionButton size="sm" variant="primary" onClick={() => onRepair?.(account)} disabled={saving || isRepairing || Boolean(repairId)}>
                              {isRepairing ? "Repairing..." : "Repair mapping"}
                            </ActionButton>
                          ) : null}
                          <ActionButton size="sm" variant="secondary" onClick={() => onEdit(account)} disabled={saving || Boolean(repairId)}>
                            Edit Mapping
                          </ActionButton>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
