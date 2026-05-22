// src/app/(dashboard)/admin/settlements/upi-imports/[id]/page.tsx

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ERPDetailGrid from "@/components/erp/ERPDetailGrid";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import ERPAuditNote from "@/components/erp/ERPAuditNote";
import FieldHelp from "@/components/erp/forms/FieldHelp";
import SettlementMoneyMovementLookup from "@/components/admin/settlements/SettlementMoneyMovementLookup";
import SettlementPaymentLookup from "@/components/admin/settlements/SettlementPaymentLookup";
import SettlementReceiptLookup from "@/components/admin/settlements/SettlementReceiptLookup";
import { ApiError } from "@/lib/api";
import {
  getUpiImport,
  listUpiImportLines,
  createAllocation,
  listAllocations,
  voidAllocation,
} from "@/services/settlements";
import type {
  UpiSettlementImport,
  UpiSettlementLine,
  SettlementAllocation,
  SettlementAllocationCreatePayload,
} from "@/types/settlements";
import { ROUTES } from "@/lib/routes";

export default function UpiImportDetail({ params }: { params: { id: string } }) {
  const importId = Number(params.id);

  const [importData, setImportData] = useState<UpiSettlementImport | null>(null);
  const [lines, setLines] = useState<UpiSettlementLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [allocations, setAllocations] = useState<SettlementAllocation[]>([]);
  const [allocationsLoading, setAllocationsLoading] = useState(false);
  const [allocationsError, setAllocationsError] = useState<string | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string>("");
  const [targetType, setTargetType] = useState<"" | "PAYMENT" | "RECEIPT" | "MONEY_MOVEMENT">("");
  const [targetId, setTargetId] = useState<string | null>(null);

  const [allocating, setAllocating] = useState(false);
  const [allocationError, setAllocationError] = useState<string | null>(null);

  const formatError = (err: unknown, fallback: string) => {
    if (err instanceof ApiError) return err.readableMessage || fallback;
    if (err instanceof Error) return err.message || fallback;
    return fallback;
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const imp = await getUpiImport(importId);
      const resp = await listUpiImportLines(importId);
      setImportData(imp);
      setLines(resp.results ?? []);
      setError(null);
    } catch (err: unknown) {
      setError(formatError(err, "Failed to load import details."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importId]);

  const loadAllocationsForLine = async (sourceId: string) => {
    if (!sourceId) {
      setAllocations([]);
      setAllocationsError(null);
      return;
    }

    try {
      setAllocationsLoading(true);
      const payload = await listAllocations({
        source_type: "UPI_SETTLEMENT_LINE",
        source_id: sourceId,
      });
      setAllocations(payload.results ?? []);
      setAllocationsError(null);
    } catch (err: unknown) {
      setAllocationsError(formatError(err, "Failed to load allocations."));
      setAllocations([]);
    } finally {
      setAllocationsLoading(false);
    }
  };

  const handleAllocate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const source_id = String(formData.get("source_id") || "");
    const target_type = targetType;
    const target_id = Number(targetId);
    const matched_amount = String(formData.get("matched_amount"));
    const note = String(formData.get("note"));

    if (!source_id || !target_type || !target_id || !matched_amount) {
      setAllocationError("All fields are required");
      return;
    }

    const payload: SettlementAllocationCreatePayload = {
      source_type: "UPI_SETTLEMENT_LINE",
      source_id,
      finance_account: importData?.upi_finance_account ?? 0,
      matched_amount,
      note: note || undefined,
    };

    if (target_type === "PAYMENT") payload.payment = target_id;
    if (target_type === "RECEIPT") payload.receipt = target_id;
    if (target_type === "MONEY_MOVEMENT") payload.money_movement = target_id;

    setAllocating(true);
    try {
      await createAllocation(payload);
      setAllocationError(null);
      setTargetType("");
      setTargetId(null);
      const refreshed = await listUpiImportLines(importId);
      setLines(refreshed.results ?? []);
      await loadAllocationsForLine(source_id);
    } catch (err: unknown) {
      setAllocationError(formatError(err, "Allocation failed."));
    } finally {
      setAllocating(false);
    }
  };

  if (loading) return <ERPLoadingState label="Loading UPI import..." />;
  if (error) return <ERPErrorState title="UPI import unavailable" description={error} onRetry={() => void fetchData()} />;
  if (!importData) return <ERPEmptyState title="Import not found" description="This import record is not available." />;

  return (
    <ERPPageShell
      title={`UPI import ${importData.import_no}`}
      subtitle="Review parsed settlement lines and apply manual allocations to existing targets."
      helperNote="Manual allocation only. No payment record is edited. No accounting entry is created. No reconciliation exception is closed automatically."
      helperTone="warning"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Settlements", href: ROUTES.admin.settlements },
        { label: "UPI Imports", href: ROUTES.admin.settlementsUpiImports },
        { label: importData.import_no },
      ]}
      actions={[
        { href: ROUTES.admin.settlementsBankImports, label: "Bank imports", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
      headerMode="erp"
    >
      <div className="space-y-6">
        <ERPAuditNote title="Safety guardrails" tone="warning">
          <ul className="list-disc space-y-1 pl-5">
            <li>Imports store evidence only (CSV snapshot + parsed lines).</li>
            <li>Manual allocations only: no auto-match, no suggestions.</li>
            <li>No payment, receipt, money movement, or accounting posting is mutated by this UI.</li>
            <li>No reconciliation exception is created or closed from this page.</li>
          </ul>
        </ERPAuditNote>

        <ERPSectionShell
          title="Import metadata"
          description="Evidence record produced by the import parser endpoint."
          actions={
            <Link className="text-sm font-semibold text-primary hover:underline" href={ROUTES.admin.settlementsUpiImports}>
              Back to UPI imports
            </Link>
          }
        >
          <ERPDetailGrid
            items={[
              { label: "Import no", value: importData.import_no },
              {
                label: "UPI finance account",
                value: importData.upi_finance_account_name ?? `#${importData.upi_finance_account}`,
                hint: `ID ${importData.upi_finance_account}`,
              },
              { label: "Settlement date", value: importData.settlement_date },
              { label: "Status", value: <ERPStatusBadge status={importData.status} /> },
              { label: "Checksum", value: importData.checksum },
              { label: "Uploaded at", value: importData.uploaded_at },
              { label: "Uploaded by", value: importData.uploaded_by_username ?? `User #${importData.uploaded_by}` },
            ]}
            columns={3}
          />
        </ERPSectionShell>

        <ERPSectionShell title="Settlement lines" description="Parsed UPI settlement rows. Matched status is derived from allocations.">
          {lines.length === 0 ? (
            <ERPEmptyState title="No lines found" description="This import has no parsed settlement lines." />
          ) : (
            <table className="min-w-full overflow-hidden rounded-[1.2rem] border border-border/70 bg-[var(--surface-card-elevated)]">
              <thead className="bg-[var(--surface-muted)]/60">
                <tr>
                  <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Settlement date
                  </th>
                  <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Transaction ref
                  </th>
                  <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Payment ref
                  </th>
                  <th className="p-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Gross
                  </th>
                  <th className="p-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Fee
                  </th>
                  <th className="p-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Net
                  </th>
                  <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Matched
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} className="border-t border-border/60">
                    <td className="p-3 text-sm text-foreground">{line.settlement_date}</td>
                    <td className="p-3 text-sm text-foreground">{line.transaction_ref}</td>
                    <td className="p-3 text-sm text-muted-foreground">{line.payment_ref ?? "—"}</td>
                    <td className="p-3 text-right text-sm text-foreground">{line.gross_amount}</td>
                    <td className="p-3 text-right text-sm text-foreground">{line.fee_amount}</td>
                    <td className="p-3 text-right text-sm text-foreground">{line.net_amount}</td>
                    <td className="p-3 text-sm">
                      <ERPStatusBadge status={line.matched_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ERPSectionShell>

        <ERPSectionShell
          title="Manual allocation"
          description="Create an explicit allocation linking one settlement line to exactly one target type."
        >
          <ERPDataToolbar
            left={
              <div className="text-sm text-muted-foreground">
                Finance account is derived from this import and locked:{" "}
                <span className="font-semibold text-foreground">
                  {importData.upi_finance_account_name ?? `#${importData.upi_finance_account}`}
                </span>
              </div>
            }
          />

          <form
            className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_var(--hairline-shine)]"
            onSubmit={handleAllocate}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-muted-foreground">
                Source settlement line
                <select
                  name="source_id"
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                  required
                  value={selectedLineId}
                  onChange={(event) => {
                    const next = event.target.value;
                    setSelectedLineId(next);
                    void loadAllocationsForLine(next);
                  }}
                >
                  <option value="">Select a line</option>
                  {lines.map((line) => (
                    <option key={line.id} value={String(line.id)}>
                      #{line.id} • {line.settlement_date} • {line.transaction_ref.slice(0, 48)} • Net {line.net_amount}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-muted-foreground">
                Target type
                <select
                  name="target_type"
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                  required
                  value={targetType}
                  onChange={(event) => {
                    const next = (event.target.value || "") as "" | "PAYMENT" | "RECEIPT" | "MONEY_MOVEMENT";
                    setTargetType(next);
                    setTargetId(null);
                  }}
                >
                  <option value="">Select target type</option>
                  <option value="PAYMENT">Payment</option>
                  <option value="RECEIPT">Receipt</option>
                  <option value="MONEY_MOVEMENT">Money movement</option>
                </select>
              </label>
              {targetType === "PAYMENT" ? (
                <SettlementPaymentLookup
                  label="Payment target"
                  value={targetId}
                  onChange={(value) => setTargetId(value)}
                  required
                  help={
                    <FieldHelp
                      meaning={
                        <>
                          Read-only lookup. Selecting a payment only stores its numeric ID in the allocation payload; it does not edit
                          the payment, generate receipts, post accounting, or close reconciliation items.
                        </>
                      }
                    />
                  }
                />
              ) : null}
              {targetType === "RECEIPT" ? (
                <SettlementReceiptLookup
                  label="ReceiptDocument target"
                  value={targetId}
                  onChange={(value) => setTargetId(value)}
                  required
                  help={
                    <FieldHelp
                      meaning={
                        <>
                          Read-only lookup. Selecting a receipt only stores its numeric ID in the allocation payload; it does not
                          mutate the receipt or post additional entries.
                        </>
                      }
                    />
                  }
                />
              ) : null}
              {targetType === "MONEY_MOVEMENT" ? (
                <SettlementMoneyMovementLookup
                  label="MoneyMovement target"
                  value={targetId}
                  onChange={(value) => setTargetId(value)}
                  required
                  help={
                    <FieldHelp
                      meaning={
                        <>
                          Read-only lookup. Selecting a money movement only stores its numeric ID in the allocation payload; it does
                          not change the movement status or accounting posting.
                        </>
                      }
                    />
                  }
                />
              ) : null}
              {!targetType ? (
                <div className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4 text-sm text-muted-foreground shadow-[inset_0_1px_0_var(--hairline-shine)]">
                  Select a target type to search for an existing Payment, ReceiptDocument, or MoneyMovement.
                </div>
              ) : null}
              <label className="text-sm text-muted-foreground">
                Matched amount
                <input
                  type="text"
                  name="matched_amount"
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                  required
                  placeholder="e.g., 98.00"
                />
              </label>
              <label className="text-sm text-muted-foreground md:col-span-2">
                Note (optional)
                <textarea
                  name="note"
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                  rows={2}
                />
              </label>
            </div>

            {allocationError ? (
              <div className="mt-3">
                <ERPErrorState title="Allocation failed" message={allocationError} />
              </div>
            ) : null}

            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={allocating}
                className="rounded-xl border border-border bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {allocating ? "Creating allocation..." : "Create allocation"}
              </button>
            </div>
          </form>

          <div className="mt-4">
            {allocationsLoading ? <ERPLoadingState label="Loading allocations..." compact /> : null}
            {!allocationsLoading && allocationsError ? (
              <ERPErrorState title="Allocations unavailable" description={allocationsError} onRetry={() => void loadAllocationsForLine(selectedLineId)} />
            ) : null}
            {!allocationsLoading && !allocationsError && selectedLineId && allocations.length === 0 ? (
              <ERPEmptyState
                title="No allocations for selected line"
                description="Create a manual allocation to link this evidence line to an existing target."
              />
            ) : null}
            {!allocationsLoading && !allocationsError && allocations.length > 0 ? (
              <table className="min-w-full overflow-hidden rounded-[1.2rem] border border-border/70 bg-[var(--surface-card-elevated)]">
                <thead className="bg-[var(--surface-muted)]/60">
                  <tr>
                    <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Allocation
                    </th>
                    <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Target
                    </th>
                    <th className="p-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Amount
                    </th>
                    <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Status
                    </th>
                    <th className="p-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((row) => {
                    const targetLabel = row.payment
                      ? `Payment #${row.payment}`
                      : row.receipt
                        ? `Receipt #${row.receipt}`
                        : row.money_movement
                          ? `Money movement #${row.money_movement}`
                          : "—";

                    return (
                      <tr key={row.id} className="border-t border-border/60">
                        <td className="p-3 text-sm font-semibold text-foreground">#{row.id}</td>
                        <td className="p-3 text-sm text-foreground">{targetLabel}</td>
                        <td className="p-3 text-right text-sm text-foreground">{row.matched_amount}</td>
                        <td className="p-3 text-sm">
                          <ERPStatusBadge status={row.status} />
                        </td>
                        <td className="p-3 text-right text-sm">
                          {row.status !== "VOIDED" ? (
                            <ConfirmActionButton
                              label="Void"
                              title={`Void allocation #${row.id}?`}
                              description="Voiding marks the allocation as voided and restores the evidence line matched status. It does not delete payment, receipt, movement, or accounting rows."
                              variant="destructive"
                              onConfirm={async () => {
                                await voidAllocation(row.id, { reason: "Voided from UPI import evidence page." });
                                await Promise.all([
                                  loadAllocationsForLine(selectedLineId),
                                  (async () => {
                                    const refreshedLines = await listUpiImportLines(importId);
                                    setLines(refreshedLines.results ?? []);
                                  })(),
                                ]);
                              }}
                            />
                          ) : (
                            <span className="text-xs font-semibold text-muted-foreground">Voided</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
          </div>
        </ERPSectionShell>
      </div>
    </ERPPageShell>
  );
}
