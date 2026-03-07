import type { ReactNode } from "react";

type CardProps = {
  title?: string;
  children: ReactNode;
};

export default function Card({ title, children }: CardProps) {
  return (
    <section className="rounded border bg-white p-4 shadow-sm">
      {title ? <h3 className="mb-3 text-lg font-semibold">{title}</h3> : null}
      {children}
    </section>
  );
}
