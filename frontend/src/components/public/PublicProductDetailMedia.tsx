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
  const imageUrls = [...new Set([product.image, ...extras].filter(Boolean))] as string[];
  
  type MediaItem = { type: "video" | "image"; src: string };
  const items: MediaItem[] = [];
  
  if (product.video) {
    items.push({ type: "video", src: product.video });
  }
  imageUrls.forEach((url) => {
    items.push({ type: "image", src: url });
  });

  const badge = product.category || "Public catalogue";

  const renderSlide = (item: MediaItem, index: number) => {
    const isPrimaryImage = index === 0;

    if (item.type === "video") {
      return (
        <AspectRatio ratio={5 / 4} className="w-full relative overflow-hidden rounded-[1.7rem] bg-black">
          <video
            src={item.src}
            controls
            playsInline
            className="absolute inset-0 size-full object-contain"
          />
        </AspectRatio>
      );
    }

    return (
      <AspectRatio ratio={5 / 4} className="w-full">
        <PublicProductMedia
          src={item.src}
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

  if (items.length >= 2) {
    return (
      <PublicContentCarousel
        ariaLabel={carouselAriaLabel}
        prevLabel={prevLabel}
        nextLabel={nextLabel}
        className="rounded-[inherit]"
      >
        {items.map((item, index) => (
          <div key={`${item.src}-${index}`} className="w-full">
            {renderSlide(item, index)}
          </div>
        ))}
      </PublicContentCarousel>
    );
  }

  if (items.length === 1) {
    return renderSlide(items[0], 0);
  }

  // Fallback for no media at all
  return renderSlide({ type: "image", src: "" }, 0);
}
