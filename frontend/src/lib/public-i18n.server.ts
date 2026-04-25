import { cookies } from "next/headers";

import { asLocale, PUBLIC_LANGUAGES, type PublicLanguage, type PublicLocale, PUBLIC_LANG_COOKIE } from "@/lib/public-i18n";

export async function getPublicLanguage(): Promise<PublicLanguage> {
  const store = await cookies();
  const language = store.get(PUBLIC_LANG_COOKIE)?.value;
  if (language && PUBLIC_LANGUAGES.includes(language as PublicLanguage)) {
    return language as PublicLanguage;
  }
  return "en";
}

export async function getPublicLocale(): Promise<PublicLocale> {
  const store = await cookies();
  return asLocale(store.get(PUBLIC_LANG_COOKIE)?.value);
}
