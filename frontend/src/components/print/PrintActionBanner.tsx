"use client";

import { PrintActions } from "@/components/documents";

type PrintActionBannerProps = {
  title?: string;
  description?: string;
  buttonLabel?: string;
  className?: string;
};

export default function PrintActionBanner({
  title = "Print-ready copy",
  description = "Use browser print to save a clean paper copy or PDF without dashboard chrome.",
  buttonLabel = "Print / Save PDF",
  className,
}: PrintActionBannerProps) {
  return (
    <PrintActions
      title={title}
      description={description}
      buttonLabel={buttonLabel}
      className={className}
    />
  );
}
