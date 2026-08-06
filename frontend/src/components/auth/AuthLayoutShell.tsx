import type { ReactNode } from "react";
import { ShieldCheck, LayoutPanelLeft, WalletCards, ArrowUpRight } from "lucide-react";

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
  "Sign in to run daily Lucky Plan Advance EMI operations through one controlled workspace.";

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
    <section className={cn("auth-stage w-full", className)}>
      <div className="auth-shell grid min-h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <aside className="hidden relative border-r border-border bg-slate-950 lg:block overflow-hidden">
          <div className="absolute inset-0 pointer-events-none bg-[url('https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80')] bg-cover bg-center opacity-40 mix-blend-luminosity" />
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-slate-950/90 via-slate-950/60 to-slate-900/90" />
          <div className="relative flex h-full flex-col justify-between p-8 xl:p-10 z-10">
          <div>
            <AuthBrand tone="dark" />

            <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              Secure Operations Access
            </div>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white">{panelTitle}</h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-300">{panelDescription}</p>

            <div className="mt-8 space-y-3">
              {PANEL_POINTS.map((point) => {
                const Icon = point.icon;
                return (
                  <div
                    key={point.label}
                    className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-slate-100 backdrop-blur-sm"
                  >
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-slate-100">
                      <Icon className="h-4 w-4 text-slate-100" />
                    </span>
                    <span className="font-medium">{point.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="auth-mini-stat p-4 text-white">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">Entry</div>
              <div className="mt-2 text-sm font-semibold">Role safe</div>
            </div>
            <div className="auth-mini-stat p-4 text-white">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">Workflows</div>
              <div className="mt-2 text-sm font-semibold">Audited</div>
            </div>
            <div className="auth-mini-stat p-4 text-white">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">Routing</div>
              <div className="mt-2 text-sm font-semibold">Session aware</div>
            </div>
          </div>
        </div>
        </aside>

        <div className="relative flex min-h-full flex-col justify-center bg-background lg:bg-transparent">
          <div className="relative mx-auto w-full max-w-xl px-4 py-8 sm:px-8 lg:px-10">
            <div className="mb-5 lg:hidden">
              <AuthBrand compact={compactMobileBrand} tone="light" className="dark:hidden" />
              <AuthBrand compact={compactMobileBrand} tone="dark" className="hidden dark:flex" />
            </div>

            <div className="public-card dark:bg-card dark:border-border dark:shadow-none p-5 sm:p-7">
              <div className="workspace-pill w-fit px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                Secure Entry
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.9rem]">
                {formTitle}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{formSubtitle}</p>
              <div className="mt-6">{children}</div>

              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border/80 pt-5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Session-safe routing
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <WalletCards className="h-3.5 w-3.5" />
                  Collections remain audited
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  Use your approved role account
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
