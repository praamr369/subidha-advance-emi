"use client";

import type { ComponentProps } from "react";

import ConfirmActionButton from "@/components/ui/ConfirmActionButton";

export default function ConfirmActionDialog(
  props: ComponentProps<typeof ConfirmActionButton>
) {
  return <ConfirmActionButton {...props} />;
}
