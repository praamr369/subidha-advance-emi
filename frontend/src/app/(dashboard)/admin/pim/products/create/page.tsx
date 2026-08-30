"use client";
import Link from "next/link";
import { Package, Puzzle, ArrowRight, Info } from "lucide-react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";

const TYPES = [
  {
    slug: "finished-goods",
    label: "Finished Good",
    description: "Complete products for sale — furniture, appliances, goods. Full workflow: variants, media gallery, attributes, BOM, subscriptions, EMI, rent/lease.",
    icon: <Package className="h-8 w-8" />,
    color: "blue",
    examples: "e.g. Sofa, Dining Table, Wardrobe, Bed",
  },
  {
    slug: "accessories",
    label: "Accessory",
    description: "Add-on items sold alongside finished goods. Full catalog workflow: variants (color/size), media, attributes, direct sale.",
    icon: <Puzzle className="h-8 w-8" />,
    color: "indigo",
    examples: "e.g. Wall Bracket, Cushion Cover, Handles, Remote",
  },
] as const;

const colorMap: Record<string, string> = {
  blue: "border-blue-200 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 text-blue-700",
  indigo: "border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 text-indigo-700",
};

export default function PimProductTypeSelectorPage() {
  return (
    <ERPPageShell
      eyebrow="PIM"
      title="New PIM Product"
      subtitle="Choose the product type — only Finished Goods and Accessories have catalog entries"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "PIM Products", href: "/admin/pim/products" },
        { label: "New Product" },
      ]}
    >
      <div className="max-w-2xl space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TYPES.map((t) => (
            <Link
              key={t.slug}
              href={`/admin/pim/products/${t.slug}/new`}
              className={`group rounded-xl border bg-card p-5 transition hover:shadow-sm ${colorMap[t.color]}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={colorMap[t.color].split(" ")[4]}>{t.icon}</div>
                <ArrowRight className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <h3 className="font-semibold text-base text-foreground mb-1">{t.label}</h3>
              <p className="text-sm text-muted-foreground mb-2">{t.description}</p>
              <p className="text-xs text-muted-foreground italic">{t.examples}</p>
            </Link>
          ))}
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium mb-1">Raw Materials and Services use the Product Register</p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Raw materials (teak wood, screws, varnish) and services (installation, delivery) are managed in the{" "}
              <Link href={ROUTES.admin.products} className="underline">Product Register</Link> — not PIM.
              They don&apos;t need a customer-facing catalog entry.
            </p>
          </div>
        </div>
      </div>
    </ERPPageShell>
  );
}
