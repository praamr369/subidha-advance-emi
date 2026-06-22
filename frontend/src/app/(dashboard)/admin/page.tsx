"use client";

import { ArrowUpRight, ExternalLink, ShieldAlert } from "lucide-react";

import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ADMIN_APP_URL } from "@/lib/env";
import { ROUTES } from "@/lib/routes";

const FALLBACK_DASHBOARD_URL = `${ROUTES.admin.root}/legacy-dashboard`;

export default function AdminCutoverPage() {
  return (
    <PortalPage
      eyebrow="Admin cutover"
      title="Admin has moved to the new Vite admin app"
      subtitle="Use the new admin-vite workspace for owner, superuser, admin, cashier, and staff access. The legacy Next.js admin remains available as a fallback."
    >
      <WorkspaceSection
        title="Primary admin entry"
        description="The preferred local and production entry is the Vite admin app. Public, customer, partner, and vendor portals remain in Next.js."
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Local development: <span className="font-medium text-foreground">{ADMIN_APP_URL}/login</span>
          </p>

          <div className="flex flex-wrap gap-3">
            <ActionButton
              href={`${ADMIN_APP_URL}/login`}
              variant="primary"
              rightIcon={<ArrowUpRight className="h-4 w-4" />}
            >
              Open Vite admin login
            </ActionButton>
            <ActionButton
              href={FALLBACK_DASHBOARD_URL}
              variant="secondary"
              rightIcon={<ExternalLink className="h-4 w-4" />}
            >
              Open legacy admin fallback
            </ActionButton>
          </div>
        </div>
      </WorkspaceSection>

      <WorkspaceSection
        title="Cutover notice"
        description="This page stays in place so old Next.js admin routes remain as a documented fallback rather than a primary entry point."
      >
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="space-y-1 text-sm leading-6">
            <p className="font-medium">Admin login now happens in the Vite app.</p>
            <p>
              The Next.js admin path is retained for fallback and migration verification only. It should not be used
              as the primary login surface.
            </p>
          </div>
        </div>
      </WorkspaceSection>
    </PortalPage>
  );
}
