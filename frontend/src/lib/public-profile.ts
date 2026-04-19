import { cache } from "react";

import { brandConfig } from "@/config/brand";
import { getPublicBusinessProfile, type PublicBusinessProfile } from "@/lib/public-api";

export type ResolvedPublicBusinessProfile = PublicBusinessProfile & {
  resolved_display_name: string;
  resolved_tagline: string;
  resolved_whatsapp_link: string | null;
  resolved_logo_src: string;
};

function normalizePhoneDigits(raw: string): string {
  const digits = Array.from(raw || "")
    .filter((ch) => ch >= "0" && ch <= "9")
    .join("");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return digits;
}

function resolveWhatsAppLink(profile: PublicBusinessProfile | null): string | null {
  if (!profile) return null;
  const direct = (profile.whatsapp_link || "").trim();
  if (direct) return direct;

  const digits = normalizePhoneDigits(profile.whatsapp_phone || "");
  if (digits.length === 10) return `https://wa.me/91${digits}`;
  return null;
}

export const getResolvedPublicBusinessProfile = cache(
  async (): Promise<ResolvedPublicBusinessProfile> => {
    const profile = await getPublicBusinessProfile().catch(() => null);

    const displayName =
      (profile?.display_name || "").trim() ||
      brandConfig.companyName;

    const tagline =
      (profile?.tagline || "").trim() ||
      "Designed for the way you live · Structured monthly plans and transparent winner publishing";

    const logoSrc =
      (profile?.public_logo_url || "").trim() ||
      brandConfig.publicLogoSrc;

    return {
      ...(profile || {}),
      resolved_display_name: displayName,
      resolved_tagline: tagline,
      resolved_whatsapp_link: resolveWhatsAppLink(profile),
      resolved_logo_src: logoSrc,
    };
  }
);

