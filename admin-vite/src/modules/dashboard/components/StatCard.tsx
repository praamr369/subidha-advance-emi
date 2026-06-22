import { type LucideIcon } from "lucide-react";
import { clsx } from "clsx";

type Tone = "default" | "success" | "warning" | "danger" | "info";

const toneColors: Record<Tone, string> = {
  default: "bg-stone-50 text-stone-600",
  success: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-50 text-amber-600",
  danger: "bg-red-50 text-red-600",
  info: "bg-blue-50 text-blue-600",
};

type Props = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: Tone;
  sub?: string;
};

export function StatCard({ label, value, icon: Icon, tone = "default", sub }: Props) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-stone-500">{label}</span>
        <div className={clsx("rounded-lg p-2", toneColors[tone])}>
          <Icon size={18} />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-stone-800">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-stone-400">{sub}</p>}
    </div>
  );
}
