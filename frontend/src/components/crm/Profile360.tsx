"use client";

import React, { useState } from "react";
import { AlertCircle, TrendingUp, PieChart, FileText, Activity } from "lucide-react";

export interface Profile360Tab {
  id: string;
  label: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

interface Profile360Props {
  entityType: "partner" | "vendor" | "staff" | "customer";
  entityName: string;
  tabs: Profile360Tab[];
  isLoading?: boolean;
}

/**
 * Shared 360-degree profile view for all CRM entities.
 * Provides tabbed interface with:
 * - Alerts & compliance
 * - Financial metrics
 * - Module tables (orders, subscriptions, etc)
 * - Activity timeline
 * - Documents
 */
const Profile360: React.FC<Profile360Props> = ({
  entityType,
  entityName,
  tabs,
  isLoading = false,
}) => {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || "");

  // Default tabs if none provided
  const defaultTabs: Profile360Tab[] = [
    {
      id: "alerts",
      label: "Alerts",
      icon: <AlertCircle className="h-4 w-4" />,
      content: <div>No active alerts</div>,
    },
    {
      id: "financials",
      label: "Financials",
      icon: <TrendingUp className="h-4 w-4" />,
      content: <div>Financial metrics loading...</div>,
    },
    {
      id: "modules",
      label: "Modules",
      icon: <PieChart className="h-4 w-4" />,
      content: <div>Module tables loading...</div>,
    },
    {
      id: "activity",
      label: "Activity",
      icon: <Activity className="h-4 w-4" />,
      content: <div>Activity timeline loading...</div>,
    },
    {
      id: "documents",
      label: "Documents",
      icon: <FileText className="h-4 w-4" />,
      content: <div>Documents loading...</div>,
    },
  ];

  const displayTabs = tabs.length > 0 ? tabs : defaultTabs;
  const activeTabContent = displayTabs.find((t) => t.id === activeTab);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">360° Profile</h2>
        <p className="text-gray-600 mt-1">
          Complete view of {entityType} — {entityName}
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b">
        <nav className="flex gap-8 -mb-px">
          {displayTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-1 py-4 border-b-2 font-medium text-sm transition flex items-center gap-2 ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-lg border p-6">
        {isLoading ? (
          <div className="text-center text-gray-500">
            <div className="animate-spin h-8 w-8 border-4 border-blue-200 border-t-blue-500 rounded-full mx-auto mb-2" />
            Loading {activeTabContent?.label}...
          </div>
        ) : (
          activeTabContent?.content
        )}
      </div>

      {/* Quick Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
          <div className="text-sm font-medium text-blue-900">Total Value</div>
          <div className="text-2xl font-bold text-blue-600 mt-2">—</div>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
          <div className="text-sm font-medium text-green-900">Active</div>
          <div className="text-2xl font-bold text-green-600 mt-2">—</div>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg p-4 border border-amber-200">
          <div className="text-sm font-medium text-amber-900">At Risk</div>
          <div className="text-2xl font-bold text-amber-600 mt-2">—</div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-200">
          <div className="text-sm font-medium text-purple-900">Last Interaction</div>
          <div className="text-sm font-bold text-purple-600 mt-2">—</div>
        </div>
      </div>
    </div>
  );
};

export default Profile360;
