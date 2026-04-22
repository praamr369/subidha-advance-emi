import type { NavigationRole } from "@/config/navigation";
import { ROUTES } from "@/lib/routes";

export type WorkflowId =
  | "admin.createCustomer"
  | "admin.createDirectSale"
  | "admin.createSubscription"
  | "admin.collectPayment"
  | "admin.openSupplierPayables"
  | "partner.submitCollection"
  | "customer.createSubscriptionRequest";

export type WorkflowSurface = "drawer" | "route";

export type WorkflowDefinition = {
  id: WorkflowId;
  label: string;
  description: string;
  roles: ReadonlyArray<NavigationRole>;
  icon: "customers" | "subscriptions" | "collectPayment" | "payments" | "billing" | "finance";
  canonicalHref: string;
  surface: WorkflowSurface;
  safetyNote?: string;
};

export const WORKFLOWS: ReadonlyArray<WorkflowDefinition> = [
  {
    id: "admin.createCustomer",
    label: "Create customer",
    description: "Create a customer profile + login. Canonical KYC onboarding workflow.",
    roles: ["ADMIN"],
    icon: "customers",
    canonicalHref: `${ROUTES.admin.customers}/create`,
    surface: "drawer",
  },
  {
    id: "admin.createDirectSale",
    label: "Open direct sale desk",
    description: "Create or continue a retail direct-sale bill without mixing it into the subscription sale workflow.",
    roles: ["ADMIN"],
    icon: "billing",
    canonicalHref: ROUTES.admin.billingDirectSales,
    surface: "route",
  },
  {
    id: "admin.createSubscription",
    label: "Create subscription sale",
    description: "Create EMI/Rent/Lease contracts with deterministic schedule generation and partner-safe linkage.",
    roles: ["ADMIN"],
    icon: "subscriptions",
    canonicalHref: ROUTES.admin.subscriptionsCreate,
    surface: "drawer",
  },
  {
    id: "admin.collectPayment",
    label: "Collect subscription payment",
    description: "Post a subscription EMI collection using backend-controlled allocation and reconciliation-safe posting.",
    roles: ["ADMIN"],
    icon: "collectPayment",
    canonicalHref: ROUTES.admin.paymentsCreate,
    surface: "drawer",
    safetyNote: "Requires explicit confirmation before posting.",
  },
  {
    id: "admin.openSupplierPayables",
    label: "Open supplier payables",
    description: "Review supplier master, purchase-bill exposure, and payable settlement workflow in one accounting-safe rail.",
    roles: ["ADMIN"],
    icon: "finance",
    canonicalHref: ROUTES.admin.accountingVendors,
    surface: "route",
  },
  {
    id: "partner.submitCollection",
    label: "Submit collection",
    description: "Partner-scoped collection submission (does not bypass admin posting controls).",
    roles: ["PARTNER"],
    icon: "payments",
    canonicalHref: "/partner/collections/create",
    surface: "drawer",
    safetyNote: "Partner submissions remain scoped; admin audit and posting controls continue to apply.",
  },
  {
    id: "customer.createSubscriptionRequest",
    label: "Request subscription",
    description: "Customer self-service intake. Creates a request only (admin approval creates the real contract).",
    roles: ["CUSTOMER"],
    icon: "subscriptions",
    canonicalHref: "/customer/subscription-requests/create",
    surface: "drawer",
    safetyNote: "Requests stay pending until admin approval. No money is collected here.",
  },
] as const;

export function workflowsForRole(role: NavigationRole): WorkflowDefinition[] {
  return WORKFLOWS.filter((workflow) => workflow.roles.includes(role));
}
