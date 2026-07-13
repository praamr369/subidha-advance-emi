"use client";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Tag, Layers, Hash } from "lucide-react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import { pimService, type PimCategory } from "@/services/pim";

const DATA_TYPE_LABELS: Record<string, string> = {
  TEXT: "Text",
  NUMBER: "Number",
  DECIMAL: "Decimal",
  CHOICE: "Choice",
  MULTI_CHOICE: "Multi Choice",
  BOOLEAN: "Yes/No",
  DATE: "Date",
};

const DATA_TYPE_COLORS: Record<string, string> = {
  TEXT: "bg-gray-100 text-gray-700",
  NUMBER: "bg-blue-50 text-blue-700",
  DECIMAL: "bg-blue-50 text-blue-700",
  CHOICE: "bg-purple-50 text-purple-700",
  MULTI_CHOICE: "bg-purple-50 text-purple-700",
  BOOLEAN: "bg-orange-50 text-orange-700",
  DATE: "bg-green-50 text-green-700",
};

function SubcategoryRow({ sub }: { sub: PimCategory["subcategories"][0] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-md overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-sm hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <Layers className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{sub.name}</span>
        <span className="ml-auto text-xs text-muted-foreground">{sub.attributes.length} attributes</span>
      </button>

      {open && (
        <div className="border-t px-4 py-3 bg-muted/20">
          {sub.attributes.length === 0 ? (
            <p className="text-xs text-muted-foreground">No attributes defined.</p>
          ) : (
            <div className="space-y-2">
              {sub.attributes.map((attr) => (
                <div key={attr.id} className="flex items-center gap-3 text-sm">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium flex-1">{attr.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${DATA_TYPE_COLORS[attr.data_type] ?? "bg-muted"}`}>
                    {DATA_TYPE_LABELS[attr.data_type] ?? attr.data_type}
                  </span>
                  {attr.is_required && (
                    <span className="rounded-full bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 text-xs">Required</span>
                  )}
                  {attr.is_variant_defining && (
                    <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs">Variant</span>
                  )}
                  {attr.options.length > 0 && (
                    <span className="text-xs text-muted-foreground">{attr.options.length} options</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryCard({ category }: { category: PimCategory }) {
  const [open, setOpen] = useState(false);
  const totalAttrs = category.attributes.length + category.subcategories.reduce((s, sub) => s + sub.attributes.length, 0);

  return (
    <div className="rounded-lg border overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-5 py-4 text-sm hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
        <span className="text-xl">{category.icon}</span>
        <div className="flex flex-col text-left">
          <span className="font-semibold">{category.name}</span>
          <span className="text-xs text-muted-foreground">{category.subcategories.length} subcategories · {totalAttrs} total attributes</span>
        </div>
      </button>

      {open && (
        <div className="border-t px-5 py-4 space-y-3">
          {/* Category-level attributes */}
          {category.attributes.length > 0 && (
            <div className="rounded-md border p-3 space-y-2 bg-muted/10">
              <p className="text-xs font-semibold text-muted-foreground">Category-Level Attributes</p>
              {category.attributes.map((attr) => (
                <div key={attr.id} className="flex items-center gap-3 text-sm">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1">{attr.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${DATA_TYPE_COLORS[attr.data_type] ?? "bg-muted"}`}>
                    {DATA_TYPE_LABELS[attr.data_type] ?? attr.data_type}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Subcategories */}
          <div className="space-y-2">
            {category.subcategories.map((sub) => (
              <SubcategoryRow key={sub.id} sub={sub} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PimCategoriesPage() {
  const [categories, setCategories] = useState<PimCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pimService.getCategories()
      .then(setCategories)
      .catch(() => setError("Failed to load categories"))
      .finally(() => setLoading(false));
  }, []);

  const totalSubs = categories.reduce((s, c) => s + c.subcategories.length, 0);
  const totalAttrs = categories.reduce(
    (s, c) =>
      s + c.attributes.length + c.subcategories.reduce((ss, sub) => ss + sub.attributes.length, 0),
    0
  );

  return (
    <ERPPageShell
      title="PIM Categories"
      subtitle="Category hierarchy with dynamic attribute templates"
    >
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mt-2 mb-6">
        {[
          { label: "Categories", value: categories.length, icon: <Tag className="h-4 w-4" /> },
          { label: "Subcategories", value: totalSubs, icon: <Layers className="h-4 w-4" /> },
          { label: "Attribute Templates", value: totalAttrs, icon: <Hash className="h-4 w-4" /> },
        ].map(({ label, value, icon }) => (
          <div key={label} className="rounded-lg border p-4 flex items-center gap-3">
            <div className="rounded-md bg-primary/10 p-2 text-primary">{icon}</div>
            <div>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <ERPLoadingState label="Loading categories…" />
      ) : error ? (
        <ERPErrorState message={error} onRetry={() => { setLoading(true); pimService.getCategories().then(setCategories).catch(() => { setError("Failed"); }).finally(() => setLoading(false)); }} />
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => (
            <CategoryCard key={cat.id} category={cat} />
          ))}
        </div>
      )}

      <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <strong>To add new categories or attributes:</strong> Run the seeding command on the backend:<br />
        <code className="mt-1 block font-mono text-xs bg-amber-100 rounded px-2 py-1">
          python manage.py seed_pim_categories
        </code>
        <span className="text-xs mt-1 block">Or manage via Django admin at /django-admin/products_pim/</span>
      </div>
    </ERPPageShell>
  );
}
