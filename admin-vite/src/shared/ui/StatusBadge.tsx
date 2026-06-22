import { clsx } from "clsx";

type Variant = "success" | "warning" | "danger" | "info" | "neutral";

const variants: Record<Variant, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
  info: "bg-blue-50 text-blue-700 ring-blue-200",
  neutral: "bg-stone-100 text-stone-600 ring-stone-200",
};

type Props = {
  label: string;
  variant?: Variant;
};

export function StatusBadge({ label, variant = "neutral" }: Props) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        variants[variant]
      )}
    >
      {label}
    </span>
  );
}
