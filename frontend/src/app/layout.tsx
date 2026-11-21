import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";

import { brandConfig } from "@/config/brand";
import { THEME_BOOTSTRAP_SCRIPT } from "@/config/theme-storage";
import { PUBLIC_LANG_BOOTSTRAP_SCRIPT } from "@/lib/public-i18n";
import "./globals.css";
import AppProviders from "@/providers/AppProviders";
import SkipNav from "@/components/ui/SkipNav";
import { OfflineNetworkBanner } from "@/components/common/OfflineNetworkBanner";
import { PwaInstallPrompt } from "@/components/common/PwaInstallPrompt";
import { DynamicAnalyticsTracker } from "@/components/common/DynamicAnalyticsTracker";

const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#18181b" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: brandConfig.companyName,
    template: `%s | ${brandConfig.companyName}`,
  },
  description: `${brandConfig.companyName} ${brandConfig.publicProgramName} EMI operational platform`,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Subidha",
  },
  formatDetection: {
    telephone: false,
  },
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
              strategy="lazyOnload"
            />
            <Script id="google-analytics" strategy="lazyOnload">
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
        <PwaInstallPrompt />
        <AppProviders>
          <DynamicAnalyticsTracker />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
