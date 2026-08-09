"use client";

import { useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { BarChart3, Settings, Layers, FolderTree } from "lucide-react";

import ERPPageShell from "@/components/erp/ERPPageShell";

// Tab type definition
type TabId = "register" | "dashboard" | "masters" | "pim-categories";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const TABS: Tab[] = [
  {
    id: "register",
    label: "Product Register",
    icon: <BarChart3 className="h-4 w-4" />,
    description: "Complete product catalog with filters and pricing",
  },
  {
    id: "dashboard",
    label: "Operations Dashboard",
    icon: <BarChart3 className="h-4 w-4" />,
    description: "Analytics and KPI workspace for product operations",
  },
  {
    id: "masters",
    label: "Master Configurations",
    icon: <Settings className="h-4 w-4" />,
    description: "Units of measure, categories, and subcategories",
  },
  {
    id: "pim-categories",
    label: "PIM Categories",
    icon: <FolderTree className="h-4 w-4" />,
    description: "Category hierarchy, attributes, and variants",
  },
];

interface TabSwitcherProps {
  tabs: Tab[];
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

function TabSwitcher({ tabs, activeTab, onTabChange }: TabSwitcherProps) {
  return (
    <div className="space-y-4">
      {/* Tab buttons */}
      <div className="flex flex-wrap gap-2 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab description */}
      <div className="text-sm text-muted-foreground">
        {tabs.find((t) => t.id === activeTab)?.description}
      </div>
    </div>
  );
}

interface UnifiedProductsPageProps {
  registerContent: React.ReactNode;
  dashboardContent: React.ReactNode;
  mastersContent: React.ReactNode;
  pimCategoriesContent: React.ReactNode;
}

export function UnifiedProductsPage({
  registerContent,
  dashboardContent,
  mastersContent,
  pimCategoriesContent,
}: UnifiedProductsPageProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const tab = searchParams.get("tab");
    return (tab as TabId) || "register";
  });

  const handleTabChange = useCallback(
    (tab: TabId) => {
      setActiveTab(tab);
      const params = new URLSearchParams(searchParams);
      if (tab === "register") {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
      const newUrl = `${pathname}${params.toString() ? `?${params}` : ""}`;
      router.replace(newUrl, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const renderContent = () => {
    switch (activeTab) {
      case "register":
        return registerContent;
      case "dashboard":
        return dashboardContent;
      case "masters":
        return mastersContent;
      case "pim-categories":
        return pimCategoriesContent;
      default:
        return registerContent;
    }
  };

  return (
    <ERPPageShell
      title="Product Master"
      subtitle="Unified control center for product catalog, operations, configurations, and PIM hierarchy"
    >
      <TabSwitcher
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      {/* Tab content */}
      <div className="mt-6">{renderContent()}</div>
    </ERPPageShell>
  );
}
