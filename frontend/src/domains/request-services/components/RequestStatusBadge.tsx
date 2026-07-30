"use client";

interface RequestStatusBadgeProps {
  status: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  animated?: boolean;
}

export default function RequestStatusBadge({
  status,
  label,
  size = "md",
  animated = false,
}: RequestStatusBadgeProps) {
  const getStatusStyle = (st: string) => {
    const styles: Record<string, { bg: string; text: string; dot: string }> = {
      DRAFT: { bg: "bg-slate-100", text: "text-slate-800", dot: "bg-slate-500" },
      QUOTE_SENT: { bg: "bg-blue-100", text: "text-blue-800", dot: "bg-blue-500" },
      QUOTE_ACCEPTED: { bg: "bg-purple-100", text: "text-purple-800", dot: "bg-purple-500" },
      APPROVED: { bg: "bg-emerald-100", text: "text-emerald-800", dot: "bg-emerald-500" },
      COMPLETED: { bg: "bg-teal-100", text: "text-teal-800", dot: "bg-teal-500" },
      REJECTED: { bg: "bg-red-100", text: "text-red-800", dot: "bg-red-500" },
      SUBMITTED: { bg: "bg-amber-100", text: "text-amber-800", dot: "bg-amber-500" },
      PENDING: { bg: "bg-blue-100", text: "text-blue-800", dot: "bg-blue-500" },
    };
    return styles[st] || styles.DRAFT;
  };

  const getSizeClass = (sz: string) => {
    const sizes: Record<string, string> = {
      sm: "px-2 py-1 text-xs",
      md: "px-3 py-1.5 text-sm",
      lg: "px-4 py-2 text-base",
    };
    return sizes[sz];
  };

  const style = getStatusStyle(status);
  const sizeClass = getSizeClass(size);
  const displayLabel = label || status.replace(/_/g, " ").toUpperCase();

  const statusDescriptions: Record<string, string> = {
    DRAFT: "Request is in draft state, not yet submitted",
    QUOTE_SENT: "Quote has been sent to customer, awaiting response",
    QUOTE_ACCEPTED: "Customer has accepted the quote",
    APPROVED: "Request has been approved",
    COMPLETED: "Request fulfillment is complete",
    REJECTED: "Request has been rejected",
    SUBMITTED: "Request submitted and pending review",
    PENDING: "Pending approval or action",
  };

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${style.bg} ${style.text} font-semibold ${sizeClass} transition cursor-help hover:shadow-md hover:scale-105 group`}
      style={{ borderColor: "rgba(0, 0, 0, 0.1)" }}
      title={statusDescriptions[status] || `Status: ${displayLabel}`}
    >
      <span
        className={`h-3 w-3 rounded-full ${style.dot} ${animated ? "animate-pulse" : ""}`}
      />
      <span className="whitespace-nowrap">{displayLabel}</span>

      {/* Desktop tooltip on hover */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-foreground text-background text-xs rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap">
        {statusDescriptions[status] || `Status: ${displayLabel}`}
      </div>
    </div>
  );
}
