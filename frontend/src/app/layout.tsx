import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";

import { brandConfig } from "@/config/brand";
import { THEME_BOOTSTRAP_SCRIPT } from "@/config/theme-storage";
import "./globals.css";
import AppProviders from "@/providers/AppProviders";
import SkipNav from "@/components/ui/SkipNav";

const publicLogoSrc = brandConfig.publicLogoSrc || undefined;

export const metadata: Metadata = {
  title: {
    default: brandConfig.companyName,
    template: `%s | ${brandConfig.companyName}`,
  },
  description: `${brandConfig.companyName} ${brandConfig.publicProgramName} EMI operational platform`,
  icons: publicLogoSrc
    ? {
        icon: publicLogoSrc,
        shortcut: publicLogoSrc,
        apple: publicLogoSrc,
      }
    : undefined,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Script id="subidha-theme-boot" strategy="beforeInteractive">
          {THEME_BOOTSTRAP_SCRIPT}
        </Script>
        <SkipNav />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
