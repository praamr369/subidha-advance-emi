import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Layout for standalone public forms.
 *
 * This route group had no layout, so its pages rendered with no <main>
 * landmark — which meant the root layout's "Skip to main content" link
 * pointed at an id that did not exist. A skip link with no target is worse
 * than none: a keyboard user activates it and nothing happens.
 */
export const metadata: Metadata = {
  title: "Enquiry form",
};

export default function WebsiteFormsLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen">
      {children}
    </main>
  );
}
