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
  selectedChartAccountId?: string;
  onEdit: (financeAccount: AccountingSetupReadinessFinanceAccount) => void;
  onCancelEdit: () => void;
  onChartAccountChange: (chartAccountId: string) => void;
  onSave: () => void;
};

function paymentMethodLabel(kind: string): string {
  if (kind === "CASH") return "Cash";
  if (kind === "BANK") return "Bank";
  if (kind === "UPI") return "UPI";
  return kind || "-";
}

export default function FinanceAccountMappingPanel({
  financeAccounts,
  chartAccounts,
  saving,
  editingId,
  selectedChartAccountId,
  onEdit,
  onCancelEdit,
  onChartAccountChange,
  onSave,
}: FinanceAccountMappingPanelProps) {
  const postingChartAccounts = chartAccounts.filter((account) => account.is_posting);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-foreground">Finance Account Mapping Table</div>
        <div className="text-xs text-muted-foreground">Collection accounts only</div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="px-2 py-2">Finance Account</th>
              <th className="px-2 py-2">Used For</th>
              <th className="px-2 py-2">Payment Method</th>
              <th className="px-2 py-2">Mapped Chart Account</th>
              <th className="px-2 py-2">Chart Account Type</th>
              <th className="px-2 py-2">Posting Ready</th>
              <th className="px-2 py-2">Blocker</th>
              <th className="px-2 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {financeAccounts.length === 0 ? (
              <tr>
                <td className="px-2 py-3 text-muted-foreground" colSpan={8}>
                  No finance accounts found.
                </td>
              </tr>
            ) : (
              financeAccounts.map((account) => {
                const mapped = account.mapped_chart_account;
                const isEditing = editingId === account.id;
                const blocker = account.blocker_reason || account.collection_blocker_reason || null;
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
                          <option value="">Choose posting-enabled chart account</option>
                          {postingChartAccounts.map((chart) => (
                            <option key={chart.id} value={chart.id}>
                              {chart.code} · {chart.name} · {chart.type}
                            </option>
                          ))}
                        </select>
                      ) : mapped ? (
                        <div>
                          <div className="font-medium text-foreground">
                            {mapped.code} · {mapped.name}
                          </div>
                          <ChartAccountPostingBadge isPosting={mapped.is_posting} />
                        </div>
                      ) : (
                        "No chart account mapped"
                      )}
                    </td>
                    <td className="px-2 py-2">{mapped?.type || "-"}</td>
                    <td className="px-2 py-2">
                      <FinanceAccountReadinessBadge ready={account.collection_ready} blocker={blocker} />
                    </td>
                    <td className="max-w-[260px] px-2 py-2 text-amber-700">
                      {blocker || account.recommended_action || "-"}
                    </td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <div className="flex gap-2">
                          <ActionButton size="sm" variant="primary" onClick={onSave} disabled={saving || !selectedChartAccountId}>
                            {saving ? "Saving..." : "Save"}
                          </ActionButton>
                          <ActionButton size="sm" variant="ghost" onClick={onCancelEdit} disabled={saving}>
                            Cancel
                          </ActionButton>
                        </div>
                      ) : (
                        <ActionButton size="sm" variant="secondary" onClick={() => onEdit(account)}>
                          Edit Mapping
                        </ActionButton>
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
