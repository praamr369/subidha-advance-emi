import { cookies } from "next/headers";

<<<<<<< ours
<<<<<<< ours
import { asLocale, type PublicLocale } from "@/lib/public-i18n";

const PUBLIC_LANG_COOKIE = "subidha_public_lang";

export async function getPublicLocale(): Promise<PublicLocale> {
  const cookieStore = await cookies();
  return asLocale(cookieStore.get(PUBLIC_LANG_COOKIE)?.value);
=======
=======
>>>>>>> theirs
import { PUBLIC_LANGUAGES, type PublicLanguage, PUBLIC_LANG_COOKIE } from "@/lib/public-i18n";

export async function getPublicLanguage(): Promise<PublicLanguage> {
  const store = await cookies();
  const language = store.get(PUBLIC_LANG_COOKIE)?.value;
  if (language && PUBLIC_LANGUAGES.includes(language as PublicLanguage)) {
    return language as PublicLanguage;
  }
  return "en";
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
}
