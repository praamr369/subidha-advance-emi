// frontend/src/components/ui/module-section.tsx
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type ModuleSectionProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  className?: string;
};

export default function ModuleSection({
  title,
  subtitle,
  children,
  className,
}: ModuleSectionProps) {
  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        <p className="mt-1 text-muted-foreground">{subtitle}</p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}