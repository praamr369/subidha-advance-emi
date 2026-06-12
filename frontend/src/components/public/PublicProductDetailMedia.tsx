"use client";

import PublicContentCarousel from "@/components/public/PublicContentCarousel";
import PublicProductMedia from "@/components/public/PublicProductMedia";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import type { PublicProduct } from "@/services/public";

export default function PublicProductDetailMedia({
  product,
  carouselAriaLabel,
  prevLabel,
  nextLabel,
}: {
  product: PublicProduct;
  carouselAriaLabel: string;
  prevLabel: string;
  nextLabel: string;
}) {
  const extras = product.gallery_images ?? [];
  const urls = [...new Set([product.image, ...extras].filter(Boolean))] as string[];
  const badge = product.category || "Public catalogue";

  const renderSlide = (src: string | null | undefined, index: number) => {
    const isPrimaryImage = index === 0;

    return (
      <AspectRatio ratio={5 / 4} className="w-full">
        <PublicProductMedia
          src={src}
          alt={
            isPrimaryImage ? product.name : `${product.name} (${String(index + 1)})`
          }
          badge={badge}
          sizes="(max-width: 1024px) 100vw, 54vw"
          priority={isPrimaryImage}
          quality={isPrimaryImage ? 78 : 70}
          className="absolute inset-0 size-full rounded-[1.7rem]"
          imageClassName="transition duration-500 hover:scale-[1.02]"
          fallbackLabel="Product media pending"
        />
      </AspectRatio>
    );
  };

  if (urls.length >= 2) {
    return (
      <PublicContentCarousel
        ariaLabel={carouselAriaLabel}
        prevLabel={prevLabel}
        nextLabel={nextLabel}
        className="rounded-[inherit]"
      >
        {urls.map((src, index) => (
          <div key={`${src}-${index}`} className="w-full">
            {renderSlide(src, index)}
          </div>
        ))}
      </PublicContentCarousel>
    );
  }

  return renderSlide(urls[0] ?? product.image, 0);
}
