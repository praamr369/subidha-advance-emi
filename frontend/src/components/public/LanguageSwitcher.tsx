"use client";

import { Globe } from "lucide-react";

import { PUBLIC_LANGUAGES, PUBLIC_LANGUAGE_LABELS, type PublicLanguage } from "@/lib/public-i18n";
import { cn } from "@/lib/utils";

type LanguageSwitcherProps = {
  value: PublicLanguage;
  className?: string;
};

export default function LanguageSwitcher({ value, className }: LanguageSwitcherProps) {
  function setLanguage(nextLanguage: PublicLanguage) {
    if (nextLanguage === value) return;
    void fetch("/api/public/language", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: nextLanguage }),
    }).finally(() => {
      window.location.reload();
    });
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/80 bg-white/80 text-muted-foreground">
        <Globe className="h-4 w-4" />
      </span>
      <div className="flex items-center gap-1 rounded-xl border border-white/75 bg-white/82 p-1">
        {PUBLIC_LANGUAGES.map((language) => (
          <button
            key={language}
            type="button"
            onClick={() => setLanguage(language)}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-xs font-semibold",
              language === value
                ? "bg-slate-950 text-white"
                : "text-muted-foreground hover:bg-white"
            )}
            aria-label={`Switch language to ${PUBLIC_LANGUAGE_LABELS[language]}`}
          >
            {PUBLIC_LANGUAGE_LABELS[language]}
          </button>
        ))}
      </div>
    </div>
  );
}
