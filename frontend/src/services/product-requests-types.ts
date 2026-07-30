// Type-specific product request workflows and configurations

export type ProductRequestType = "ADVANCE_EMI" | "DIRECT_SALE" | "RENT" | "LEASE";

export const REQUEST_TYPE_LABELS: Record<ProductRequestType, string> = {
  ADVANCE_EMI: "Advance EMI",
  DIRECT_SALE: "Direct Sale",
  RENT: "Rent",
  LEASE: "Lease",
};

export const REQUEST_TYPE_DESCRIPTIONS: Record<ProductRequestType, string> = {
  ADVANCE_EMI: "EMI subscription with lucky number draw",
  DIRECT_SALE: "Direct product sale with invoice",
  RENT: "Rental subscription",
  LEASE: "Lease subscription",
};

export type WorkflowStep = "link_customer" | "select_batch" | "pricing" | "review" | "approve";

export const REQUEST_TYPE_WORKFLOW: Record<ProductRequestType, WorkflowStep[]> = {
  ADVANCE_EMI: ["link_customer", "select_batch", "review", "approve"],
  DIRECT_SALE: ["link_customer", "pricing", "review", "approve"],
  RENT: ["link_customer", "pricing", "review", "approve"],
  LEASE: ["link_customer", "pricing", "review", "approve"],
};

export const REQUEST_TYPE_STEP_LABELS: Record<WorkflowStep, string> = {
  link_customer: "Link Customer",
  select_batch: "Select Batch",
  pricing: "Set Pricing",
  review: "Review & Approve",
  approve: "Approve",
};

export function getNextStep(
  requestType: ProductRequestType,
  currentStep: WorkflowStep
): WorkflowStep | null {
  const workflow = REQUEST_TYPE_WORKFLOW[requestType];
  const currentIndex = workflow.indexOf(currentStep);
  if (currentIndex < 0 || currentIndex >= workflow.length - 1) return null;
  return workflow[currentIndex + 1];
}

export function getPreviousStep(
  requestType: ProductRequestType,
  currentStep: WorkflowStep
): WorkflowStep | null {
  const workflow = REQUEST_TYPE_WORKFLOW[requestType];
  const currentIndex = workflow.indexOf(currentStep);
  if (currentIndex <= 0) return null;
  return workflow[currentIndex - 1];
}

export function isStepCompleted(
  requestType: ProductRequestType,
  step: WorkflowStep,
  data: Record<string, unknown>
): boolean {
  if (step === "link_customer") {
    return Boolean(data.customer_id);
  }
  if (step === "select_batch") {
    return Boolean(data.batch_id);
  }
  if (step === "pricing") {
    // Pricing is considered complete if reviewed
    return true;
  }
  if (step === "review") {
    return Boolean(data.review_note);
  }
  if (step === "approve") {
    return data.status === "APPROVED";
  }
  return false;
}

export const STEP_COLORS: Record<WorkflowStep, string> = {
  link_customer: "text-blue-600",
  select_batch: "text-purple-600",
  pricing: "text-amber-600",
  review: "text-cyan-600",
  approve: "text-emerald-600",
};
