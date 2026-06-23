"use client";

import type { ComponentProps } from "react";

import DrawerShell from "@/components/ui/DrawerShell";

export default function EntityDrawer(props: ComponentProps<typeof DrawerShell>) {
  return <DrawerShell {...props} />;
}
