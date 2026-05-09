import Link from "next/link";

import { cn } from "@/lib/utils";

type CtaLink = {
  href: string;
  label: string;
  variant?: "primary" | "secondary";
};

type CtaBannerProps = {
  title: string;
  description: string;
  actions: ReadonlyArray<CtaLink>;
  className?: string;
};

export default function CtaBanner({ title, description, actions, className }: CtaBannerProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[2.25rem] border border-white/75 bg-[radial-gradient(circle_at_top_right,rgba(148,163,184,0.16),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(251,191,36,0.16),transparent_26%),linear-gradient(140deg,rgba(255,255,255,0.98),rgba(250,250,249,0.92))] p-7 shadow-[0_30px_80px_-54px_rgba(15,23,42,0.68)] sm:p-9",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
      <div className="pointer-events-none absolute -right-14 top-6 h-44 w-44 rounded-full bg-slate-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -left-10 bottom-0 h-36 w-36 rounded-full bg-amber-200/20 blur-3xl" />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl">
          <h3 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
            {description}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={cn(
                action.variant === "primary" ? "public-action-primary" : "public-action-secondary"
              )}
            >
              {action.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
