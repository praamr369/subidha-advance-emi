"use client";

import { useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";

import { ChartAccountsPanel } from "@/components/admin/accounting/workbench/ChartAccountsPanel";
import { FinanceAccountsPanel } from "@/components/admin/accounting/workbench/FinanceAccountsPanel";
import { AccountingMappingsPanel } from "@/components/admin/accounting/workbench/AccountingMappingsPanel";
import { BridgeReadinessPanel } from "@/components/admin/accounting/workbench/BridgeReadinessPanel";
import { BridgeReconciliationPanel } from "@/components/admin/accounting/workbench/BridgeReconciliationPanel";

type TabId = "chart-accounts" | "finance-accounts" | "mappings" | "bridge-readiness" | "bridge-recon";

export default function UnifiedAccountingWorkbenchPage() {
  const [activeTab, setActiveTab] = useState<TabId>("chart-accounts");

  return (
    <ERPPageShell
      eyebrow="Accounting"
      title="Accounting Setup Workbench"
      subtitle="Unified control center for Chart of Accounts, Finance Accounts, Mappings, and Bridge Reconciliation."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Setup Workbench" },
      ]}
      statusBadge={{ label: "Enterprise Workflow", tone: "info" }}
    >
      <div className="space-y-6">
        {/* Advanced 3D Tab Navigation */}
        <div className="rounded-2xl border border-border/60 bg-gradient-to-b from-card to-card/50 p-2 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1),inset_0_1px_1px_rgba(255,255,255,0.05)] backdrop-blur-md">
          <nav className="flex flex-wrap gap-2">
            {[
              { id: "chart-accounts", label: "Chart of Accounts" },
              { id: "finance-accounts", label: "Finance Accounts" },
              { id: "mappings", label: "System Mappings" },
              { id: "bridge-readiness", label: "Bridge Readiness" },
              { id: "bridge-recon", label: "Reconciliation" },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabId)}
                  className={`relative flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-[0_2px_10px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.2)]"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground hover:shadow-sm"
                  }`}
                >
                  {tab.label}
                  {isActive && (
                    <span className="absolute -bottom-2 left-1/2 h-1 w-8 -translate-x-1/2 rounded-t-md bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Panel Content */}
        <div className="min-h-[500px] animate-in fade-in slide-in-from-bottom-2 duration-300">
          {activeTab === "chart-accounts" && <ChartAccountsPanel />}
          {activeTab === "finance-accounts" && <FinanceAccountsPanel />}
          {activeTab === "mappings" && <AccountingMappingsPanel />}
          {activeTab === "bridge-readiness" && <BridgeReadinessPanel />}
          {activeTab === "bridge-recon" && <BridgeReconciliationPanel />}
        </div>
      </div>
    </ERPPageShell>
  );
}
