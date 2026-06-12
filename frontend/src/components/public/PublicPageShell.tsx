import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import PublicHeroBanner from "@/components/public/PublicHeroBanner";
import { buildBreadcrumbJsonLd } from "@/lib/public-seo";
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
  heroSlot?: ReactNode;
  hero?: {
    eyebrow?: string;
    imageSrc?: string;
    imageAlt?: string;
    imageExists?: boolean;
    imagePosition?: "left" | "right" | "center";
    badges?: readonly string[];
    compact?: boolean;
    legalVariant?: boolean;
    imagePriority?: boolean;
  };
};

function buildBreadcrumbSchemaItems(breadcrumbs: ReadonlyArray<Breadcrumb>) {
  return breadcrumbs.map((crumb, index) => ({
    name: crumb.label,
    path: crumb.href || (index === breadcrumbs.length - 1 ? undefined : "/"),
  }));
}

export default function PublicPageShell({
  title,
  subtitle,
  breadcrumbs = [],
  actions = [],
  children,
  maxWidth = 1280,
  className,
  heroSlot,
  hero,
}: PublicPageShellProps) {
  const primaryAction = actions.find((action) => action.variant === "primary");
  const secondaryAction = actions.find((action) => action.variant !== "primary");
  const breadcrumbJsonLd =
    breadcrumbs.length > 1 ? buildBreadcrumbJsonLd(buildBreadcrumbSchemaItems(breadcrumbs)) : null;

  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10",
        className
      )}
      style={{ maxWidth }}
    >
      {breadcrumbJsonLd ? (
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />
      ) : null}

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
                    className="inline-flex items-center rounded-full border border-[color-mix(in_oklab,var(--surface-border-strong)_76%,white_24%)] bg-[var(--surface-card-glass)] px-3 py-1 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] transition hover:bg-[var(--surface-card-elevated)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45 focus-visible:ring-offset-2"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-primary/30 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--primary)_92%,white_8%),color-mix(in_oklab,var(--primary)_86%,black_14%))] px-3 py-1 text-xs font-semibold text-primary-foreground shadow-[0_14px_30px_-24px_color-mix(in_oklab,var(--primary)_48%,transparent)]">
                    {crumb.label}
                  </span>
                )}
                {!isLast ? <ChevronRight className="h-4 w-4 text-slate-400" /> : null}
              </div>
            );
          })}
        </nav>
      ) : null}

      {heroSlot ?? (
        <PublicHeroBanner
          title={title}
          subtitle={subtitle}
          eyebrow={hero?.eyebrow}
          imageSrc={hero?.imageSrc}
          imageAlt={hero?.imageAlt}
          imageExists={hero?.imageExists}
          imagePosition={hero?.imagePosition}
          badges={hero?.badges}
          compact={hero?.compact}
          legalVariant={hero?.legalVariant}
          imagePriority={hero?.imagePriority}
          secondaryAction={secondaryAction}
          primaryAction={primaryAction}
        />
      )}

      {children}
    </div>
  );
}
