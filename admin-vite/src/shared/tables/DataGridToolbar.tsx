import { type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export function DataGridToolbar({ children }: Props) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      {children}
    </div>
  );
}
