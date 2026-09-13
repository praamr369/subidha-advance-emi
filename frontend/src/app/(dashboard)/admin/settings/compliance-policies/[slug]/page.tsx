"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { PolicyDetailClient } from "@/components/admin/settings/compliance-policies/PolicyDetailClient";

export default function PolicyDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  // The route only carries the slug; show the policy's real title once it loads.
  const [title, setTitle] = useState<string | null>(null);
  const heading = title || slug;

  return (
    <ERPPageShell
      eyebrow="Settings · Legal & Compliance · Policy"
      title={heading}
      subtitle="View, edit, and govern the lifecycle of this policy document."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Settings", href: ROUTES.admin.settings },
        { label: "Compliance & Policies", href: ROUTES.admin.settingsCompliancePolicies },
        { label: heading },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <PolicyDetailClient slug={slug} onPolicyLoaded={(policy) => setTitle(policy.title)} />
    </ERPPageShell>
  );
}
