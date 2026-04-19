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
          "inline-flex items-center gap-3 rounded-2xl border border-slate-300 bg-white px-3 py-2",
          dark && "border-white/20 bg-white/10",
          compact ? "rounded-xl px-2.5 py-1.5" : ""
        )}
      >
        <div
          className={cn(
            "relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5",
            dark && "border-white/25 bg-white shadow-[0_12px_26px_-22px_rgba(0,0,0,0.55)]"
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
              "truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600",
              dark && "text-slate-300"
            )}
          >
            {AUTH_BRAND.wordmark}
          </div>
          <div className={cn("truncate text-sm font-medium text-slate-900", dark && "text-white")}>
            {AUTH_BRAND.productLine}
          </div>
        </div>
      </div>

      {!compact ? (
        <div
          className={cn(
            "mt-4 inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-700",
            dark && "border-white/20 bg-white/10 text-slate-200"
          )}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          {AUTH_BRAND.workspaceLine}
        </div>
      ) : null}
    </div>
  );
}
