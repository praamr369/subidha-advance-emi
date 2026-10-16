"use client";

import ProductMediaGallery, {
  buildPublicProductMediaItems,
} from "@/components/public/ProductMediaGallery";
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
  const items = buildPublicProductMediaItems(product);
  const badge = product.category || "Public catalogue";

  return (
    <ProductMediaGallery
      items={items}
      productName={product.name}
      category={product.category}
      subcategory={product.subcategory}
      badge={badge}
      aspectRatio={5 / 4}
      carouselAriaLabel={carouselAriaLabel}
      prevLabel={prevLabel}
      nextLabel={nextLabel}
    />
  );
}
