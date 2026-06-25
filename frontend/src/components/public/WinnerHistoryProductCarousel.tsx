"use client";

import PublicContentCarousel from "@/components/public/PublicContentCarousel";
import PublicProductMedia from "@/components/public/PublicProductMedia";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import type { PublicWinner } from "@/services/public";

export default function WinnerHistoryProductCarousel({
  winners,
  ariaCarouselLabel,
  prevLabel,
  nextLabel,
}: {
  winners: PublicWinner[];
  ariaCarouselLabel: string;
  prevLabel: string;
  nextLabel: string;
}) {
  const slides = winners.filter((winner) => Boolean(winner.product_image));
  if (slides.length < 2) {
    return null;
  }

  return (
    <section className="rounded-[2rem] border border-white/75 bg-white/70 p-4 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.6)]">
      <PublicContentCarousel
        ariaLabel={ariaCarouselLabel}
        prevLabel={prevLabel}
        nextLabel={nextLabel}
        className="rounded-[1.5rem]"
      >
        {slides.map((winner) => (
          <div key={winner.id} className="px-2 pb-2 pt-1">
            <div className="rounded-[1.6rem] border border-white/80 bg-white/85 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
              <AspectRatio ratio={16 / 10} className="w-full">
                <PublicProductMedia
                  src={winner.product_image}
                  alt={
                    winner.product_name?.trim()
                      ? winner.product_name
                      : `Prize product · batch ${winner.batch_code}`
                  }
                  sizes="100vw"
                  className="absolute inset-0 size-full rounded-xl"
                  fallbackLabel="Media unavailable"
                />
              </AspectRatio>
              <div className="mt-4 space-y-1 text-sm">
                <div className="font-semibold text-foreground">
                  {winner.product_name?.trim() || "Prize product"}
                </div>
                <div className="text-muted-foreground">
                  Batch {winner.batch_code} · Month {winner.draw_month} · Lucky ID{" "}
                  {winner.lucky_id || "—"}
                </div>
              </div>
            </div>
          </div>
        ))}
      </PublicContentCarousel>
    </section>
  );
}
