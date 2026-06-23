"use client";

import type { ComponentProps } from "react";

import BaseErrorState from "@/components/ui/ErrorState";

export default function ErrorState(props: ComponentProps<typeof BaseErrorState>) {
  return <BaseErrorState {...props} />;
}
