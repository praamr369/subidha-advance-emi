import Link from "next/link";

import type { AdminWorkbenchTab } from "@/domains/admin-workbenches/workbench-config";
import { cn } from "@/lib/utils";

type WorkbenchTabsProps = {
  pathname: string;
  tabs: readonly AdminWorkbenchTab[];
  activeTab: string;
};

export default function WorkbenchTabs({
  pathname,
  tabs,
  activeTab,
}: WorkbenchTabsProps) {
  return (
    <nav
      className="flex gap-2 overflow-x-auto border-b border-border pb-3"
      aria-label="Workbench sections"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <Link
            key={tab.id}
            href={`${pathname}?tab=${encodeURIComponent(tab.id)}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold transition",
              active
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-[var(--surface-card-elevated)] text-muted-foreground hover:border-[var(--surface-border-strong)] hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
