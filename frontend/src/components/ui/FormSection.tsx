"use client";

import { ReactNode, useState } from "react";

type FormSectionProps = {
  title?: string;

  description?: string;

  children: ReactNode;

  columns?: 1 | 2 | 3 | 4;

  collapsible?: boolean;

  defaultOpen?: boolean;

  actions?: ReactNode;

  divider?: boolean;
};

export default function FormSection({
  title,
  description,
  children,
  columns = 2,
  collapsible = false,
  defaultOpen = true,
  actions,
  divider = true,
}: FormSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  const gridTemplate = {
    1: "1fr",
    2: "repeat(auto-fit,minmax(240px,1fr))",
    3: "repeat(auto-fit,minmax(220px,1fr))",
    4: "repeat(auto-fit,minmax(180px,1fr))",
  };

  return (
    <section
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        background: "#ffffff",
        overflow: "hidden",
      }}
    >
      {(title || description || actions || collapsible) && (
        <header
          style={{
            padding: "18px 20px",
            borderBottom: divider ? "1px solid #e5e7eb" : undefined,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title && (
              <h3
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                {title}
              </h3>
            )}

            {description && (
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 14,
                  color: "#64748b",
                  maxWidth: 640,
                  lineHeight: 1.6,
                }}
              >
                {description}
              </p>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            {actions}

            {collapsible && (
              <button
                type="button"
                onClick={() => setOpen(!open)}
                style={{
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  padding: "6px 10px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {open ? "Collapse" : "Expand"}
              </button>
            )}
          </div>
        </header>
      )}

      {(!collapsible || open) && (
        <div
          style={{
            padding: "20px",
            display: "grid",
            gap: 18,
            gridTemplateColumns: gridTemplate[columns],
          }}
        >
          {children}
        </div>
      )}
    </section>
  );
}