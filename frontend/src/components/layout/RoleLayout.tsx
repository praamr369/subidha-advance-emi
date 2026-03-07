"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type FlatLink = {
  href: string;
  label: string;
  group?: string;
};

type GroupedLinks = Record<string, FlatLink[]>;

type RoleLayoutProps = {
  title: string;
  children: ReactNode;
  links?: FlatLink[];
  groupedLinks?: GroupedLinks;
  currentPath?: string;
};

function normalizeGroupedLinks(links?: FlatLink[], groupedLinks?: GroupedLinks): GroupedLinks {
  if (groupedLinks && Object.keys(groupedLinks).length > 0) {
    return groupedLinks;
  }

  const safeLinks = links ?? [];
  return safeLinks.reduce<GroupedLinks>((acc, link) => {
    const groupName = link.group || "Navigation";
    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push(link);
    return acc;
  }, {});
}

function isActivePath(currentPath: string, href: string): boolean {
  if (href === currentPath) return true;
  if (href === "/") return currentPath === "/";
  return currentPath.startsWith(`${href}/`);
}

function prettifySegment(segment: string): string {
  return segment
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function RoleLayout({
  title,
  children,
  links,
  groupedLinks,
  currentPath,
}: RoleLayoutProps) {
  const pathname = usePathname();
  const resolvedPath = currentPath || pathname || "/";
  const [mobileOpen, setMobileOpen] = useState(false);

  const navGroups = useMemo(
    () => normalizeGroupedLinks(links, groupedLinks),
    [links, groupedLinks]
  );

  const breadcrumbs = useMemo(() => {
    const parts = resolvedPath.split("/").filter(Boolean);
    return parts.map((part, index) => {
      const href = `/${parts.slice(0, index + 1).join("/")}`;
      return {
        href,
        label: prettifySegment(part),
      };
    });
  }, [resolvedPath]);

  const activePageLabel = useMemo(() => {
    for (const groupItems of Object.values(navGroups)) {
      for (const item of groupItems) {
        if (isActivePath(resolvedPath, item.href)) {
          return item.label;
        }
      }
    }
    return breadcrumbs[breadcrumbs.length - 1]?.label || title;
  }, [navGroups, resolvedPath, breadcrumbs, title]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "280px 1fr",
        background: "#f8fafc",
      }}
    >
      {/* Desktop Sidebar */}
      <aside
        style={{
          borderRight: "1px solid #e5e7eb",
          background: "#0f172a",
          color: "#e5e7eb",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 18,
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: 1,
              color: "#94a3b8",
              marginBottom: 8,
            }}
          >
            Subidha Core
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              lineHeight: 1.2,
              color: "#ffffff",
            }}
          >
            {title}
          </h1>
          <p
            style={{
              margin: "8px 0 0 0",
              fontSize: 13,
              color: "#94a3b8",
            }}
          >
            Lucky Plan EMI control workspace
          </p>
        </div>

        <nav style={{ display: "grid", gap: 18 }}>
          {Object.entries(navGroups).map(([groupName, items]) => (
            <div key={groupName} style={{ display: "grid", gap: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  color: "#64748b",
                  fontWeight: 700,
                }}
              >
                {groupName}
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                {items.map((link) => {
                  const active = isActivePath(resolvedPath, link.href);

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      style={{
                        textDecoration: "none",
                        padding: "10px 12px",
                        borderRadius: 10,
                        fontSize: 14,
                        fontWeight: active ? 700 : 500,
                        background: active ? "#1e293b" : "transparent",
                        color: active ? "#ffffff" : "#cbd5e1",
                        border: active ? "1px solid #334155" : "1px solid transparent",
                      }}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div
          style={{
            marginTop: "auto",
            borderTop: "1px solid #1e293b",
            paddingTop: 16,
            display: "grid",
            gap: 8,
          }}
        >
          <Link
            href="/"
            style={{
              textDecoration: "none",
              color: "#cbd5e1",
              fontSize: 14,
            }}
          >
            Public Site
          </Link>
          <Link
            href="/logout"
            style={{
              textDecoration: "none",
              color: "#fca5a5",
              fontSize: 14,
            }}
          >
            Logout
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <div style={{ minWidth: 0 }}>
        {/* Mobile top bar */}
        <div
          style={{
            display: "none",
          }}
          className="rolelayout-mobile-bar"
        />

        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            background: "rgba(248,250,252,0.95)",
            backdropFilter: "blur(8px)",
            borderBottom: "1px solid #e5e7eb",
            padding: "14px 20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  color: "#64748b",
                  marginBottom: 4,
                }}
              >
                {breadcrumbs.length > 0
                  ? breadcrumbs.map((crumb) => crumb.label).join(" / ")
                  : title}
              </div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 22,
                  color: "#0f172a",
                }}
              >
                {activePageLabel}
              </h2>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setMobileOpen((prev) => !prev)}
                style={{
                  display: "none",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  cursor: "pointer",
                }}
                className="rolelayout-mobile-toggle"
              >
                Menu
              </button>

              <Link
                href="/admin/dashboard"
                style={{
                  textDecoration: "none",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#ffffff",
                  color: "#111827",
                  fontSize: 14,
                }}
              >
                Dashboard
              </Link>

              <Link
                href="/admin/subscriptions/create"
                style={{
                  textDecoration: "none",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #0f172a",
                  background: "#0f172a",
                  color: "#ffffff",
                  fontSize: 14,
                }}
              >
                New Subscription
              </Link>
            </div>
          </div>

          {mobileOpen ? (
            <div
              style={{
                marginTop: 14,
                borderTop: "1px solid #e5e7eb",
                paddingTop: 14,
                display: "none",
              }}
              className="rolelayout-mobile-menu"
            >
              <div style={{ display: "grid", gap: 14 }}>
                {Object.entries(navGroups).map(([groupName, items]) => (
                  <div key={groupName} style={{ display: "grid", gap: 8 }}>
                    <div
                      style={{
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: 1,
                        color: "#6b7280",
                        fontWeight: 700,
                      }}
                    >
                      {groupName}
                    </div>

                    <div style={{ display: "grid", gap: 6 }}>
                      {items.map((link) => {
                        const active = isActivePath(resolvedPath, link.href);

                        return (
                          <Link
                            key={link.href}
                            href={link.href}
                            onClick={() => setMobileOpen(false)}
                            style={{
                              textDecoration: "none",
                              padding: "10px 12px",
                              borderRadius: 10,
                              background: active ? "#e2e8f0" : "#ffffff",
                              color: "#111827",
                              border: "1px solid #e5e7eb",
                              fontSize: 14,
                              fontWeight: active ? 700 : 500,
                            }}
                          >
                            {link.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </header>

        <main
          style={{
            padding: 20,
          }}
        >
          {children}
        </main>
      </div>

      <style jsx>{`
        @media (max-width: 1024px) {
          div[style*="grid-template-columns: 280px 1fr"] {
            grid-template-columns: 1fr !important;
          }

          aside {
            display: none !important;
          }

          .rolelayout-mobile-toggle {
            display: inline-flex !important;
          }

          .rolelayout-mobile-menu {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
}