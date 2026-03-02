import Link from "next/link";
import type { ReactNode } from "react";

type PortalPageProps = {
  title: string;
  subtitle: string;
  actions?: ReadonlyArray<{ href: string; label: string }>;
  children?: ReactNode;
};

export default function PortalPage({ title, subtitle, actions = [], children }: PortalPageProps) {
  return (
    <main style={{ fontFamily: "Inter, Arial, sans-serif", maxWidth: 980, margin: "0 auto", padding: "32px 20px" }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 30 }}>{title}</h1>
        <p style={{ marginTop: 8, color: "#4b5563" }}>{subtitle}</p>
        {actions.length > 0 ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                style={{
                  border: "1px solid #111827",
                  padding: "8px 12px",
                  borderRadius: 8,
                  textDecoration: "none",
                  color: "#111827",
                  fontWeight: 600,
                }}
              >
                {action.label}
              </Link>
            ))}
          </div>
        ) : null}
      </header>
      {children}
    </main>
  );
}
