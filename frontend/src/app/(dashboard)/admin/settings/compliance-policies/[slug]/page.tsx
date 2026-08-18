"use client";

import { useParams } from "next/navigation";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { PolicyDetailClient } from "@/components/admin/settings/compliance-policies/PolicyDetailClient";

export default function PolicyDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <ERPPageShell
      eyebrow="Settings · Legal & Compliance · Policy"
      title={slug}
      subtitle="View, edit, and govern the lifecycle of this policy document."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Settings", href: ROUTES.admin.settings },
        { label: "Compliance & Policies", href: ROUTES.admin.settingsCompliancePolicies },
        { label: slug },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <PolicyDetailClient slug={slug} />
    </ERPPageShell>
  );
}
