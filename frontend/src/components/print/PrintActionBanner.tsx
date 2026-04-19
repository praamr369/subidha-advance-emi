"use client";

import { PrintActions } from "@/components/documents";

type PrintActionBannerProps = {
  title?: string;
  description?: string;
  buttonLabel?: string;
  share?: Parameters<typeof PrintActions>[0]["share"];
  className?: string;
};

export default function PrintActionBanner({
  title = "Print-ready copy",
  description = "Use browser print to save a clean paper copy or PDF without dashboard chrome.",
  buttonLabel = "Print / Save PDF",
  share,
  className,
}: PrintActionBannerProps) {
  return (
    <PrintActions
      title={title}
      description={description}
      buttonLabel={buttonLabel}
      share={share}
      className={className}
    />
  );
}
