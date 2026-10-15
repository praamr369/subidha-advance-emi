import type { Metadata } from "next";
import type { ReactNode } from "react";

import { buildPortalMetadata } from "@/lib/portal-metadata";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";

export const metadata: Metadata = buildPortalMetadata(
  "Secure workspace",
  "Private SUBIDHA CORE operations workspace."
);

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const locale = await getPublicLocale();
  const dictionary = getPublicDictionary(locale);

  return (
    <I18nProvider locale={locale} dictionary={dictionary}>
      <div className="dashboard-app min-h-screen bg-background text-foreground">{children}</div>
    </I18nProvider>
  );
}
