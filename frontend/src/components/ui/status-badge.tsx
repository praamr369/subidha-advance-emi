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
  default:
    "border-white/80 bg-white/80 text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]",
  neutral:
    "border-white/80 bg-white/80 text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]",
  success:
    "border-emerald-200/80 bg-emerald-50/90 text-emerald-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]",
  warning:
    "border-amber-200/80 bg-amber-50/90 text-amber-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]",
  danger:
    "border-red-200/80 bg-red-50/90 text-red-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]",
  info:
    "border-sky-200/80 bg-sky-50/90 text-sky-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]",
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
        "inline-flex items-center rounded-full border font-medium backdrop-blur",
        size === "md" ? "gap-2 px-3.5 py-1.5 text-sm" : "gap-1.5 px-2.5 py-1 text-xs",
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
