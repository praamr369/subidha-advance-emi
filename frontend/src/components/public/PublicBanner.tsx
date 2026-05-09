import { cn } from "@/lib/utils";

type PublicBannerProps = {
  eyebrow?: string;
  title: string;
  description: string;
  className?: string;
};

export default function PublicBanner({ eyebrow, title, description, className }: PublicBannerProps) {
  return (
    <section className={cn("public-hero p-6 sm:p-8", className)}>
      {eyebrow ? (
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</div>
      ) : null}
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">{description}</p>
    </section>
  );
}
