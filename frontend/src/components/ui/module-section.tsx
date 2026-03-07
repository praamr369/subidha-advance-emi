import type { ReactNode } from "react";

type ModuleSectionProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export default function ModuleSection({
  title,
  subtitle,
  children,
}: ModuleSectionProps) {
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
        <p className="text-slate-600">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}
