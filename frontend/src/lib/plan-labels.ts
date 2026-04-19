export const ADVANCE_EMI_LABEL = "Advance EMI";

export function formatPlanTypeLabel(planType?: string | null): string {
  const normalized = (planType || "").trim().toUpperCase();
  if (!normalized) return "—";

  switch (normalized) {
    case "EMI":
      return ADVANCE_EMI_LABEL;
    case "RENT":
      return "Rent";
    case "LEASE":
      return "Lease";
    default:
      return normalized;
  }
}

