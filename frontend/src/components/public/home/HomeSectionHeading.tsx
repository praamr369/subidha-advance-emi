import { tone } from "@/components/public/ui/tone";
import { cn } from "@/lib/utils";

type HomeSectionHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
  className?: string;
};

export default function HomeSectionHeading({ eyebrow, title, description, className }: HomeSectionHeadingProps) {
  return (
    <div className={cn("flex max-w-3xl flex-col gap-2", className)}>
      <p className={cn("text-xs font-semibold uppercase tracking-[0.14em]", tone.accentText)}>{eyebrow}</p>
      <h2 className={cn("text-balance text-2xl font-semibold leading-snug tracking-tight sm:text-3xl", tone.text)}>{title}</h2>
      {description ? <p className={cn("text-sm leading-6 sm:text-base sm:leading-7", tone.muted)}>{description}</p> : null}
    </div>
  );
}
