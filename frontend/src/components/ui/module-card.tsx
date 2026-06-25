// frontend/src/components/ui/module-card.tsx
import Link from "next/link";
import { ArrowRight } from "lucide-react";

type ModuleCardProps = {
  title: string;
  description: string;
  href: string;
  cta?: string;
  icon?: React.ReactNode;
};

export default function ModuleCard({
  title,
  description,
  href,
  cta = "Open",
  icon,
}: ModuleCardProps) {
  return (
    <article className="group surface-panel-elevated rounded-xl border border-border bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      {icon ? (
        <div className="mb-4 inline-flex rounded-xl border border-border bg-[var(--surface-card-elevated)] p-2.5 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
          {icon}
        </div>
      ) : null}
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      <Link
        href={href}
        className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary transition group-hover:gap-2"
      >
        {cta}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </article>
  );
}
