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
    "border border-border bg-[color-mix(in_oklab,var(--surface-muted)_88%,var(--surface-card-elevated)_12%)] text-foreground shadow-[var(--badge-inset-highlight)]",
  neutral:
    "border border-border bg-[color-mix(in_oklab,var(--surface-muted)_88%,var(--surface-card-elevated)_12%)] text-foreground shadow-[var(--badge-inset-highlight)]",
  success: "chip-tone-success",
  warning: "chip-tone-warning",
  danger: "chip-tone-danger",
  info: "chip-tone-info",
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

  const title = presentation.hint
    ? `${presentation.label} — ${presentation.hint}`
    : presentation.token
      ? `${presentation.label} (${presentation.token})`
      : presentation.label;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold tracking-[0.01em]",
        size === "md" ? "gap-2 px-3.5 py-1.5 text-sm" : "gap-1.5 px-2.5 py-1 text-xs",
        toneClassName[presentation.tone],
        className
      )}
      title={title}
    >
      {!hideIcon ? (
        <Icon className={cn(size === "md" ? "h-4 w-4" : "h-3.5 w-3.5")} />
      ) : null}
      <span className="tracking-[0.01em]">{presentation.label}</span>
    </span>
  );
}
