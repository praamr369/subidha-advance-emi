import type { ReactNode } from "react";

import PageHeader from "@/components/ui/PageHeader";

type WorkbenchHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
};

export default function WorkbenchHeader({
  eyebrow,
  title,
  description,
  actions,
}: WorkbenchHeaderProps) {
  return (
    <PageHeader
      eyebrow={eyebrow}
      title={title}
      description={description}
      helperNote="Existing operational routes remain active while this workbench is consolidated. Backend services remain the source of truth."
      helperTone="info"
      actions={actions}
    />
  );
}
