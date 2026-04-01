import type { ReactNode } from "react";

import PublicFooter from "@/components/ui/public-footer";
import PublicNav from "@/components/ui/public-nav";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicNav />
      <div className="flex-1">{children}</div>
      <PublicFooter />
    </div>
  );
}
