"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type PortalAction = {
  href: string;
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

type PortalBreadcrumb = {
  href?: string;
  label: string;
};

type PortalStat = {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "warning" | "danger" | "info";
};

type PortalStatusBadge = {
  label: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
};

type PortalPageProps = {
  title: string;
  subtitle?: string;
  actions?: ReadonlyArray<PortalAction>;
  breadcrumbs?: ReadonlyArray<PortalBreadcrumb>;
  stats?: ReadonlyArray<PortalStat>;
  statusBadge?: PortalStatusBadge;
  children?: ReactNode;
  maxWidth?: number | string;
};

function getBadgeStyles(
  tone: PortalStat["tone"] | PortalStatusBadge["tone"]
): React.CSSProperties {
  switch (tone) {
    case "success":
      return {
        background: "#ecfdf5",
        color: "#065f46",
        border: "1px solid #a7f3d0",
      };
    case "warning":
      return {
        background: "#fffbeb",
        color: "#92400e",
        border: "1px solid #fde68a",
      };
    case "danger":
      return {
        background: "#fef2f2",
        color: "#991b1b",
        border: "1px solid #fecaca",
      };
    case "info":
      return {
        background: "#eff6ff",
        color: "#1d4ed8",
        border: "1px solid #bfdbfe",
      };
    case "default":
    default:
      return {
        background: "#f8fafc",
        color: "#334155",
        border: "1px solid #e2e8f0",
      };
  }
}

function getActionStyles(variant: PortalAction["variant"]): React.CSSProperties {
  switch (variant) {
    case "primary":
      return {
        background: "#0f172a",
        color: "#ffffff",
        border: "1px solid #0f172a",
      };
    case "danger":
      return {
        background: "#991b1b",
        color: "#ffffff",
        border: "1px solid #991b1b",
      };
    case "ghost":
      return {
        background: "transparent",
        color: "#0f172a",
        border: "1px dashed #cbd5e1",
      };
    case "secondary":
    default:
      return {
        background: "#ffffff",
        color: "#0f172a",
        border: "1px solid #d1d5db",
      };
  }
}

export default function PortalPage({
  title,
  subtitle,
  actions = [],
  breadcrumbs = [],
  stats = [],
  statusBadge,
  children,
  maxWidth = 1320,
}: PortalPageProps) {
  return (
    <main
      style={{
        fontFamily: "Inter, Arial, sans-serif",
        maxWidth,
        margin: "0 auto",
        padding: "24px 20px 40px",
        display: "grid",
        gap: 18,
      }}
    >
      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 ? (
        <nav
          aria-label="Breadcrumb"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            fontSize: 13,
            color: "#64748b",
          }}
        >
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;

            return (
              <span
                key={`${crumb.label}-${index}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                {crumb.href && !isLast ? (
                  <Link
                    href={crumb.href}
                    style={{
                      color: "#475569",
                      textDecoration: "none",
                    }}
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span style={{ color: isLast ? "#0f172a" : "#475569", fontWeight: isLast ? 600 : 400 }}>
                    {crumb.label}
                  </span>
                )}

                {!isLast ? <span style={{ color: "#94a3b8" }}>/</span> : null}
              </span>
            );
          })}
        </nav>
      ) : null}

      {/* Header */}
      <section
        style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 20,
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
          display: "grid",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 480px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
                marginBottom: 6,
              }}
            >
              <h1
                style={{
                  margin: 0,
                  fontSize: 30,
                  lineHeight: 1.15,
                  color: "#0f172a",
                  letterSpacing: "-0.02em",
                }}
              >
                {title}
              </h1>

              {statusBadge ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    borderRadius: 999,
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 700,
                    ...getBadgeStyles(statusBadge.tone),
                  }}
                >
                  {statusBadge.label}
                </span>
              ) : null}
            </div>

            {subtitle ? (
              <p
                style={{
                  margin: 0,
                  color: "#475569",
                  fontSize: 15,
                  lineHeight: 1.6,
                  maxWidth: 900,
                }}
              >
                {subtitle}
              </p>
            ) : null}
          </div>

          {actions.length > 0 ? (
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                justifyContent: "flex-end",
                alignItems: "center",
              }}
            >
              {actions.map((action) => (
                <Link
                  key={`${action.href}-${action.label}`}
                  href={action.href}
                  style={{
                    textDecoration: "none",
                    fontWeight: 600,
                    fontSize: 14,
                    borderRadius: 10,
                    padding: "10px 14px",
                    transition: "all 0.2s ease",
                    ...getActionStyles(action.variant),
                  }}
                >
                  {action.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        {/* KPI strip */}
        {stats.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
              gap: 10,
            }}
          >
            {stats.map((stat, index) => (
              <div
                key={`${stat.label}-${index}`}
                style={{
                  borderRadius: 12,
                  padding: 14,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#64748b",
                    marginBottom: 6,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {stat.label}
                </div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    lineHeight: 1.1,
                    ...getBadgeStyles(stat.tone),
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    borderRadius: 0,
                  }}
                >
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {/* Body */}
      <section
        style={{
          display: "grid",
          gap: 16,
        }}
      >
        {children}
      </section>
    </main>
  );
}