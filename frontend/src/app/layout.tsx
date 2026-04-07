import type { Metadata } from "next";
import type { ReactNode } from "react";

import { brandConfig } from "@/config/brand";
import "./globals.css";
import AppProviders from "@/providers/AppProviders";

export const metadata: Metadata = {
  title: {
    default: brandConfig.platformName,
    template: `%s | ${brandConfig.platformName}`,
  },
  description: `${brandConfig.companyName} ${brandConfig.publicProgramName} EMI operational platform`,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
