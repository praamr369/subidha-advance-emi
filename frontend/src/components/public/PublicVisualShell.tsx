import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import styles from "./PublicVisualShell.module.css";

type PublicVisualShellProps = {
  children: ReactNode;
  className?: string;
};

export default function PublicVisualShell({ children, className }: PublicVisualShellProps) {
  return (
    <main id="main-content" tabIndex={-1} className={cn(styles.shell, "min-w-0 flex-1 overflow-x-clip", className)}>
      <div aria-hidden="true" className={styles.ambient}>
        <span className={cn(styles.orb, styles.orbWalnut)} />
        <span className={cn(styles.orb, styles.orbGold)} />
        <span className={cn(styles.orb, styles.orbCream)} />
        <div className={styles.scene}>
          <span className={cn(styles.floatCard, styles.cardOne)} data-kicker="Lucky Plan">
            15 EMI
          </span>
          <span className={cn(styles.floatCard, styles.cardTwo)} data-kicker="Public Draw">
            Lucky ID
          </span>
          <span className={cn(styles.floatCard, styles.cardThree)} data-kicker="Rent / Lease">
            Monthly
          </span>
          <span className={styles.showroomLine} />
        </div>
      </div>
      <div className={styles.content}>{children}</div>
    </main>
  );
}
