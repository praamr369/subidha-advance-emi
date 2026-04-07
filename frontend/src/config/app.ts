import { brandConfig } from "@/config/brand";

export const appConfig = {
  title: brandConfig.platformName,
  company: brandConfig.companyName,
  sidebarBrand: brandConfig.publicProgramName,
  paginationSize: 20,
} as const;
