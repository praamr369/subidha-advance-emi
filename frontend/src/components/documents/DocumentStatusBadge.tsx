"use client";

import ERPStatusBadge from "@/components/erp/ERPStatusBadge";

export default function DocumentStatusBadge({
  status,
  label,
  className,
  size = "sm",
  hideIcon = false,
}: {
  status?: string | null;
  label?: string | null;
  className?: string;
  size?: "sm" | "md";
  hideIcon?: boolean;
}) {
  return (
    <ERPStatusBadge
      status={status}
      label={label}
      size={size}
      hideIcon={hideIcon}
      className={className}
    />
  );
}

