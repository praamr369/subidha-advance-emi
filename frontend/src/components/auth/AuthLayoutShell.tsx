import type { ReactNode } from "react";
import { ShieldCheck, LayoutPanelLeft, WalletCards } from "lucide-react";

import AuthBrand from "@/components/auth/AuthBrand";
import { cn } from "@/lib/utils";

type AuthLayoutShellProps = {
  children: ReactNode;
  formTitle: string;
  formSubtitle: string;
  panelTitle?: string;
  panelDescription?: string;
  className?: string;
  compactMobileBrand?: boolean;
};

const DEFAULT_PANEL_TITLE = "Subidha Furniture secure operations access";
const DEFAULT_PANEL_DESCRIPTION =
  "Sign in to run daily Lucky Plan EMI operations through one controlled workspace.";

const PANEL_POINTS = [
  {
    icon: ShieldCheck,
    label: "Secure staff access",
  },
  {
    icon: LayoutPanelLeft,
    label: "Role-based workspace routing",
  },
  {
    icon: WalletCards,
    label: "Collections, CRM, and operations in one system",
  },
] as const;

export default function AuthLayoutShell({
  children,
  formTitle,
  formSubtitle,
  panelTitle = DEFAULT_PANEL_TITLE,
  panelDescription = DEFAULT_PANEL_DESCRIPTION,
  className,
  compactMobileBrand = true,
}: AuthLayoutShellProps) {
  return (
    <section
      className={cn(
        "w-full overflow-hidden rounded-[28px] border border-slate-300 bg-white shadow-[0_26px_60px_-42px_rgba(15,23,42,0.36)]",
        "grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]",
        className
      )}
    >
      <aside className="hidden border-r border-slate-200 bg-slate-900/95 lg:block">
        <div className="flex h-full flex-col justify-between p-8 xl:p-10">
          <div>
            <AuthBrand tone="dark" />

            <h2 className="mt-8 text-3xl font-semibold tracking-tight text-white">{panelTitle}</h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-300">{panelDescription}</p>

            <div className="mt-8 space-y-3">
              {PANEL_POINTS.map((point) => {
                const Icon = point.icon;
                return (
                  <div
                    key={point.label}
                    className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-100"
                  >
                    <Icon className="h-4 w-4 text-slate-200" />
                    <span>{point.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-h-full items-center">
        <div className="mx-auto w-full max-w-xl px-4 py-6 sm:px-8 sm:py-8 lg:px-10">
          {compactMobileBrand ? (
            <AuthBrand compact className="mb-5 lg:hidden" />
          ) : null}

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[1.9rem]">
              {formTitle}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{formSubtitle}</p>
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
