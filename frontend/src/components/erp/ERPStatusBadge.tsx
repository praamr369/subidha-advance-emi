"use client";

import type { ComponentProps } from "react";

import StatusBadge from "@/components/ui/status-badge";

export type ERPStatusBadgeProps = ComponentProps<typeof StatusBadge>;

export default function ERPStatusBadge(props: ERPStatusBadgeProps) {
  return <StatusBadge {...props} />;
}

