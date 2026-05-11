import type { ReactNode } from "react";

import PublicFooter from "@/components/ui/public-footer";
import PublicNav from "@/components/ui/public-nav";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public-app flex min-h-screen flex-col">
      <PublicNav />
      <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 overflow-x-clip">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
