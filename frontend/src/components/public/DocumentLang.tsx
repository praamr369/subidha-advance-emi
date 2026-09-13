"use client";

import { useEffect } from "react";

import type { PublicLocale } from "@/lib/public-i18n";

/**
 * Keeps `<html lang>` equal to the public-site language while a public page is
 * mounted, and puts it back to "en" when the visitor navigates into the
 * English-only app areas.
 *
 * First paint is handled earlier by PUBLIC_LANG_BOOTSTRAP_SCRIPT in the root
 * layout; this effect covers client-side navigation, which never re-runs that
 * script. The root `<html>` stays static "en" so admin and portals are never
 * declared as Hindi/Bengali.
 */
export default function DocumentLang({ locale }: { locale: PublicLocale }) {
  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    return () => {
      root.lang = "en";
    };
  }, [locale]);

  return null;
}
