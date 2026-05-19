"use client";

import type { ComponentProps } from "react";

import ErrorState from "@/components/feedback/ErrorState";

export type ERPErrorStateProps = ComponentProps<typeof ErrorState>;

export default function ERPErrorState(props: ERPErrorStateProps) {
  return <ErrorState {...props} />;
}

