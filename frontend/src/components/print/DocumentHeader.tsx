import { brandConfig } from "@/config/brand";

type DocumentHeaderProps = {
  title: string;
  subtitle?: string;
  reference?: string;
  meta?: string;
};

export default function DocumentHeader({
  title,
  subtitle,
  reference,
  meta,
}: DocumentHeaderProps) {
  return (
    <div className="flex flex-col gap-5 border-b border-border pb-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <img
          src={brandConfig.publicLogoSrc}
          alt={brandConfig.publicLogoAlt}
          className="h-14 w-14 rounded-2xl border border-border bg-white object-contain p-2"
        />
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {brandConfig.companyName}
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>

      {(reference || meta) ? (
        <div className="rounded-2xl border border-border bg-background p-4 lg:min-w-[280px]">
          {reference ? (
            <div className="text-sm font-semibold text-foreground">{reference}</div>
          ) : null}
          {meta ? (
            <div className="mt-2 text-sm text-muted-foreground">{meta}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

