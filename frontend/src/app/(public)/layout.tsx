import type { ReactNode } from "react";

import PublicFooter from "@/components/ui/public-footer";
import PublicNav from "@/components/ui/public-nav";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_4%_0%,rgba(125,211,252,0.16),transparent_24%),radial-gradient(circle_at_94%_0%,rgba(251,191,36,0.14),transparent_26%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)]">
      <PublicNav />
      <div className="flex-1">{children}</div>
      <PublicFooter />
    </div>
  );
}
