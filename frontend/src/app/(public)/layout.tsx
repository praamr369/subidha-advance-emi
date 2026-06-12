import type { ReactNode } from "react";

import PublicOperationalDisclosure from "@/components/public/PublicOperationalDisclosure";
import PublicStructuredData from "@/components/public/PublicStructuredData";
import PublicVisualShell from "@/components/public/PublicVisualShell";
import PublicFooter from "@/components/ui/public-footer";
import PublicNav from "@/components/ui/public-nav";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public-app flex min-h-screen flex-col">
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
    </div>
  );
}
