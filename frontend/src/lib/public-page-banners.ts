import fs from "node:fs";
import path from "node:path";

export type PublicBannerKey =
  | "home"
  | "products"
  | "subscriptions"
  | "luckyPlan"
  | "winners"
  | "about"
  | "contact"
  | "policies"
  | "rentLease";

const bannerMap: Record<PublicBannerKey, string> = {
  home: "/brand/banners/home-hero.png",
  products: "/brand/banners/products-hero.png",
  subscriptions: "/brand/banners/subscriptions-hero.png",
  luckyPlan: "/brand/banners/lucky-plan-hero.png",
  winners: "/brand/banners/winners-hero.png",
  about: "/brand/banners/about-hero.png",
  contact: "/brand/banners/contact-hero.png",
  policies: "/brand/banners/policies-hero.png",
  rentLease: "/brand/banners/rent-lease-hero.png",
};

export function getPublicBannerSrc(key: PublicBannerKey) {
  return bannerMap[key];
}

export function hasPublicBannerAsset(src: string) {
  const normalized = src.startsWith("/") ? src.slice(1) : src;
  const absolute = path.join(process.cwd(), "public", normalized);
  return fs.existsSync(absolute);
}

export function getPublicBannerWithFallback(key: PublicBannerKey) {
  const src = getPublicBannerSrc(key);
  return {
    src,
    exists: hasPublicBannerAsset(src),
  };
}

export const expectedPublicBannerFiles = Object.values(bannerMap);
