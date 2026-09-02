import {
  Armchair,
  BedDouble,
  Fan,
  Lamp,
  type LucideIcon,
  Microwave,
  Package,
  Refrigerator,
  Sofa,
  UtensilsCrossed,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Stand-in artwork for a product with no photograph yet.
 *
 * The catalogue is live and largely unphotographed, so this needs to read as a
 * deliberate part of the design rather than a broken image. It picks an icon
 * from the product's category and derives a stable tint from the product name,
 * so a grid of unphotographed products still looks varied and intentional.
 */

const CATEGORY_ICONS: Array<{ match: RegExp; icon: LucideIcon }> = [
  { match: /\b(sofa|couch|recliner|settee)\b/i, icon: Sofa },
  { match: /\b(bed|mattress|wardrobe|almirah)\b/i, icon: BedDouble },
  { match: /\b(chair|stool|seating)\b/i, icon: Armchair },
  { match: /\b(fridge|refrigerat|cooler|freezer|ac|air)\b/i, icon: Refrigerator },
  { match: /\b(oven|otg|microwave|kettle|cooker|induction)\b/i, icon: Microwave },
  { match: /\b(kitchen|dining|utensil|cookware)\b/i, icon: UtensilsCrossed },
  { match: /\b(fan|ceiling)\b/i, icon: Fan },
  { match: /\b(lamp|light|lighting)\b/i, icon: Lamp },
];

/** Muted, brand-neutral tints that read well in both light and dark themes. */
const TINTS = [
  "from-amber-500/10 to-orange-500/5 text-amber-700/50 dark:text-amber-300/40",
  "from-sky-500/10 to-blue-500/5 text-sky-700/50 dark:text-sky-300/40",
  "from-emerald-500/10 to-teal-500/5 text-emerald-700/50 dark:text-emerald-300/40",
  "from-violet-500/10 to-purple-500/5 text-violet-700/50 dark:text-violet-300/40",
  "from-rose-500/10 to-pink-500/5 text-rose-700/50 dark:text-rose-300/40",
];

function pickIcon(category?: string | null, name?: string | null): LucideIcon {
  const haystack = `${category ?? ""} ${name ?? ""}`;
  for (const { match, icon } of CATEGORY_ICONS) {
    if (match.test(haystack)) return icon;
  }
  return Package;
}

/** Stable per-product tint so the same product always looks the same. */
function pickTint(seed?: string | null): string {
  const key = seed ?? "";
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return TINTS[hash % TINTS.length];
}

export default function ProductImagePlaceholder({
  name,
  category,
  className,
  iconClassName,
  showCategory = true,
}: {
  name?: string | null;
  category?: string | null;
  className?: string;
  iconClassName?: string;
  showCategory?: boolean;
}) {
  const Icon = pickIcon(category, name);
  const tint = pickTint(name || category);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br",
        tint,
        className,
      )}
    >
      <Icon className={cn("h-10 w-10 opacity-80", iconClassName)} strokeWidth={1.25} />
      {showCategory && category ? (
        <span className="px-3 text-center text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">
          {category}
        </span>
      ) : null}
    </div>
  );
}
