import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

type Breadcrumb = { label: string; href?: string };
type Action = { label: string; href: string; variant?: "primary" | "secondary" };

type PublicPageShellProps = {
  title: string;
  subtitle?: string;
  breadcrumbs?: ReadonlyArray<Breadcrumb>;
  actions?: ReadonlyArray<Action>;
  children: ReactNode;
  maxWidth?: number;
  className?: string;
};

export default function PublicPageShell({
  title,
  subtitle,
  breadcrumbs = [],
  actions = [],
  children,
  maxWidth = 1280,
  className,
}: PublicPageShellProps) {
  return (
    <main
      className={cn(
        "mx-auto flex w-full flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10",
        className
      )}
      style={{ maxWidth }}
    >
      {breadcrumbs.length > 0 ? (
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
        >
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <div key={`${crumb.label}-${index}`} className="flex items-center gap-2">
                {crumb.href && !isLast ? (
                  <Link
                    href={crumb.href}
                    className="inline-flex items-center rounded-full border border-white/75 bg-white/80 px-3 py-1 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] transition hover:bg-white hover:text-foreground"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-primary/60 bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-[0_12px_28px_-20px_rgba(30,64,175,0.72)]">
                    {crumb.label}
                  </span>
                )}
                {!isLast ? <ChevronRight className="h-4 w-4 text-slate-400" /> : null}
              </div>
            );
          })}
        </nav>
      ) : null}

      <header className="relative overflow-hidden rounded-[2.25rem] border border-white/75 bg-[radial-gradient(circle_at_top_right,rgba(125,211,252,0.16),transparent_28%),radial-gradient(circle_at_top_left,rgba(251,191,36,0.14),transparent_24%),linear-gradient(140deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-7 shadow-[0_32px_90px_-56px_rgba(15,23,42,0.68)] sm:p-10">
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-slate-200/90 to-transparent" />
        <div className="pointer-events-none absolute -right-20 top-0 h-48 w-48 rounded-full bg-sky-200/30 blur-3xl" />
        <div className="pointer-events-none absolute left-0 top-24 h-40 w-40 rounded-full bg-amber-200/25 blur-3xl" />

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {subtitle}
              </p>
            ) : null}
          </div>

          {actions.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {actions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className={cn(
                    "inline-flex h-11 items-center rounded-xl border px-5 text-sm font-semibold shadow-[0_18px_40px_-28px_rgba(15,23,42,0.72)] transition hover:-translate-y-0.5",
                    action.variant === "primary"
                      ? "border-slate-950/10 bg-slate-950 text-white"
                      : "border-white/80 bg-white/80 text-foreground hover:bg-white"
                  )}
                >
                  {action.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      {children}
    </main>
  );
}

