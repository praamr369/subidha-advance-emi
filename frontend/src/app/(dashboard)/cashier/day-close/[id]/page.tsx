"use client";
import { formatRupee } from "@/lib/utils/currency";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import {
  ERPErrorState,
  ERPLoadingState,
  ERPPageShell,
  ERPSectionShell,
  ERPStatusBadge,
} from "@/components/erp";
import { ApiError } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import { getCashierDayClose } from "@/services/settlements";
import type { CashierDayClose } from "@/types/settlements";


function formatError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.readableMessage || fallback;
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

export default function CashierDayCloseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<CashierDayClose | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const row = await getCashierDayClose(id);
      setRecord(row);
      setError(null);
    } catch (err) {
      setError(formatError(err, "Failed to load day-close record."));
      setRecord(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <ERPPageShell
        title="Day Close record"
        breadcrumbs={[
          { label: "Cashier", href: ROUTES.cashier.dashboard },
          { label: "Day Close", href: ROUTES.cashier.dayClose },
          { label: String(id || "…") },
        ]}
        headerMode="erp"
      >
        <ERPLoadingState label="Loading record…" />
      </ERPPageShell>
    );
  }

  if (error || !record) {
    return (
      <ERPPageShell
        title="Day Close record"
        breadcrumbs={[
          { label: "Cashier", href: ROUTES.cashier.dashboard },
          { label: "Day Close", href: ROUTES.cashier.dayClose },
          { label: String(id || "…") },
        ]}
        headerMode="erp"
      >
        <ERPErrorState message={error || "Record not found."} onRetry={() => void load()} />
      </ERPPageShell>
    );
  }

  return (
    <ERPPageShell
      title={`Day Close · ${record.close_no}`}
      subtitle="Evidence only. No accounting posting is performed."
      helperNote="This record stores cash evidence only. It does not modify payments, receipts, money movements, journals, reconciliation items, or allocations."
      helperTone="warning"
      breadcrumbs={[
        { label: "Cashier", href: ROUTES.cashier.dashboard },
        { label: "Day Close", href: ROUTES.cashier.dayClose },
        { label: record.close_no },
      ]}
      headerMode="erp"
      statusBadge={{ label: record.status, tone: record.status === "DRAFT" ? "info" : "warning" }}
      actions={[{ href: ROUTES.cashier.dayClose, label: "Back", variant: "secondary" }]}
    >
      <ERPSectionShell title="Summary" description="Recorded system cash vs counted cash and variance.">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Business date</div>
            <div className="mt-2 text-sm font-semibold text-foreground">{record.business_date}</div>
          </div>
          <div className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">System cash total</div>
            <div className="mt-2 text-sm font-semibold text-foreground">{formatRupee(record.system_cash_total)}</div>
          </div>
          <div className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Counted cash</div>
            <div className="mt-2 text-sm font-semibold text-foreground">{formatRupee(record.counted_cash)}</div>
          </div>
        </div>

        <div className="mt-3 rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-foreground">Variance</div>
            <ERPStatusBadge status={record.status} hideIcon />
          </div>
          <div className="mt-2 text-lg font-semibold text-foreground">{formatRupee(record.variance)}</div>
          <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{record.notes?.trim() ? record.notes : "—"}</div>
        </div>

        <div className="mt-4 text-sm text-muted-foreground">
          <Link className="font-semibold text-primary hover:underline" href={ROUTES.cashier.dayClose}>
            Open today’s workflow →
          </Link>
        </div>
      </ERPSectionShell>
    </ERPPageShell>
  );
}
