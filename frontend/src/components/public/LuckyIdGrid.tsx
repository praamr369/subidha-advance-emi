import { cn } from "@/lib/utils";

type LuckyIdGridProps = {
  highlightSlot?: number | null;
  className?: string;
};

export default function LuckyIdGrid({ highlightSlot, className }: LuckyIdGridProps) {
  const cells = Array.from({ length: 100 }, (_, i) => i);

  return (
    <section
      className={cn(
        "rounded-[2rem] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-6 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.62)]",
        className
      )}
    >
      <div className="mb-4 space-y-1">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Lucky ID range · Explanatory only
        </div>
        <h3 className="text-base font-semibold text-foreground">
          00 – 99: One Lucky ID per batch slot
        </h3>
        <p className="text-sm leading-6 text-muted-foreground">
          Each batch has up to 100 numbered slots (00 to 99). A customer&apos;s Lucky ID corresponds to one slot in
          one batch. This grid is for visual explanation only — actual assignment is controlled by the
          branch system and is not performed on this page.
        </p>
      </div>

      <div
        className="grid grid-cols-10 gap-1.5"
        role="list"
        aria-label="Lucky ID slot grid (explanatory)"
      >
        {cells.map((n) => {
          const id = String(n).padStart(2, "0");
          const isHighlighted = highlightSlot !== null && highlightSlot !== undefined && n === highlightSlot;
          return (
            <div
              key={id}
              role="listitem"
              aria-label={`Lucky ID ${id}`}
              className={cn(
                "lucky-id-cell flex aspect-square items-center justify-center rounded-xl border text-[11px] font-bold tabular-nums",
                isHighlighted
                  ? "border-primary/60 bg-[linear-gradient(145deg,color-mix(in_oklab,var(--primary)_18%,white),color-mix(in_oklab,var(--primary)_10%,white))] text-primary shadow-[0_6px_18px_-10px_color-mix(in_oklab,var(--primary)_40%,transparent)]"
                  : "border-white/80 bg-white/80 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
              )}
            >
              {id}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
        <strong className="font-semibold text-foreground/70">Disclaimer:</strong>{" "}
        This grid is for customer education only. Lucky IDs are assigned inside the core system by branch staff. A customer may hold multiple Lucky IDs across different batches. Lucky ID assignment does not guarantee winning the monthly draw.
      </p>
    </section>
  );
}
