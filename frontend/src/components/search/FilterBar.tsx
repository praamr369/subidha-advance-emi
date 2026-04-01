import type { ReactNode } from "react";
export default function FilterBar({ children }: { children: ReactNode }) { return <div className="flex flex-wrap gap-2">{children}</div>; }
