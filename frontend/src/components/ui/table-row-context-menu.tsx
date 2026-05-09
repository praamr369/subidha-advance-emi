"use client";

import Link from "next/link";
import type { ReactElement } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export type SafeRowContextAction =
  | { type: "link"; label: string; href: string }
  | { type: "copy"; label: string; value: string }
  | { type: "separator" };

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard may be unavailable (permissions / non-secure context).
  }
}

/** Right-click surface for safe row shortcuts only (no destructive actions). */
export function TableRowContextMenu({
  actions,
  children,
}: {
  actions: SafeRowContextAction[];
  children: ReactElement;
}) {
  const meaningful = actions.filter((action) => action.type !== "separator");
  if (meaningful.length === 0) {
    return children;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {actions.map((action, index) => {
          if (action.type === "separator") {
            return <ContextMenuSeparator key={`sep-${index}`} />;
          }
          if (action.type === "copy") {
            return (
              <ContextMenuItem key={`copy-${index}`} onSelect={() => void copyToClipboard(action.value)}>
                {action.label}
              </ContextMenuItem>
            );
          }
          return (
            <ContextMenuItem key={`${action.href}-${index}`} asChild>
              <Link href={action.href}>{action.label}</Link>
            </ContextMenuItem>
          );
        })}
      </ContextMenuContent>
    </ContextMenu>
  );
}
