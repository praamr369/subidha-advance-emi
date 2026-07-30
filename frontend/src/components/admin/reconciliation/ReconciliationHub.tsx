"use client";

import { useState } from "react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import LiabilityReconciliationPanel from "./LiabilityReconciliationPanel";
import ReconciliationSignoffsPanel from "./ReconciliationSignoffsPanel";
import ReversalReconciliationPanel from "./ReversalReconciliationPanel";

export type ReconciliationTab = "liability" | "signoffs" | "reversal";

const RECONCILIATION_TABS: Array<{ id: ReconciliationTab; label: string }> = [
  { id: "liability", label: "Liability" },
  { id: "signoffs", label: "Sign-offs" },
  { id: "reversal", label: "Reversal" },
];

/**
 * Unified Reconciliation Center. Gathers the three distinct reconciliation
 * workflows (liability diagnostics, officer sign-off gate, reversal case queue)
 * as tabs. Each standalone route renders this hub with its own default tab, so
 * every route stays live and every workflow is reachable from one place.
 */
export default function ReconciliationHub({ defaultTab = "liability" }: { defaultTab?: ReconciliationTab }) {
  const [tab, setTab] = useState<ReconciliationTab>(defaultTab);

  return (
    <ERPPageShell
      eyebrow="Finance & Accounting"
      title="Reconciliation Center"
      subtitle="Liability diagnostics, officer sign-off gate, and reversal reconciliation queue in one audited workspace."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Reconciliation" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <div className="space-y-6">
        <div className="flex w-fit flex-wrap gap-1 rounded-xl bg-muted p-1">
          {RECONCILIATION_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "liability" ? <LiabilityReconciliationPanel /> : null}
        {tab === "signoffs" ? <ReconciliationSignoffsPanel /> : null}
        {tab === "reversal" ? <ReversalReconciliationPanel /> : null}
      </div>
    </ERPPageShell>
  );
}
