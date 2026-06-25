import Image from "next/image";
import { ShieldCheck } from "lucide-react";

import { AUTH_BRAND } from "@/lib/auth/auth-brand";
import { cn } from "@/lib/utils";

type AuthBrandProps = {
  compact?: boolean;
  tone?: "light" | "dark";
  className?: string;
};

export default function AuthBrand({
  compact = false,
  tone = "light",
  className,
}: AuthBrandProps) {
  const dark = tone === "dark";

  return (
    <div className={cn("min-w-0", className)}>
      <div
        className={cn(
          "inline-flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]",
          dark && "border-border bg-card",
          compact ? "rounded-xl px-2.5 py-1.5" : ""
        )}
      >
        <div
          className={cn(
            "relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-border bg-card p-1.5",
            dark && "border-border bg-card shadow-[0_12px_26px_-22px_rgba(0,0,0,0.55)]"
          )}
        >
          <Image
            src={AUTH_BRAND.logoSrc}
            alt={AUTH_BRAND.logoAlt}
            fill
            sizes="40px"
            className="object-contain p-1"
            priority
          />
        </div>
        <div className="min-w-0">
          <div
            className={cn(
              "truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground",
              dark && "text-slate-300"
            )}
          >
            {AUTH_BRAND.wordmark}
          </div>
          <div className={cn("truncate text-sm font-medium text-foreground", dark && "text-white")}>
            {AUTH_BRAND.productLine}
          </div>
        </div>
      </div>

      {!compact ? (
        <div
          className={cn(
            "mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-[11px] font-medium text-muted-foreground",
            dark && "border-border bg-card text-slate-200"
          )}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          {AUTH_BRAND.workspaceLine}
        </div>
      ) : null}
    </div>
  );
}
