import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * The register page is a client component and so cannot export metadata
 * itself. Without this it inherited the auth group's title, "Secure sign in",
 * which describes a different page — a WCAG 2.4.2 failure and the text a
 * screen reader announces first, plus what lands in a bookmark or a tab.
 */
export const metadata: Metadata = {
  title: "Create an account",
};

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
