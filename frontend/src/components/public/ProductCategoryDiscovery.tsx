import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Image as ImageIcon, PackageCheck } from "lucide-react";

import PublicSectionShell from "@/components/public/PublicSectionShell";
import SectionHeader from "@/components/public/SectionHeader";
import { ROUTES } from "@/lib/routes";

function getCategoryImage(name: string) {
  const n = name.toLowerCase();
  if (n.includes("bed") || n.includes("mattress")) return "/images/category_bedroom.jpg";
  if (n.includes("wardrobe") || n.includes("almirah")) return "/images/category_wardrobe.jpg";
  if (n.includes("tv") || n.includes("television") || n.includes("electronics")) return "/images/category_tv.jpg";
  if (n.includes("dining") || n.includes("table")) return "/images/category_dining.jpg";
  if (n.includes("fridge") || n.includes("refrigerator") || n.includes("wash") || n.includes("appliance") || n.includes("machine")) return "/images/category_appliances.jpg";
  return "/images/category_sofa.jpg";
}

export type ProductCategorySummary = {
  name: string;
  count: number;
  mediaReadyCount: number;
  samples: string[];
};

type ProductCategoryDiscoveryProps = {
  categories: ProductCategorySummary[];
};

export default async function ProductCategoryDiscovery({ categories }: ProductCategoryDiscoveryProps) {
  const locale = await getPublicLocale();
  const dict = getPublicDictionary(locale);

  return (
    <PublicSectionShell className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
      <div className="space-y-5">
        <SectionHeader
          eyebrow={dict.public.ProductCategoryDiscovery_attr1}
          title={dict.public.ProductCategoryDiscovery_attr2}
          description={dict.public.ProductCategoryDiscovery_attr3}
        />
        <div className="relative overflow-hidden rounded-[1.6rem] shadow-[0_20px_40px_-20px_rgba(15,23,42,0.4)]">
          <Image 
            src="/images/category_bedroom.jpg"
            alt={dict.public.ProductCategoryDiscovery_attr4}
            width={600}
            height={600}
            className="w-full object-cover min-h-[18rem]"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {categories.length > 0 ? (
          categories.slice(0, 8).map((category) => (
            <article key={category.name} className="public-card overflow-hidden group">
              <div className="relative h-40 w-full overflow-hidden bg-muted/20">
                <Image
                  src={getCategoryImage(category.name)}
                  alt={category.name}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  sizes="(max-width: 640px) 100vw, 50vw"
                />
                <div className="absolute top-3 right-3 rounded-full border border-white/20 bg-black/40 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
                  {category.count.toLocaleString("en-IN")} items
                </div>
              </div>
              <div className="p-5">
                <h3 className="text-base font-semibold text-foreground">{category.name}</h3>
                <div className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-primary" />
                  {category.mediaReadyCount.toLocaleString("en-IN")} media-ready
                </div>
                <div className="flex items-start gap-2">
                  <PackageCheck className="mt-1 h-4 w-4 text-primary" />
                  <span>{category.samples.length > 0 ? category.samples.join(", ") : "Catalogue samples pending"}</span>
                </div>
                </div>
              </div>
            </article>
          ))
        ) : (
          <article className="public-card-sm p-5 sm:col-span-2">
            <h3 className="text-base font-semibold text-foreground">{dict.public.ProductCategoryDiscovery_text7}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The public catalogue has no category metadata available. Published products will still appear in the live catalogue when available.
            </p>
          </article>
        )}

        <div className="public-card-sm flex flex-col justify-between gap-4 p-5 sm:col-span-2 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-base font-semibold text-foreground">{dict.public.ProductCategoryDiscovery_text9}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{dict.public.ProductCategoryDiscovery_text10}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={ROUTES.public.contact} className="public-action-secondary">
              Contact
            </Link>
            <Link href={ROUTES.public.apply} className="public-action-primary gap-2">
              Enquire
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </PublicSectionShell>
  );
}
