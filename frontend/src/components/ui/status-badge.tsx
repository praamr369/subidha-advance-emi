type StatusBadgeProps = {
  status: "active" | "pending" | "overdue" | "closed";
};

const statusClassMap: Record<StatusBadgeProps["status"], string> = {
  active: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  overdue: "bg-rose-100 text-rose-700",
  closed: "bg-slate-100 text-slate-700",
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`rounded px-2 py-1 text-xs font-semibold ${statusClassMap[status]}`}>{status}</span>;
}
