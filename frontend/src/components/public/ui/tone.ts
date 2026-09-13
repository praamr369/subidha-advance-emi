/**
 * Colour classes for public-site components.
 *
 * The shadcn tokens (--primary, --card, --muted-foreground, …) are not mapped
 * into the Tailwind v4 theme in this project, so utilities such as `bg-primary`
 * or `text-muted-foreground` generate no CSS at all. These classes read the CSS
 * variables directly, so they follow the public palette and dark mode.
 */
export const tone = {
  surface: "bg-[color:var(--card)]",
  text: "text-[color:var(--foreground)]",
  textSoft: "text-[color:color-mix(in_oklab,var(--foreground)_82%,transparent)]",
  muted: "text-[color:var(--muted-foreground)]",
  wash: "bg-[color:color-mix(in_oklab,var(--muted)_55%,transparent)]",
  line: "border-[color:var(--border)]",
  divide: "divide-[color:var(--border)]",
  rule: "bg-[color:var(--border)]",
  accentText: "text-[color:var(--primary)]",
  fill: "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
  fillHover: "hover:bg-[color:color-mix(in_oklab,var(--primary)_86%,black)]",
  fillSoft: "bg-[color:color-mix(in_oklab,var(--primary)_10%,transparent)]",
  fillTint: "bg-[color:color-mix(in_oklab,var(--primary)_6%,transparent)]",
  onFillMuted: "text-[color:color-mix(in_oklab,var(--primary-foreground)_78%,transparent)]",
  onFillLine: "border-[color:color-mix(in_oklab,var(--primary-foreground)_22%,transparent)]",
  invertFill: "bg-[color:var(--primary-foreground)] text-[color:var(--primary)]",
  accentLine: "border-[color:color-mix(in_oklab,var(--primary)_50%,transparent)]",
  accentRing: "ring-1 ring-[color:color-mix(in_oklab,var(--primary)_20%,transparent)]",
  hoverAccentLine: "hover:border-[color:color-mix(in_oklab,var(--primary)_40%,transparent)]",
  hoverAccentText: "hover:text-[color:var(--primary)]",
  hoverWash: "hover:bg-[color:var(--muted)]",
  focusRing: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
} as const;
