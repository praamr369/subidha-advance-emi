import Link from "next/link";
import { AlertTriangle, BookOpen } from "lucide-react";

import { ROUTES } from "@/lib/routes";

type AiSafetyBannerProps = {
  disabled?: boolean;
};

export default function AiSafetyBanner({ disabled = false }: AiSafetyBannerProps) {
  return (
    <section
      className="rounded-xl border border-amber-200/90 bg-amber-50/90 p-4 text-amber-950 shadow-[0_16px_36px_-30px_rgba(146,64,14,0.5)]"
      aria-live={disabled ? "polite" : undefined}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="rounded-xl border border-amber-200 bg-card p-2 text-amber-800">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Read-only assistant</p>
            <p className="mt-1 text-sm leading-6">
              This assistant is read-only. It cannot perform or approve financial or operational actions.
            </p>
            {disabled ? (
              <p className="mt-1 text-sm leading-6">
                AI assistant is disabled. Enable the backend feature flag only after the approved rollout checklist is complete.
              </p>
            ) : null}
          </div>
        </div>
        {disabled ? (
          <Link
            href={ROUTES.admin.settingsImports}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-card px-3 py-2 text-xs font-semibold text-amber-950 transition hover:bg-amber-100"
          >
            <BookOpen className="h-4 w-4" />
            Documentation
          </Link>
        ) : null}
      </div>
    </section>
  );
}
