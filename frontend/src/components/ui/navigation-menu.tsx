"use client";

import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

/** Flat public nav (no mega-menus). Dropdown variants can extend this file later. */
export function NavigationMenu({ className, ...props }: ComponentProps<typeof NavigationMenuPrimitive.Root>) {
  return (
    <NavigationMenuPrimitive.Root
      data-slot="navigation-menu"
      className={cn("relative z-[60] flex max-w-max flex-1 items-center justify-center", className)}
      {...props}
    />
  );
}

export function NavigationMenuList({ className, ...props }: ComponentProps<typeof NavigationMenuPrimitive.List>) {
  return (
    <NavigationMenuPrimitive.List
      data-slot="navigation-menu-list"
      className={cn("group flex flex-1 list-none items-center justify-center gap-2", className)}
      {...props}
    />
  );
}

export function NavigationMenuItem({ className, ...props }: ComponentProps<typeof NavigationMenuPrimitive.Item>) {
  return (
    <NavigationMenuPrimitive.Item data-slot="navigation-menu-item" className={cn(className)} {...props} />
  );
}

export function NavigationMenuLink({ className, ...props }: ComponentProps<typeof NavigationMenuPrimitive.Link>) {
  return (
    <NavigationMenuPrimitive.Link
      data-slot="navigation-menu-link"
      className={cn(
        "inline-flex rounded-full px-3 py-2 text-sm font-medium transition-colors hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 data-[active]:bg-card data-[active]:text-slate-950 data-[active]:shadow-[0_12px_28px_-22px_rgba(15,23,42,0.78)]",
        className
      )}
      {...props}
    />
  );
}
