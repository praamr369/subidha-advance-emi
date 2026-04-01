import { resolveStatusPresentation } from "@/config/status";
import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status?: string | null;
  label?: string | null;
  isOverdue?: boolean;
  className?: string;
  size?: "sm" | "md";
  hideIcon?: boolean;
};

const toneClassName = {
  default: "border-slate-200 bg-slate-100 text-slate-800",
  neutral: "border-slate-200 bg-slate-100 text-slate-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
} as const;

export default function StatusBadge({
  status,
  label,
  isOverdue = false,
  className,
  size = "sm",
  hideIcon = false,
}: StatusBadgeProps) {
  const presentation = resolveStatusPresentation(status, {
    isOverdue,
    label,
  });
  const Icon = presentation.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        size === "md" ? "gap-2 px-3 py-1.5 text-sm" : "gap-1.5 px-2.5 py-1 text-xs",
        toneClassName[presentation.tone],
        className
      )}
      title={presentation.token}
    >
      {!hideIcon ? (
        <Icon className={cn(size === "md" ? "h-4 w-4" : "h-3.5 w-3.5")} />
      ) : null}
      <span>{presentation.label}</span>
    </span>
  );
}
