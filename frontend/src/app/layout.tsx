import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import AppProviders from "@/providers/AppProviders";

export const metadata: Metadata = {
  title: {
    default: "SUBIDHA CORE",
    template: "%s | SUBIDHA CORE",
  },
  description: "Lucky Plan EMI operational platform",
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
