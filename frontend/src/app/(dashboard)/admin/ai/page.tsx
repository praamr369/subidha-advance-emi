"use client";

import Link from "next/link";

import AiAssistantPanel from "@/components/admin/ai/AiAssistantPanel";
import Card from "@/components/ui/card";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";

export default function AdminAiAssistantPage() {
  return (
    <PortalPage
      eyebrow="Command Center"
      title="AI Assistant"
      subtitle="Internal knowledge assistant (read-only)"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "AI Assistant" },
      ]}
      actions={[
        { href: ROUTES.admin.aiSources, label: "Sources", variant: "secondary" },
        { href: ROUTES.admin.aiQueryLog, label: "Query Log", variant: "secondary" },
        { href: ROUTES.admin.aiReadiness, label: "AI Readiness", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "warning" }}
      maxWidth="1180px"
    >
      <Card variant="bordered" title="Explain Business Metrics" className="mb-5">
        <p className="text-sm text-muted-foreground">
          Need plain-language BI interpretation for admin metrics? Open the BI Control Center explanation panel.
        </p>
        <Link
          href={`${ROUTES.admin.bi}#ai-explanation`}
          className="mt-3 inline-flex rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-muted/30"
        >
          Open BI Explanation
        </Link>
      </Card>
      <AiAssistantPanel />
    </PortalPage>
  );
}
