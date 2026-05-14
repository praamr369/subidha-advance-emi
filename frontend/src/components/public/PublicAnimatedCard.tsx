import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export default function PublicAnimatedCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "public-card public-card-animated relative overflow-hidden rounded-[1.5rem] border border-white/75 bg-white/82 p-5",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
      {children}
    </article>
  );
}
