import { Search, X } from "lucide-react";
import { useState } from "react";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[20vh]">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center gap-3 border-b border-stone-200 px-4 py-3">
          <Search size={18} className="text-stone-400" />
          <input
            autoFocus
            placeholder="Search modules, customers, products..."
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <button
            onClick={() => setOpen(false)}
            className="text-stone-400 hover:text-stone-600"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-4 text-center text-sm text-stone-400">
          Global search coming soon
        </div>
      </div>
    </div>
  );
}
