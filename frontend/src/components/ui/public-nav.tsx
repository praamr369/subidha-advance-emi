import { getResolvedPublicBusinessProfile } from "@/lib/public-profile";
import PublicNavClient from "./public-nav.client";

export default async function PublicNav() {
  const profile = await getResolvedPublicBusinessProfile();
  return (
    <PublicNavClient
      logoSrc={profile.resolved_logo_src}
      companyName={profile.resolved_display_name}
      brandSubtitle={profile.resolved_tagline}
      whatsappLink={profile.resolved_whatsapp_link}
    />
  );
}

