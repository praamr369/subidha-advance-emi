import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

type EmptyStateProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "info";
};

export default function EmptyState({
  title = "No data",
  description,
  action,
  icon,
  tone = "default",
}: EmptyStateProps) {
  const shellClassName =
    tone === "info"
      ? "border-sky-200/80 bg-sky-50/65"
      : "border-border bg-[var(--surface-muted)]/45";
  const iconClassName =
    tone === "info"
      ? "border-sky-200 bg-white text-sky-700"
      : "border-border bg-[var(--surface-card-elevated)] text-muted-foreground";

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] ${shellClassName}`}
    >
      <div className={`rounded-full border p-3 ${iconClassName}`}>
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
