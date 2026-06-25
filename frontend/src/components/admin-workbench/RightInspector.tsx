import type { ReactNode } from "react";

type RightInspectorProps = {
  title: string;
  children: ReactNode;
};

export default function RightInspector({ title, children }: RightInspectorProps) {
  return (
    <aside className="surface-panel-elevated h-fit rounded-xl border border-border p-4 xl:sticky xl:top-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Inspector
      </p>
      <h2 className="mt-2 text-base font-semibold text-foreground">{title}</h2>
      <div className="mt-4 space-y-3 text-sm text-muted-foreground">{children}</div>
    </aside>
  );
}
