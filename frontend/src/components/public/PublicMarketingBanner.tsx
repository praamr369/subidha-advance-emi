import { Typography } from "@/components/ui/typography";
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
        "public-reveal relative overflow-hidden rounded-[2rem] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(246,239,229,0.94))] p-6 shadow-[0_24px_70px_-50px_rgba(87,54,31,0.58)] dark:border-border/70 dark:bg-[linear-gradient(135deg,rgba(45,37,30,0.92),rgba(33,29,25,0.94))]",
        className
      )}
    >
      <div className="pointer-events-none absolute -right-10 top-0 h-36 w-36 rounded-full bg-[rgba(214,170,94,0.22)] blur-2xl" />
      <div className="pointer-events-none absolute -left-12 bottom-0 h-32 w-32 rounded-full bg-[rgba(112,72,42,0.14)] blur-2xl" />
      <div className="relative z-10">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h2>
        <Typography className="mt-2 max-w-3xl sm:text-base">{description}</Typography>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <article key={item.title} className="public-card-sm public-card-animated px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
