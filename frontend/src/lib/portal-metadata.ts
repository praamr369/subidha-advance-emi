import type { Metadata } from "next";

import { brandConfig } from "@/config/brand";

export function buildPortalMetadata(
  portalName: string,
  description: string
): Metadata {
  return {
    title: portalName,
    description,
    applicationName: brandConfig.companyName,
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: {
        index: false,
        follow: false,
        noimageindex: true,
      },
    },
  };
}
