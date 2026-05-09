"use client";

export function EntityTimeline({
  points,
  title = "Entity Timeline",
}: {
  title?: string;
  points: Array<{ label: string; value: string }>;
}) {
  return (
    <section className="rounded-2xl border border-white/80 bg-white/80 p-5">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="mt-4 space-y-3">
        {points.map((point, index) => (
          <div key={`kpi-timeline-${point.label}-${index}`} className="flex items-start gap-3">
            <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-amber-700" />
            <div>
              <div className="text-sm font-semibold text-foreground">{point.label}</div>
              <div className="text-xs text-muted-foreground">{point.value}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
