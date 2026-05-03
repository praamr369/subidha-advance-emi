"use client";

import Link from "next/link";
import { Bookmark, CircleHelp, History, Search, Settings } from "lucide-react";

import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "@/components/ui/menubar";
import type { NavigationRole } from "@/config/navigation";
import { ROUTES } from "@/lib/routes";

type AdminWorkspaceMenubarProps = {
  role: NavigationRole;
  onOpenCommandPalette: () => void;
  onOpenQuickActions: () => void;
};

/** Optional admin-only strip: non-destructive navigation accelerators only. */
export default function AdminWorkspaceMenubar({
  role,
  onOpenCommandPalette,
  onOpenQuickActions,
}: AdminWorkspaceMenubarProps) {
  if (role !== "ADMIN") {
    return null;
  }

  const settingsHref = ROUTES.admin.settings;

  return (
    <Menubar className="hidden rounded-none border-b border-[var(--topbar-border)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--topbar-control)_92%,white_8%),color-mix(in_oklab,var(--topbar-control)_82%,var(--surface-muted)_18%))] px-2 py-1 lg:flex">
      <MenubarMenu>
        <MenubarTrigger className="gap-1.5">
          <Search className="size-3.5 shrink-0" aria-hidden />
          Search
        </MenubarTrigger>
        <MenubarContent align="start">
          <MenubarItem onClick={() => onOpenCommandPalette()} className="gap-2">
            <Search className="size-4 shrink-0 opacity-70" aria-hidden />
            Command palette…
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="gap-1.5">
          <History className="size-3.5 shrink-0" aria-hidden />
          Recent
        </MenubarTrigger>
        <MenubarContent align="start">
          <MenubarItem onClick={() => onOpenCommandPalette()} className="gap-2">
            <History className="size-4 shrink-0 opacity-70" aria-hidden />
            Show recent routes…
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="gap-1.5">
          <Bookmark className="size-3.5 shrink-0" aria-hidden />
          Favorites
        </MenubarTrigger>
        <MenubarContent align="start">
          <MenubarItem onClick={() => onOpenQuickActions()} className="gap-2">
            <Bookmark className="size-4 shrink-0 opacity-70" aria-hidden />
            Open quick actions drawer…
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <div className="mx-1 hidden h-6 w-px shrink-0 bg-border lg:block" aria-hidden />

      <MenubarMenu>
        <MenubarTrigger className="gap-1.5">
          <CircleHelp className="size-3.5 shrink-0" aria-hidden />
          Help
        </MenubarTrigger>
        <MenubarContent align="start">
          <MenubarItem asChild>
            <Link href={ROUTES.admin.operationsCommandCenter}>Operations command center</Link>
          </MenubarItem>
          <MenubarItem asChild>
            <Link href={ROUTES.admin.aiAssistant}>AI assistant (read-only)</Link>
          </MenubarItem>
          <MenubarItem asChild>
            <Link href={ROUTES.public.policies} target="_blank" rel="noreferrer">
              Public policies (new tab)
            </Link>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="gap-1.5">
          <Settings className="size-3.5 shrink-0" aria-hidden />
          Settings
        </MenubarTrigger>
        <MenubarContent align="start">
          <MenubarItem asChild>
            <Link href={settingsHref}>Workspace settings</Link>
          </MenubarItem>
          <MenubarItem asChild>
            <Link href={ROUTES.admin.settingsRolesPermissions}>Roles &amp; permissions</Link>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
