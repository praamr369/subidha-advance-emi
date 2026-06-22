import { type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export function FilterBar({ children }: Props) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">{children}</div>
  );
}
