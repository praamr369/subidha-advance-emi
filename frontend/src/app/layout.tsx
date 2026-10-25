import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";

import { brandConfig } from "@/config/brand";
import { THEME_BOOTSTRAP_SCRIPT } from "@/config/theme-storage";
import { PUBLIC_LANG_BOOTSTRAP_SCRIPT } from "@/lib/public-i18n";
import "./globals.css";
import AppProviders from "@/providers/AppProviders";
import SkipNav from "@/components/ui/SkipNav";
import { OfflineNetworkBanner } from "@/components/common/OfflineNetworkBanner";

const publicLogoSrc = brandConfig.publicLogoSrc || undefined;
const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

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
        {/* Public pages declare the visitor's language (hi/bn) before first paint. */}
        <Script id="subidha-lang-boot" strategy="beforeInteractive">
          {PUBLIC_LANG_BOOTSTRAP_SCRIPT}
        </Script>
        {gaId ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaId}', {
                  page_path: window.location.pathname,
                });
              `}
            </Script>
          </>
        ) : null}
        <SkipNav />
        <OfflineNetworkBanner />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
