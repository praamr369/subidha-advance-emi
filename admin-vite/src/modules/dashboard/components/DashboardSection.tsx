import { type ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  badge?: string;
};

export function DashboardSection({ title, children, badge }: Props) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white">
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
        <h3 className="text-sm font-semibold text-stone-700">{title}</h3>
        {badge && (
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500">
            {badge}
          </span>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
