import type { Metadata } from "next";
import type { ReactNode } from "react";

import { buildPublicMetadata } from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Home",
  description:
    "Subidha Furniture Lucky Plan Advance EMI — buy furniture on easy monthly installments with full transparency, fair draw, and winner tracking.",
  path: "/",
});

import PublicOperationalDisclosure from "@/components/public/PublicOperationalDisclosure";
import PublicStructuredData from "@/components/public/PublicStructuredData";
import PublicVisualShell from "@/components/public/PublicVisualShell";
import PublicFooter from "@/components/ui/public-footer";
import PublicNav from "@/components/ui/public-nav";
import PublicBottomNav from "@/components/ui/public-bottom-nav";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public-app flex min-h-screen flex-col pb-16 lg:pb-0">
      <PublicStructuredData />
      <a
        href="#main-content"
        className="sr-only z-50 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/45 focus:ring-offset-2"
      >
        Skip to main content
      </a>
      <PublicNav />
      <PublicVisualShell>{children}</PublicVisualShell>
      <PublicOperationalDisclosure />
      <PublicFooter />
      <PublicBottomNav />
    </div>
  );
}
