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
    "border-border bg-[color-mix(in_oklab,var(--surface-muted)_88%,var(--surface-card-elevated)_12%)] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]",
  neutral:
    "border-border bg-[color-mix(in_oklab,var(--surface-muted)_88%,var(--surface-card-elevated)_12%)] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]",
  success:
    "border-emerald-200/80 bg-[color-mix(in_oklab,oklch(0.96_0.04_155)_88%,var(--surface-card-elevated)_12%)] text-emerald-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]",
  warning:
    "border-amber-200/80 bg-[color-mix(in_oklab,oklch(0.96_0.05_86)_88%,var(--surface-card-elevated)_12%)] text-amber-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]",
  danger:
    "border-red-200/80 bg-[color-mix(in_oklab,oklch(0.96_0.035_25)_88%,var(--surface-card-elevated)_12%)] text-red-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]",
  info:
    "border-sky-200/80 bg-[color-mix(in_oklab,oklch(0.95_0.035_235)_88%,var(--surface-card-elevated)_12%)] text-sky-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]",
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
        "inline-flex items-center rounded-full border font-semibold tracking-[0.01em] shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]",
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
