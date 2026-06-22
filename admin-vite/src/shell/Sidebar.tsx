import { Link, useMatchRoute } from "@tanstack/react-router";
import { sidebarModules } from "./sidebar-modules";
import { APP_NAME } from "@/app/env";

export function Sidebar() {
  const matchRoute = useMatchRoute();

  return (
    <aside className="flex h-full w-60 flex-col bg-[var(--color-sidebar-bg)] text-[var(--color-sidebar-text)]">
      <div className="flex h-14 items-center gap-2 border-b border-white/10 px-4">
        <span className="text-lg font-bold tracking-tight text-white">
          {APP_NAME}
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {sidebarModules.map((m) => {
          const active = matchRoute({ to: m.path, fuzzy: m.path !== "/" });
          const Icon = m.icon;
          return (
            <Link
              key={m.path}
              to={m.path}
              className={`mx-2 my-0.5 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-[var(--color-sidebar-active)] font-medium text-white"
                  : "hover:bg-[var(--color-sidebar-hover)]"
              }`}
            >
              <Icon size={18} strokeWidth={1.8} />
              {m.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-4 py-3 text-xs text-white/40">
        v0.1.0
      </div>
    </aside>
  );
}
