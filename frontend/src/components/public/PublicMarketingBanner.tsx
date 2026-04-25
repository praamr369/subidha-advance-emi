import { cn } from "@/lib/utils";

type BannerItem = {
  title: string;
  description: string;
};

type PublicMarketingBannerProps = {
  eyebrow: string;
  title: string;
  description: string;
  items: ReadonlyArray<BannerItem>;
  className?: string;
};

export default function PublicMarketingBanner({
  eyebrow,
  title,
  description,
  items,
  className,
}: PublicMarketingBannerProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[2rem] border border-white/75 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(244,246,250,0.95))] p-6 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.62)]",
        className
      )}
    >
      <div className="pointer-events-none absolute -right-10 top-0 h-32 w-32 rounded-full bg-blue-100/60 blur-2xl" />
      <div className="pointer-events-none absolute -left-12 bottom-0 h-28 w-28 rounded-full bg-amber-100/50 blur-2xl" />
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</div>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <article key={item.title} className="public-card-sm px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
