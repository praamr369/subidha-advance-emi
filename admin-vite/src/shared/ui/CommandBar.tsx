import { Search, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { sidebarModules } from "@/shell/sidebar-modules";

export function CommandBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const filtered = sidebarModules.filter((m) =>
    m.label.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[20vh]">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center gap-3 border-b border-stone-200 px-4 py-3">
          <Search size={18} className="text-stone-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to module..."
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <button
            onClick={() => setOpen(false)}
            className="text-stone-400 hover:text-stone-600"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.path}
                onClick={() => {
                  navigate({ to: m.path });
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100"
              >
                <Icon size={16} className="text-stone-400" />
                {m.label}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-6 text-center text-sm text-stone-400">
              No matches
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
