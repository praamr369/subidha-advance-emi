import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLanguage } from "@/lib/public-i18n.server";
import { getResolvedPublicBusinessProfile } from "@/lib/public-profile";
import PublicNavClient from "./public-nav.client";

export default async function PublicNav() {
  const [profile, language] = await Promise.all([
    getResolvedPublicBusinessProfile(),
    getPublicLanguage(),
  ]);
  const dictionary = getPublicDictionary(language);
  return (
    <PublicNavClient
      dictionary={dictionary.nav}
      logoSrc={profile.resolved_logo_src}
      companyName={profile.resolved_display_name}
      brandSubtitle={profile.resolved_tagline}
      whatsappLink={profile.resolved_whatsapp_link}
      language={language}
    />
  );
}
