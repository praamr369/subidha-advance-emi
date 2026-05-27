import type { ReactNode } from "react";

import CustomerShellRouter from "@/components/layout/CustomerShellRouter";

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return <CustomerShellRouter>{children}</CustomerShellRouter>;
}
