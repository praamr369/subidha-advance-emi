import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Client component, so the title lives here. It previously fell back to the
 * bare site name, which told a visitor nothing about the page they had opened
 * — and this is the page the scheme's public verifiability rests on, the one
 * a sceptical customer or regulator is most likely to be sent a link to.
 */
export const metadata: Metadata = {
  title: "Verify a lucky draw",
};

export default function VerifyLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
