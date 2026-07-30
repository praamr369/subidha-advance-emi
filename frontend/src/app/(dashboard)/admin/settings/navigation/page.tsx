// frontend/src/app/(dashboard)/admin/settings/navigation/page.tsx
"use client";

import React from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import NavigationCustomizerWorkspace from "@/components/layout/NavigationCustomizerWorkspace";

export default function AdminSettingsNavigationPage() {
  return (
    <ERPPageShell
      eyebrow="SETTINGS & GOVERNANCE"
      title="Sidebar & Navigation Customizer"
      subtitle="Personalize your solopreneur desktop control room. Arrange parent module hierarchy, reorder workflow pages, rename sections, and toggle sidebar screen visibility."
      statusBadge={{ label: "LIVE WORKSPACE", tone: "info" }}
    >
      <div className="h-[80vh] w-full min-h-[600px]">
        <NavigationCustomizerWorkspace isModal={false} />
      </div>
    </ERPPageShell>
  );
}
