"use client";

import React, { useMemo } from "react";
import {
  Ruler,
  Layers,
  Component,
  Box,
  Palette,
  Scale,
  ShieldCheck,
  Sparkles,
  Tag,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type AttributeItem = {
  rawKey: string;
  label: string;
  value: string;
  category: AttributeCategory;
  icon: LucideIcon;
  badgeClass: string;
  iconClass: string;
};

type AttributeCategory =
  | "size"
  | "material"
  | "structure"
  | "storage"
  | "color"
  | "capacity"
  | "warranty"
  | "assembly"
  | "style"
  | "general";

interface CategoryMeta {
  category: AttributeCategory;
  icon: LucideIcon;
  badgeClass: string;
  iconClass: string;
}

const CATEGORY_MAP: Record<AttributeCategory, Omit<CategoryMeta, "category">> = {
  size: {
    icon: Ruler,
    badgeClass: "border-sky-200 bg-sky-50/90 text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-300",
    iconClass: "text-sky-600 dark:text-sky-400",
  },
  material: {
    icon: Layers,
    badgeClass: "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200",
    iconClass: "text-slate-600 dark:text-slate-400",
  },
  structure: {
    icon: Component,
    badgeClass: "border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200",
    iconClass: "text-zinc-600 dark:text-zinc-400",
  },
  storage: {
    icon: Box,
    badgeClass: "border-amber-300 bg-amber-50/90 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300",
    iconClass: "text-amber-600 dark:text-amber-400",
  },
  color: {
    icon: Palette,
    badgeClass: "border-purple-200 bg-purple-50/90 text-purple-800 dark:border-purple-800/60 dark:bg-purple-950/40 dark:text-purple-300",
    iconClass: "text-purple-600 dark:text-purple-400",
  },
  capacity: {
    icon: Scale,
    badgeClass: "border-teal-200 bg-teal-50/90 text-teal-800 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-300",
    iconClass: "text-teal-600 dark:text-teal-400",
  },
  warranty: {
    icon: ShieldCheck,
    badgeClass: "border-emerald-200 bg-emerald-50/90 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300",
    iconClass: "text-emerald-600 dark:text-emerald-400",
  },
  assembly: {
    icon: Wrench,
    badgeClass: "border-cyan-200 bg-cyan-50/90 text-cyan-800 dark:border-cyan-800/60 dark:bg-cyan-950/40 dark:text-cyan-300",
    iconClass: "text-cyan-600 dark:text-cyan-400",
  },
  style: {
    icon: Sparkles,
    badgeClass: "border-indigo-200 bg-indigo-50/90 text-indigo-800 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-300",
    iconClass: "text-indigo-600 dark:text-indigo-400",
  },
  general: {
    icon: Tag,
    badgeClass: "border-border bg-muted/60 text-foreground dark:border-border/80 dark:bg-muted/40",
    iconClass: "text-muted-foreground",
  },
};

export function resolveAttributeCategory(rawKey: string): CategoryMeta {
  const normalized = rawKey.toLowerCase().replace(/[-_]/g, " ").trim();

  if (
    normalized.includes("size") ||
    normalized.includes("dimension") ||
    normalized.includes("width") ||
    normalized.includes("height") ||
    normalized.includes("length") ||
    normalized.includes("depth") ||
    normalized.includes("thickness")
  ) {
    return { category: "size", ...CATEGORY_MAP.size };
  }

  if (
    normalized.includes("base material") ||
    normalized.includes("frame") ||
    normalized.includes("structure") ||
    normalized.includes("leg")
  ) {
    return { category: "structure", ...CATEGORY_MAP.structure };
  }

  if (
    normalized.includes("material") ||
    normalized.includes("wood") ||
    normalized.includes("fabric") ||
    normalized.includes("leather") ||
    normalized.includes("upholstery") ||
    normalized.includes("foam")
  ) {
    return { category: "material", ...CATEGORY_MAP.material };
  }

  if (
    normalized.includes("storage") ||
    normalized.includes("drawer") ||
    normalized.includes("shelf") ||
    normalized.includes("shelves") ||
    normalized.includes("hydraulic") ||
    normalized.includes("box")
  ) {
    return { category: "storage", ...CATEGORY_MAP.storage };
  }

  if (
    normalized.includes("color") ||
    normalized.includes("colour") ||
    normalized.includes("finish") ||
    normalized.includes("polish") ||
    normalized.includes("shade")
  ) {
    return { category: "color", ...CATEGORY_MAP.color };
  }

  if (
    normalized.includes("capacity") ||
    normalized.includes("seating") ||
    normalized.includes("weight") ||
    normalized.includes("load")
  ) {
    return { category: "capacity", ...CATEGORY_MAP.capacity };
  }

  if (normalized.includes("warranty") || normalized.includes("guarantee")) {
    return { category: "warranty", ...CATEGORY_MAP.warranty };
  }

  if (normalized.includes("assembly") || normalized.includes("installation") || normalized.includes("diy")) {
    return { category: "assembly", ...CATEGORY_MAP.assembly };
  }

  if (normalized.includes("style") || normalized.includes("design") || normalized.includes("pattern")) {
    return { category: "style", ...CATEGORY_MAP.style };
  }

  return { category: "general", ...CATEGORY_MAP.general };
}

function formatLabel(rawKey: string): string {
  // Convert "base-material" or "base_material" to "Base Material"
  return rawKey
    .replace(/[-_]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatValue(val: unknown): string {
  if (val === true || String(val).toLowerCase() === "true") return "Yes";
  if (val === false || String(val).toLowerCase() === "false") return "No";
  if (val === null || val === undefined) return "—";
  return String(val).trim();
}

/**
 * Normalizes and deduplicates attributes.
 * Handles both key casing (e.g. "size" vs "Size") and slug formatting ("base-material" vs "Base Material").
 */
export function normalizeProductAttributes(
  attributes?: Record<string, unknown> | null,
  rawNameString?: string | null
): AttributeItem[] {
  const map = new Map<string, AttributeItem>();

  // 1. Process structured attributes object
  if (attributes && typeof attributes === "object") {
    for (const [key, rawVal] of Object.entries(attributes)) {
      if (rawVal === null || rawVal === undefined || rawVal === "") continue;
      const formattedVal = formatValue(rawVal);
      const label = formatLabel(key);
      const dedupeKey = label.toLowerCase();
      const meta = resolveAttributeCategory(key);

      map.set(dedupeKey, {
        rawKey: key,
        label,
        value: formattedVal,
        category: meta.category,
        icon: meta.icon,
        badgeClass: meta.badgeClass,
        iconClass: meta.iconClass,
      });
    }
  }

  // 2. Fallback: Parse parenthesized specs from product name if empty, e.g. "BED (Material: Metal, Size: Queen)"
  if (map.size === 0 && rawNameString && rawNameString.includes("(") && rawNameString.includes(")")) {
    const match = rawNameString.match(/\((.*?)\)/);
    if (match && match[1]) {
      const parts = match[1].split(",");
      for (const part of parts) {
        if (part.includes(":")) {
          const [k, v] = part.split(":", 2);
          if (k && v) {
            const cleanKey = k.trim();
            const formattedVal = formatValue(v.trim());
            const label = formatLabel(cleanKey);
            const dedupeKey = label.toLowerCase();
            const meta = resolveAttributeCategory(cleanKey);

            if (!map.has(dedupeKey)) {
              map.set(dedupeKey, {
                rawKey: cleanKey,
                label,
                value: formattedVal,
                category: meta.category,
                icon: meta.icon,
                badgeClass: meta.badgeClass,
                iconClass: meta.iconClass,
              });
            }
          }
        }
      }
    }
  }

  return Array.from(map.values());
}

interface ProductAttributeBadgesProps {
  attributes?: Record<string, unknown> | null;
  nameFallback?: string | null;
  size?: "xs" | "sm" | "md";
  className?: string;
  maxVisible?: number;
}

export default function ProductAttributeBadges({
  attributes,
  nameFallback,
  size = "sm",
  className = "",
  maxVisible,
}: ProductAttributeBadgesProps) {
  const items = useMemo(
    () => normalizeProductAttributes(attributes, nameFallback),
    [attributes, nameFallback]
  );

  if (items.length === 0) return null;

  const visibleItems = typeof maxVisible === "number" ? items.slice(0, maxVisible) : items;
  const hiddenCount = typeof maxVisible === "number" ? Math.max(0, items.length - maxVisible) : 0;

  const sizeClasses = {
    xs: "px-1.5 py-0.5 text-[9px] gap-1",
    sm: "px-2 py-0.5 text-[10px] gap-1.5",
    md: "px-2.5 py-1 text-xs gap-2",
  };

  const iconSizes = {
    xs: "h-2.5 w-2.5",
    sm: "h-3 w-3",
    md: "h-3.5 w-3.5",
  };

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {visibleItems.map((item) => {
        const Icon = item.icon;
        return (
          <span
            key={item.label}
            title={`${item.label}: ${item.value}`}
            className={`inline-flex items-center rounded-md border font-medium shadow-2xs transition-colors hover:shadow-xs ${item.badgeClass} ${sizeClasses[size]}`}
          >
            <Icon className={`shrink-0 ${iconSizes[size]} ${item.iconClass}`} aria-hidden="true" />
            <span className="font-semibold opacity-75">{item.label}:</span>
            <span className="font-bold">{item.value}</span>
          </span>
        );
      })}

      {hiddenCount > 0 && (
        <span
          className={`inline-flex items-center rounded-md border border-border bg-muted/60 font-semibold text-muted-foreground ${sizeClasses[size]}`}
          title={`${hiddenCount} more attributes`}
        >
          +{hiddenCount} more
        </span>
      )}
    </div>
  );
}
