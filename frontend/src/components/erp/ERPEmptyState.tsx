"use client";

import type { ComponentProps } from "react";

import EmptyState from "@/components/feedback/EmptyState";

export type ERPEmptyStateProps = ComponentProps<typeof EmptyState>;

export default function ERPEmptyState(props: ERPEmptyStateProps) {
  return <EmptyState {...props} />;
}

