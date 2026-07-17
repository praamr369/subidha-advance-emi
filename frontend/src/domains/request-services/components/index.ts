// Request Services Components - Modernized Desktop UI
// Aligns with admin dashboard design system (ERPPageShell + CollapsibleSection + EnhancedModuleCard)

export { default as RequestStatusBadge } from "./RequestStatusBadge";
export type { } from "./RequestStatusBadge";

export { default as RequestWorkflowCard } from "./RequestWorkflowCard";
export type { WorkflowAction } from "./RequestWorkflowCard";

export { default as PricingBreakdownCard } from "./PricingBreakdownCard";

export { default as RequestActionHistory } from "./RequestActionHistory";
export type { RequestAction } from "./RequestActionHistory";

// Reusable components from product-requests (import separately)
// export { default as StepIndicator } from "@/domains/product-requests/components/StepIndicator";
// export { default as CustomerDetailsCard } from "@/domains/product-requests/components/CustomerDetailsCard";
// export { default as CustomerDetailsHover } from "@/domains/product-requests/components/CustomerDetailsHover";
// export { default as ApprovalConfirmDialog } from "@/domains/product-requests/components/ApprovalConfirmDialog";
