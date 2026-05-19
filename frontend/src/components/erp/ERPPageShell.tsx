"use client";

import type { ComponentProps } from "react";

import PortalPage from "@/components/ui/PortalPage";

export type ERPPageShellProps = ComponentProps<typeof PortalPage>;

export default function ERPPageShell(props: ERPPageShellProps) {
  return <PortalPage {...props} />;
}

