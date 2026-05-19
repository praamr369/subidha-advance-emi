import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PortalShellProps = {
  sidebar?: ReactNode;
  header?: ReactNode;
  children: ReactNode;
  className?: string;
};

export default function PortalShell({ sidebar, header, children, className }: PortalShellProps) {
  return (
    <div
      className={cn(
        "dashboard-app min-h-screen overflow-hidden text-foreground",
        "h-[100dvh] supports-[height:100dvh]:h-[100dvh]",
        className
      )}
    >
      <div className="flex h-full min-h-0">
        {sidebar ? <div className="hidden md:block">{sidebar}</div> : null}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {header}
          <main
            id="main-content"
            tabIndex={-1}
            className="portal-scroll-area min-w-0 flex-1 overflow-y-auto overflow-x-clip overscroll-behavior-x-contain"
          >
            <div className="workspace-shell-stage workspace-content-cap w-full min-w-0 px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6 xl:px-8">
              <div className="route-content-fade relative z-[1] min-w-0">{children}</div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
