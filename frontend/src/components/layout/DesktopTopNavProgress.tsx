// frontend/src/components/layout/DesktopTopNavProgress.tsx
"use client";

import { usePathname, useSearchParams } from "next/navigation";

export default function DesktopTopNavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname || ""}?${searchParams?.toString() || ""}`;

  return (
    <div
      key={routeKey}
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[2.5px] overflow-hidden bg-transparent"
      role="progressbar"
      aria-label="Route loading progress"
    >
      <div className="desktop-progress-indicator h-full w-full bg-gradient-to-r from-primary via-amber-500 to-primary" />
    </div>
  );
}

