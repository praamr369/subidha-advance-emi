import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import styles from "./PublicVisualShell.module.css";

type PublicVisualShellProps = {
  children: ReactNode;
  className?: string;
};

export default function PublicVisualShell({ children, className }: PublicVisualShellProps) {
  return (
    <main id="main-content" tabIndex={-1} className={cn("min-w-0 flex-1 overflow-x-clip", className)}>
      <div className={styles.content}>{children}</div>
    </main>
  );
}
