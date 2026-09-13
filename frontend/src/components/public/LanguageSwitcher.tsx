"use client";

import { Globe } from "lucide-react";

import { PUBLIC_LANG_COOKIE, PUBLIC_LANGUAGES, PUBLIC_LANGUAGE_LABELS, type PublicLanguage } from "@/lib/public-i18n";
import { cn } from "@/lib/utils";

type LanguageSwitcherProps = {
  value: PublicLanguage;
  className?: string;
};

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Remember the visitor's language in the cookie the server pages read on every
 * request (lib/public-i18n.server.ts). Written in the browser, not via a Next /api
 * route: in production nginx sends every /api/* request to Django, so such a route
 * 404s and the choice was silently lost.
 */
function persistLanguage(language: PublicLanguage) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${PUBLIC_LANG_COOKIE}=${language}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax${secure}`;
}

export default function LanguageSwitcher({ value, className }: LanguageSwitcherProps) {
  function setLanguage(nextLanguage: PublicLanguage) {
    if (nextLanguage === value) return;
    persistLanguage(nextLanguage);
    window.location.reload();
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
        <Globe className="h-4 w-4" />
      </span>
      <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
        {PUBLIC_LANGUAGES.map((language) => (
          <button
            key={language}
            type="button"
            onClick={() => setLanguage(language)}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-xs font-semibold",
              language === value
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-card"
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
