import { brandConfig } from "@/config/brand";

export const appConfig = {
  title: brandConfig.companyName,
  company: brandConfig.companyName,
  sidebarBrand: brandConfig.publicProgramName,
  paginationSize: 20,
} as const;
