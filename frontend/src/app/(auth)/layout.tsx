import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";

import { getDictionary } from "@/i18n/get-dictionary";
import { cookieName, fallbackLng, type Locale } from "@/i18n/settings";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";

import ThemeToggle from "@/components/ui/ThemeToggle";
import { buildPortalMetadata } from "@/lib/portal-metadata";

export const metadata: Metadata = buildPortalMetadata(
  "Secure sign in",
  "Secure access to SUBIDHA CORE role-based workspaces."
);

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const locale = (cookieStore.get(cookieName)?.value as Locale) || fallbackLng;
  const dictionary = await getDictionary(locale);

  return (
    <I18nProvider locale={locale} dictionary={dictionary}>
      <div className="public-app relative min-h-screen w-full overflow-x-hidden text-foreground">
        <div className="pointer-events-none absolute right-4 top-4 z-20 sm:right-6 sm:top-5">
          <div className="pointer-events-auto flex items-center gap-3">
            <LanguageSwitcher />
            <ThemeToggle variant="public" />
          </div>
        </div>
        <main id="main-content" tabIndex={-1}>
          <div className="mx-auto flex min-h-screen w-full max-w-7xl items-stretch justify-center px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </I18nProvider>
  );
}
