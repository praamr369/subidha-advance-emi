import { cn } from "@/lib/utils";

export type TimelineStep = {
  title: string;
  description: string;
};

type ProcessTimelineProps = {
  steps: ReadonlyArray<TimelineStep>;
  className?: string;
};

export default function ProcessTimeline({ steps, className }: ProcessTimelineProps) {
  return (
    <section
      className={cn(
        "rounded-[2rem] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-6 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.62)]",
        className
      )}
    >
      <ol className="grid gap-3">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="grid gap-3 rounded-[1.6rem] border border-border bg-card px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] sm:grid-cols-[3.25rem_1fr]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-slate-950/90 text-sm font-semibold text-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.72)]">
              {index + 1}
            </div>
            <div>
              <div className="text-base font-semibold text-foreground">
                {step.title}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {step.description}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

