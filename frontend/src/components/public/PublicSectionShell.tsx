import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export default function PublicSectionShell({
  children,
  className,
  compact = false,
}: {
  children: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <section
      className={cn(
        "public-surface public-reveal rounded-[2rem] border border-white/75",
        compact ? "p-5" : "p-6",
        className
      )}
    >
      {children}
    </section>
  );
}
