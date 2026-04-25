import { getResolvedPublicBusinessProfile } from "@/lib/public-profile";
<<<<<<< ours
<<<<<<< ours
import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import PublicNavClient from "./public-nav.client";

export default async function PublicNav() {
  const profile = await getResolvedPublicBusinessProfile();
  const locale = await getPublicLocale();
  const dictionary = getPublicDictionary(locale);

=======
import { getPublicLanguage } from "@/lib/public-i18n.server";
import PublicNavClient from "./public-nav.client";

export default async function PublicNav() {
=======
import { getPublicLanguage } from "@/lib/public-i18n.server";
import PublicNavClient from "./public-nav.client";

export default async function PublicNav() {
>>>>>>> theirs
  const [profile, language] = await Promise.all([
    getResolvedPublicBusinessProfile(),
    getPublicLanguage(),
  ]);
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
  return (
    <PublicNavClient
      locale={locale}
      dictionary={dictionary.nav}
      logoSrc={profile.resolved_logo_src}
      companyName={profile.resolved_display_name}
      brandSubtitle={profile.resolved_tagline}
      whatsappLink={profile.resolved_whatsapp_link}
      language={language}
    />
  );
}
