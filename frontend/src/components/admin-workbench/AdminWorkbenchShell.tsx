import { ArrowUpRight, Database, Route, ShieldCheck } from "lucide-react";

import ActionButton from "@/components/ui/ActionButton";
import EmptyState from "@/components/ui/EmptyState";
import type { AdminWorkbenchDefinition } from "@/domains/admin-workbenches/workbench-config";
import CommandBar from "./CommandBar";
import RightInspector from "./RightInspector";
import WorkbenchHeader from "./WorkbenchHeader";
import WorkbenchTabs from "./WorkbenchTabs";

export default function AdminWorkbenchShell({
  definition,
  activeTab,
}: {
  definition: AdminWorkbenchDefinition;
  activeTab: string;
}) {
  const selectedTab =
    definition.tabs.find((tab) => tab.id === activeTab) ??
    definition.tabs.find((tab) => tab.id === definition.defaultTab) ??
    definition.tabs[0];

  if (!selectedTab) return null;

  const pathname = `/admin/${definition.id}`;

  return (
    <div className="space-y-5">
      <WorkbenchHeader
        eyebrow={definition.eyebrow}
        title={definition.title}
        description={definition.description}
        actions={<CommandBar definition={definition} />}
      />

      <section className="surface-panel-elevated rounded-2xl border border-border p-4 sm:p-5">
        <WorkbenchTabs
          pathname={pathname}
          tabs={definition.tabs}
          activeTab={selectedTab.id}
        />

        <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="min-w-0">
            <EmptyState
              title={selectedTab.label}
              description={`${selectedTab.description} This Phase 1 route shell does not duplicate the existing operational screen or synthesize backend data.`}
              action={
                selectedTab.href ? (
                  <ActionButton
                    href={selectedTab.href}
                    variant="primary"
                    rightIcon={<ArrowUpRight className="h-4 w-4" />}
                  >
                    Open current workflow
                  </ActionButton>
                ) : undefined
              }
              tone="info"
            />
          </div>

          <RightInspector title="Consolidation status">
            <div className="flex gap-2">
              <Route className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
              <p>Legacy route retained and available for daily operations.</p>
            </div>
            <div className="flex gap-2">
              <Database className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              <p>No local operational data or financial calculations are introduced.</p>
            </div>
            <div className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <p>Backend permissions, validation, posting, and audit controls remain unchanged.</p>
            </div>
          </RightInspector>
        </div>
      </section>
    </div>
  );
}
