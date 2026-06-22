import { useMatches, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

export function Breadcrumbs() {
  const matches = useMatches();
  const crumbs = matches
    .filter((m) => m.pathname !== "/")
    .map((m) => ({
      label: m.pathname.split("/").pop()?.replace(/-/g, " ") ?? "",
      path: m.pathname,
    }));

  if (crumbs.length === 0) return null;

  return (
    <nav className="flex items-center gap-1 px-6 py-2 text-sm text-stone-500">
      <Link to="/" className="hover:text-stone-700">
        Home
      </Link>
      {crumbs.map((c) => (
        <span key={c.path} className="flex items-center gap-1">
          <ChevronRight size={14} />
          <span className="capitalize text-stone-700">{c.label}</span>
        </span>
      ))}
    </nav>
  );
}
