"use client";

import { Info, List } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PublicProduct } from "@/services/public";

type PublicProductDescriptionAndSpecsProps = {
  product: PublicProduct;
  className?: string;
};

export default function PublicProductDescriptionAndSpecs({
  product,
  className,
}: PublicProductDescriptionAndSpecsProps) {
  const description = product.pim_description || product.description;
  const hasSpecs = product.pim_attributes && product.pim_attributes.length > 0;

  if (!description && !hasSpecs) {
    return null;
  }

  return (
    <div className={cn("mt-16 max-w-4xl", className)}>
      <div className="space-y-12">
        {description ? (
          <section>
            <div className="mb-4 flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Product Description
              </h2>
            </div>
            <div className="prose prose-slate dark:prose-invert max-w-none text-muted-foreground">
              {description.split("\n").map((paragraph, index) => (
                <p key={index} className="mb-4 leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ) : null}

        {hasSpecs ? (
          <section>
            <div className="mb-4 flex items-center gap-2">
              <List className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Specifications
              </h2>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none">
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-border">
                  {product.pim_attributes!.map((attr, idx) => (
                    <tr
                      key={`${attr.name}-${idx}`}
                      className="transition-colors hover:bg-muted/50"
                    >
                      <th className="w-1/3 bg-muted/20 px-5 py-4 font-semibold text-foreground">
                        {attr.name}
                      </th>
                      <td className="px-5 py-4 text-muted-foreground">
                        {attr.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
