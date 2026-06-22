import { Inbox } from "lucide-react";
import { type ReactNode } from "react";

type Props = {
  title?: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({
  title = "No data",
  description = "There are no records to display.",
  action,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Inbox size={48} className="mb-4 text-stone-300" />
      <h3 className="text-lg font-medium text-stone-700">{title}</h3>
      <p className="mt-1 text-sm text-stone-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
