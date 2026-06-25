"use client";

import Link from "next/link";
import { CircleHelp, Settings } from "lucide-react";

import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@/components/ui/menubar";
import type { NavigationRole } from "@/config/navigation";
import { ROUTES } from "@/lib/routes";

type AdminWorkspaceMenubarProps = {
  role: NavigationRole;
  onOpenCommandPalette: () => void;
  onOpenQuickActions: () => void;
};

/** Admin-only macOS-style menubar strip for non-destructive navigation accelerators. */
export default function AdminWorkspaceMenubar({
  role,
  onOpenCommandPalette,
  onOpenQuickActions,
}: AdminWorkspaceMenubarProps) {
  if (role !== "ADMIN") {
    return null;
  }

  return (
    <Menubar className="hidden rounded-none border-b border-[var(--topbar-border)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--topbar-control)_92%,white_8%),color-mix(in_oklab,var(--topbar-control)_82%,var(--surface-muted)_18%))] px-2 py-1 lg:flex">
      {/* File — create & collect shortcuts */}
      <MenubarMenu>
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent align="start">
          <MenubarItem asChild>
            <Link href={`${ROUTES.admin.customers}/create`}>New Customer…</Link>
          </MenubarItem>
          <MenubarItem asChild>
            <Link href={ROUTES.admin.subscriptionsAdvanceEmiCreate}>New Contract…</Link>
          </MenubarItem>
          <MenubarItem asChild>
            <Link href={ROUTES.admin.billingDirectSaleCreate}>New Direct Sale…</Link>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem asChild>
            <Link href={ROUTES.admin.financeCollect}>Collect Payment</Link>
          </MenubarItem>
          <MenubarItem asChild>
            <Link href={ROUTES.admin.deliveryCreate}>New Delivery</Link>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* View — palette & quick actions */}
      <MenubarMenu>
        <MenubarTrigger>View</MenubarTrigger>
        <MenubarContent align="start">
          <MenubarItem onClick={() => onOpenCommandPalette()} className="justify-between gap-8">
            Command palette
            <span className="shrink-0 rounded border border-border bg-[var(--surface-card-elevated)] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Ctrl K
            </span>
          </MenubarItem>
          <MenubarItem onClick={() => onOpenQuickActions()}>Quick actions panel</MenubarItem>
          <MenubarSeparator />
          <MenubarItem asChild>
            <Link href={ROUTES.admin.dashboard}>Dashboard overview</Link>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Go — jump to key module hubs */}
      <MenubarMenu>
        <MenubarTrigger>Go</MenubarTrigger>
        <MenubarContent align="start">
          <MenubarItem asChild>
            <Link href={ROUTES.admin.accounting}>Accounting</Link>
          </MenubarItem>
          <MenubarItem asChild>
            <Link href={ROUTES.admin.billing}>Sales &amp; Billing</Link>
          </MenubarItem>
          <MenubarItem asChild>
            <Link href={ROUTES.admin.crm}>CRM</Link>
          </MenubarItem>
          <MenubarItem asChild>
            <Link href={ROUTES.admin.hr}>HR</Link>
          </MenubarItem>
          <MenubarItem asChild>
            <Link href={ROUTES.admin.inventory}>Inventory</Link>
          </MenubarItem>
          <MenubarItem asChild>
            <Link href={ROUTES.admin.delivery}>Delivery</Link>
          </MenubarItem>
          <MenubarItem asChild>
            <Link href={ROUTES.admin.manufacturing}>Manufacturing</Link>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem asChild>
            <Link href={ROUTES.admin.customers}>Customers</Link>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <div className="mx-1 hidden h-6 w-px shrink-0 bg-border lg:block" aria-hidden />

      {/* Help */}
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
          <MenubarSeparator />
          <MenubarItem asChild>
            <Link href={ROUTES.public.policies} target="_blank" rel="noreferrer">
              Public policies (new tab)
            </Link>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Settings */}
      <MenubarMenu>
        <MenubarTrigger className="gap-1.5">
          <Settings className="size-3.5 shrink-0" aria-hidden />
          Settings
        </MenubarTrigger>
        <MenubarContent align="start">
          <MenubarItem asChild>
            <Link href={ROUTES.admin.settings}>Workspace settings</Link>
          </MenubarItem>
          <MenubarItem asChild>
            <Link href={ROUTES.admin.settingsRolesPermissions}>Roles &amp; permissions</Link>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
