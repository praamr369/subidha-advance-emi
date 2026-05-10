"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { type ThemePreference } from "@/config/theme-storage";
import { useTheme } from "@/providers/ThemeProvider";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  /** Dashboard topbar vs public marketing nav */
  variant?: "dashboard" | "public";
  className?: string;
};

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export default function ThemeToggle({ variant = "dashboard", className }: ThemeToggleProps) {
  const { theme, setTheme, ready } = useTheme();

  if (!ready) {
    return (
      <div
        className={cn(
          "shrink-0 rounded-xl border border-transparent",
          variant === "dashboard" ? "h-11 w-[8.5rem]" : "h-10 w-[8.25rem]",
          className
        )}
        aria-hidden
      />
    );
  }

  const Icon = theme === "system" ? Monitor : theme === "dark" ? Moon : Sun;

  return (
    <div
      className={cn("relative inline-flex items-center gap-1.5", className)}
      title="Display theme: light, dark, or match system"
    >
      <Icon
        className={cn(
          "pointer-events-none absolute left-2.5 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-muted-foreground",
          variant === "public" && "left-2"
        )}
        aria-hidden
      />
      <label htmlFor="subidha-theme-select" className="sr-only">
        Color theme
      </label>
      <select
        id="subidha-theme-select"
        data-testid="theme-select"
        value={theme}
        onChange={(event) => setTheme(event.target.value as ThemePreference)}
        className={cn(
          "appearance-none rounded-xl border font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
          variant === "dashboard"
            ? "h-11 border-[var(--topbar-border)] bg-[var(--topbar-control)] py-0 pl-9 pr-8 text-sm"
            : "h-10 border-[var(--border)] bg-[color-mix(in_oklab,var(--surface-card-elevated)_90%,transparent)] py-0 pl-8 pr-7 text-xs",
          "cursor-pointer hover:bg-[var(--surface-muted)]"
        )}
        aria-label="Color theme: light, dark, or system"
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
