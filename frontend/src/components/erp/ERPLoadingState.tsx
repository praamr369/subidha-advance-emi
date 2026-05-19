"use client";

import type { ComponentProps } from "react";

import LoadingBlock from "@/components/feedback/LoadingBlock";

export type ERPLoadingStateProps = ComponentProps<typeof LoadingBlock>;

export default function ERPLoadingState(props: ERPLoadingStateProps) {
  return <LoadingBlock {...props} />;
}

