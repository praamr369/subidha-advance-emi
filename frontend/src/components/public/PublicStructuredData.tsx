import { getResolvedPublicBusinessProfile } from "@/lib/public-profile";
import { buildOrganizationJsonLd, buildWebsiteJsonLd } from "@/lib/public-seo";

export default async function PublicStructuredData() {
  const profile = await getResolvedPublicBusinessProfile();
  const graph = [buildOrganizationJsonLd(profile), buildWebsiteJsonLd()];

  return (
    <script
      id="public-global-structured-data"
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": graph,
        }),
      }}
    />
  );
}
