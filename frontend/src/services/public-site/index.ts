import { ApiError, apiFetch } from "@/lib/api";

export type PublicBusinessProfile = {
  display_name?: string;
  tagline?: string;
  hero_title?: string;
  hero_subtitle?: string;
  support_phone?: string;
  support_email?: string;
  whatsapp_phone?: string;
  whatsapp_link?: string;
  facebook_url?: string;
  instagram_url?: string;
  youtube_url?: string;
  address_text?: string;
  map_url?: string;
  business_hours?: string;
  public_logo_url?: string;
  is_active?: boolean;
  updated_at?: string;
};

export async function getAdminPublicBusinessProfile(): Promise<PublicBusinessProfile | null> {
  try {
    return await apiFetch<PublicBusinessProfile>("/admin/public-site/profile/");
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function saveAdminPublicBusinessProfile(
  payload: Partial<PublicBusinessProfile>
): Promise<PublicBusinessProfile> {
  return apiFetch<PublicBusinessProfile>("/admin/public-site/profile/", {
    method: "PATCH",
    body: payload,
  });
}

