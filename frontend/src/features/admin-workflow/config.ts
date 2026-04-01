import type { WorkflowModule, WorkflowTask } from "@/features/admin-workflow/types";

export const adminWorkflowModules: WorkflowModule[] = [
  {
    id: "customer-master",
    title: "Customer master",
    description: "Customer onboarding, KYC verification, profile hygiene, and duplicate prevention.",
    href: "/admin/customers",
    owner: "Admin operations",
    health: "healthy",
    primaryMetric: "KYC queue",
    supportingMetric: "Profile completeness",
    actions: [
      { label: "Open customers", href: "/admin/customers" },
      { label: "Create customer", href: "/admin/customers/create" },
    ],
  },
  {
    id: "catalog-control",
    title: "Product catalog",
    description: "Price governance, EMI-ready catalog control, and import validation for retail inventory.",
    href: "/admin/products",
    owner: "Catalog team",
    health: "healthy",
    primaryMetric: "Catalog growth",
    supportingMetric: "Import quality",
    actions: [
      { label: "Open products", href: "/admin/products" },
      { label: "Create product", href: "/admin/products/create" },
    ],
  },
  {
    id: "subscription-ops",
    title: "Subscription control",
    description: "Lucky ID allocation, batch linkage, contract activation, and delivery readiness.",
    href: "/admin/subscriptions",
    owner: "Subscription desk",
    health: "attention",
    primaryMetric: "Active contracts",
    supportingMetric: "Winner waivers",
    actions: [
      { label: "Open subscriptions", href: "/admin/subscriptions" },
      { label: "Create subscription", href: "/admin/subscriptions/create" },
    ],
  },
  {
    id: "collections",
    title: "Collections desk",
    description: "EMI collection tracking, payment verification, and receipt-linked payment monitoring.",
    href: "/admin/payments",
    owner: "Collections team",
    health: "attention",
    primaryMetric: "Collections today",
    supportingMetric: "Verification lag",
    actions: [
      { label: "Open payments", href: "/admin/payments" },
      { label: "Collect payment", href: "/admin/payments/create" },
    ],
  },
  {
    id: "batch-governance",
    title: "Batch governance",
    description: "Batch readiness, fill rate visibility, draw scheduling, and batch-level risk control.",
    href: "/admin/batches",
    owner: "Lucky plan desk",
    health: "healthy",
    primaryMetric: "Open batches",
    supportingMetric: "Fill rate",
    actions: [
      { label: "Open batches", href: "/admin/batches" },
      { label: "Create batch", href: "/admin/batches/create" },
    ],
  },
  {
    id: "reconciliation",
    title: "Subscription reconciliation",
    description: "Exception handling for subscription, EMI, and payment integrity before closeout.",
    href: "/admin/reconciliation",
    owner: "Finance control",
    health: "critical",
    primaryMetric: "Open exceptions",
    supportingMetric: "Audit readiness",
    actions: [
      { label: "Open subscription reconciliation", href: "/admin/reconciliation" },
      { label: "Open audit logs", href: "/admin/audit-logs" },
    ],
  },
];

export const defaultWorkflowTasks: WorkflowTask[] = [
  {
    id: "review-overdue",
    title: "Review overdue subscriptions",
    description: "Prioritize collections on accounts with pending EMI pressure.",
    href: "/admin/emis/overdue",
    tone: "warning",
  },
  {
    id: "verify-payments",
    title: "Verify recent payments",
    description: "Cross-check references and flag failed payment evidence.",
    href: "/admin/payments/history",
    tone: "info",
  },
  {
    id: "prepare-next-draw",
    title: "Prepare lucky draw execution",
    description: "Confirm commit, reveal, and winner processing readiness.",
    href: "/admin/lucky-draws/create",
    tone: "default",
  },
  {
    id: "inspect-audit",
    title: "Inspect financial audit trail",
    description: "Review immutable actions before reconciliation sign-off.",
    href: "/admin/audit-logs",
    tone: "danger",
  },
];
