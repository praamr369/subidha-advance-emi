"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import DrawerShell from "@/components/ui/DrawerShell";
import { workflowsForRole, type WorkflowDefinition, type WorkflowId } from "@/config/workflows";
import type { NavigationRole } from "@/config/navigation";
import AdminCustomerCreatePage from "@/domains/customers/pages/AdminCustomerCreatePage";
import SubscriptionCreatePage from "@/domains/subscriptions/pages/SubscriptionCreatePage";
import AdminPaymentCollectPage from "@/domains/payments/pages/AdminPaymentCollectPage";
import PartnerCollectionCreatePage from "@/domains/partner/pages/PartnerCollectionCreatePage";
import CustomerSubscriptionRequestCreatePage from "@/domains/subscription-requests/pages/CustomerSubscriptionRequestCreatePage";
import ActionButton from "@/components/ui/ActionButton";
import { cn } from "@/lib/utils";

export type WorkflowLaunchContext = {
  query?: Record<string, string | number | boolean | null | undefined>;
};

type WorkflowState = {
  id: WorkflowId;
  definition: WorkflowDefinition;
  context: WorkflowLaunchContext;
  resultHref: string | null;
};

type WorkflowContextValue = {
  role: NavigationRole;
  workflows: WorkflowDefinition[];
  activeWorkflow: WorkflowState | null;
  openWorkflow: (id: WorkflowId, context?: WorkflowLaunchContext) => void;
  closeWorkflow: () => void;
};

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

function buildQueryString(query: WorkflowLaunchContext["query"] | undefined): string {
  if (!query) return "";
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    params.set(key, String(value));
  });
  const raw = params.toString();
  return raw ? `?${raw}` : "";
}

export function useWorkflowLauncher() {
  const value = useContext(WorkflowContext);
  if (!value) {
    throw new Error("useWorkflowLauncher must be used within WorkflowProvider");
  }
  return value;
}

export default function WorkflowProvider({
  role,
  children,
}: {
  role: NavigationRole;
  children: ReactNode;
}) {
  const router = useRouter();
  const workflows = useMemo(() => workflowsForRole(role), [role]);
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowState | null>(null);

  const closeWorkflow = useCallback(() => setActiveWorkflow(null), []);

  const openWorkflow = useCallback(
    (id: WorkflowId, context: WorkflowLaunchContext = {}) => {
      const definition = workflows.find((workflow) => workflow.id === id);
      if (!definition) return;

      if (definition.surface === "route") {
        router.push(`${definition.canonicalHref}${buildQueryString(context.query)}`);
        return;
      }

      setActiveWorkflow({ id, definition, context, resultHref: null });
    },
    [router, workflows]
  );

  const value = useMemo<WorkflowContextValue>(
    () => ({ role, workflows, activeWorkflow, openWorkflow, closeWorkflow }),
    [activeWorkflow, closeWorkflow, openWorkflow, role, workflows]
  );

  const drawerOpen = Boolean(activeWorkflow);
  const drawerTitle = activeWorkflow?.definition.label ?? "Workflow";
  const drawerDescription = activeWorkflow?.definition.safetyNote ?? "Complete the workflow, then return to your workspace.";
  const queryString = buildQueryString(activeWorkflow?.context.query);
  const resultHref = activeWorkflow?.resultHref;

  const footer = activeWorkflow && resultHref ? (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="text-xs text-muted-foreground">
        Workflow completed.
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton
          variant="outline"
          onClick={() => {
            closeWorkflow();
            router.push(resultHref);
          }}
        >
          Open record
        </ActionButton>
        <ActionButton variant="secondary" onClick={closeWorkflow}>
          Close
        </ActionButton>
      </div>
    </div>
  ) : null;

  return (
    <WorkflowContext.Provider value={value}>
      {children}

      <DrawerShell
        open={drawerOpen}
        title={drawerTitle}
        description={drawerDescription}
        onClose={closeWorkflow}
        size="wide"
        closeOnEscape
        closeOnOverlayClick
        footer={footer ?? undefined}
      >
        {activeWorkflow ? (
          <div className={cn("space-y-5", resultHref ? "pointer-events-none opacity-85" : "")}>
            {activeWorkflow.id === "admin.createCustomer" ? (
              <AdminCustomerCreatePage
                variant="drawer"
                queryString={queryString}
                onCreated={(customerId) =>
                  setActiveWorkflow((current) =>
                    current ? { ...current, resultHref: `/admin/customers/${customerId}` } : current
                  )
                }
              />
            ) : null}

            {activeWorkflow.id === "admin.createSubscription" ? (
              <SubscriptionCreatePage
                variant="drawer"
                queryString={queryString}
                onCreated={(subscriptionId) =>
                  setActiveWorkflow((current) =>
                    current ? { ...current, resultHref: `/admin/subscriptions/${subscriptionId}` } : current
                  )
                }
              />
            ) : null}

            {activeWorkflow.id === "admin.collectPayment" ? (
              <AdminPaymentCollectPage
                variant="drawer"
                queryString={queryString}
                onCreated={(paymentId) =>
                  setActiveWorkflow((current) =>
                    current ? { ...current, resultHref: `/admin/payments/${paymentId}` } : current
                  )
                }
              />
            ) : null}

            {activeWorkflow.id === "partner.submitCollection" ? (
              <PartnerCollectionCreatePage
                variant="drawer"
                queryString={queryString}
                onCreated={(requestId) =>
                  setActiveWorkflow((current) =>
                    current ? { ...current, resultHref: `/partner/collections/${requestId}` } : current
                  )
                }
              />
            ) : null}

            {activeWorkflow.id === "customer.createSubscriptionRequest" ? (
              <CustomerSubscriptionRequestCreatePage
                variant="drawer"
                queryString={queryString}
                onCreated={(requestId) =>
                  setActiveWorkflow((current) =>
                    current ? { ...current, resultHref: `/customer/subscription-requests/${requestId}` } : current
                  )
                }
              />
            ) : null}
          </div>
        ) : null}
      </DrawerShell>
    </WorkflowContext.Provider>
  );
}
