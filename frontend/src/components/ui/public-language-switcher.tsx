"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  PUBLIC_LOCALES,
  type PublicLocale,
  getPublicLanguageLabel,
} from "@/lib/public-i18n";

const COOKIE_NAME = "subidha_public_lang";

export default function PublicLanguageSwitcher({
  locale,
  label,
}: {
  locale: PublicLocale;
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <label className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-[0_12px_28px_-22px_rgba(15,23,42,0.66)]">
      <span>{label}</span>
      <select
        value={locale}
        onChange={(event) => {
          const nextLocale = event.target.value as PublicLocale;
          document.cookie = `${COOKIE_NAME}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;

          const params = new URLSearchParams(searchParams.toString());
          params.set("lang", nextLocale);
          const nextPath = params.size > 0 ? `${pathname}?${params.toString()}` : pathname;
          router.push(nextPath);
          router.refresh();
        }}
        className="rounded-lg border border-border/80 bg-card px-2 py-1"
        aria-label={label}
      >
        {PUBLIC_LOCALES.map((item) => (
          <option key={item} value={item}>
            {getPublicLanguageLabel(item)}
          </option>
        ))}
      </select>
    </label>
  );
}
