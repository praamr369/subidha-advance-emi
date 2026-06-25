"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import type { NavigationRole } from "@/config/navigation";
import { businessSetupKeys } from "@/lib/query-keys";
import { ROUTES } from "@/lib/routes";
import {
  getSetupChecklist,
  type SetupChecklistItem,
} from "@/services/business-setup";

type WorkflowScope = {
  label: string;
  pathPrefix: string;
};

const ADMIN_SENSITIVE_SCOPES: WorkflowScope[] = [
  { label: "Admin dashboard", pathPrefix: ROUTES.admin.dashboard },
  { label: "Subscriptions", pathPrefix: ROUTES.admin.subscriptions },
  { label: "Subscription requests", pathPrefix: ROUTES.admin.subscriptionRequests },
  { label: "Payments", pathPrefix: ROUTES.admin.payments },
  { label: "Finance collection", pathPrefix: ROUTES.admin.financeCollect },
  { label: "Billing", pathPrefix: ROUTES.admin.billing },
  { label: "Lucky draws", pathPrefix: ROUTES.admin.luckyDraws },
  { label: "Products", pathPrefix: ROUTES.admin.products },
  { label: "Batches", pathPrefix: ROUTES.admin.batches },
];

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Unable to verify business setup readiness right now.";
}

function isAdminBusinessSetupPage(pathname: string): boolean {
  return pathname.startsWith(ROUTES.admin.settingsBusinessSetup);
}

function resolveAdminScope(pathname: string): WorkflowScope | null {
  if (isAdminBusinessSetupPage(pathname)) {
    return null;
  }

  const exactDashboard = pathname === ROUTES.admin.dashboard;
  if (exactDashboard) {
    return ADMIN_SENSITIVE_SCOPES[0];
  }

  return (
    ADMIN_SENSITIVE_SCOPES.find((scope) => {
      if (scope.pathPrefix === ROUTES.admin.dashboard) return false;
      return pathname === scope.pathPrefix || pathname.startsWith(`${scope.pathPrefix}/`);
    }) ?? null
  );
}

function isCashierSensitivePath(pathname: string): boolean {
  return (
    pathname === ROUTES.cashier.collect ||
    pathname.startsWith(`${ROUTES.cashier.collect}/`) ||
    pathname === ROUTES.cashier.payments ||
    pathname.startsWith(`${ROUTES.cashier.payments}/`)
  );
}

function isMissingRequiredItem(item: SetupChecklistItem): boolean {
  return item.level === "required" && item.status !== "complete";
}

export default function BusinessSetupWorkflowBanner({
  role,
  pathname,
}: {
  role: NavigationRole;
  pathname: string;
}) {
  const adminScope = role === "ADMIN" ? resolveAdminScope(pathname) : null;
  const showCashierBanner = role === "CASHIER" && isCashierSensitivePath(pathname);
  const shouldFetchChecklist = Boolean(adminScope);

  const checklistQuery = useQuery({
    queryKey: businessSetupKeys.checklist(),
    queryFn: getSetupChecklist,
    enabled: shouldFetchChecklist,
  });

  const checklist = checklistQuery.data ?? null;
  const loading = shouldFetchChecklist && checklistQuery.isPending;
  const error = checklistQuery.error ? toErrorMessage(checklistQuery.error) : null;

  const missingRequiredItems = useMemo(() => {
    if (!checklist) return [];
    return checklist.items.filter(isMissingRequiredItem);
  }, [checklist]);

  if (showCashierBanner) {
    return (
      <section
        className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900"
        data-testid="business-setup-readiness-banner"
      >
        <div className="text-sm font-semibold">Counter pre-flight reminder</div>
        <p className="mt-1 text-sm leading-6">
          If counter collection or receipt workflows look incomplete, pause live posting and ask admin to verify the
          business setup checklist before continuing operations.
        </p>
      </section>
    );
  }

  if (!adminScope) {
    return null;
  }

  if (loading) {
    return (
      <section
        className="mb-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
        aria-busy="true"
        aria-label="Checking business setup readiness"
      >
        Checking setup readiness for this workflow...
      </section>
    );
  }

  if (error) {
    return (
      <section
        className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900"
        data-testid="business-setup-readiness-banner"
      >
        <div className="text-sm font-semibold">Setup readiness could not be verified</div>
        <p className="mt-1 text-sm leading-6">{error}</p>
        <div className="mt-2 flex flex-wrap gap-3">
          <button
            type="button"
            className="text-sm font-medium underline"
            onClick={() => void checklistQuery.refetch()}
          >
            Retry check
          </button>
          <Link className="text-sm font-medium underline" href={ROUTES.admin.settingsBusinessSetupChecklist}>
            Open checklist
          </Link>
        </div>
      </section>
    );
  }

  if (!checklist || checklist.is_ready_for_go_live) {
    return null;
  }

  const topMissingItems = missingRequiredItems.slice(0, 3);
  const primaryActionHref = topMissingItems[0]?.route || ROUTES.admin.settingsBusinessSetupChecklist;

  return (
    <section
      className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900"
      data-testid="business-setup-readiness-banner"
    >
      <div className="text-sm font-semibold">Setup incomplete for live operations</div>
      <p className="mt-1 text-sm leading-6">
        {adminScope.label} is available, but required first-run setup is still incomplete. Proceed carefully for review,
        and complete blockers before live financial posting.
      </p>

      {topMissingItems.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {topMissingItems.map((item) => (
            <li key={item.key}>{item.label}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-3">
        <Link
          href={primaryActionHref}
          className="inline-flex items-center rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
        >
          Resolve top blocker
        </Link>
        <Link
          href={ROUTES.admin.settingsBusinessSetupChecklist}
          className="inline-flex items-center rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
        >
          Open setup checklist
        </Link>
      </div>
    </section>
  );
}
