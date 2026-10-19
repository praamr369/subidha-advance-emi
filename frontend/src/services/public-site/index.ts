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

export type PublicAnnouncementType = "OFFER" | "NEWS" | "ALERT" | "GENERAL";

export type PublicAnnouncement = {
  id: number;
  title: string;
  message?: string;
  banner_type: PublicAnnouncementType;
  badge_text?: string;
  action_label?: string;
  action_url?: string;
  priority?: number;
  is_active?: boolean;
  image_url?: string;
  image_aspect_ratio?: "BANNER" | "POSTER" | "HERO";
  display_placement?: "TOP_BANNER" | "PROMO_CARD" | "POPUP_MODAL";
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string;
  updated_at?: string;
};

export async function getPublicAnnouncements(options?: { revalidate?: number }): Promise<PublicAnnouncement[]> {
  try {
    const res = await apiFetch<{ announcements: PublicAnnouncement[] }>("/public/announcements/", {
      next: options?.revalidate !== undefined ? { revalidate: options.revalidate } : undefined,
    });
    return res.announcements || [];
  } catch {
    return [];
  }
}

export async function getAdminAnnouncements(): Promise<PublicAnnouncement[]> {
  const res = await apiFetch<{ announcements: PublicAnnouncement[] }>("/admin/public-site/announcements/");
  return res.announcements || [];
}

export async function createAdminAnnouncement(
  payload: Partial<PublicAnnouncement>
): Promise<PublicAnnouncement> {
  return apiFetch<PublicAnnouncement>("/admin/public-site/announcements/", {
    method: "POST",
    body: payload,
  });
}

export async function updateAdminAnnouncement(
  id: number,
  payload: Partial<PublicAnnouncement>
): Promise<PublicAnnouncement> {
  return apiFetch<PublicAnnouncement>(`/admin/public-site/announcements/${id}/`, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteAdminAnnouncement(id: number): Promise<void> {
  await apiFetch(`/admin/public-site/announcements/${id}/`, {
    method: "DELETE",
  });
}

export async function uploadAdminAnnouncementImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await apiFetch<{ url: string }>("/admin/public-site/announcements/upload/", {
    method: "POST",
    body: fd,
  });
  return res.url;
}

