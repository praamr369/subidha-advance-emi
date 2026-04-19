import { brandConfig } from "@/config/brand";

export const AUTH_BRAND = {
  logoSrc: brandConfig.publicLogoSrc,
  logoAlt: brandConfig.publicLogoAlt,
  wordmark: "SUBIDHA FURNITURE",
  productLine: "Lucky Plan Advance EMI System",
  workspaceLine: "Operations Workspace Access",
  supportLine: "Authorized staff and account holders only.",
} as const;
