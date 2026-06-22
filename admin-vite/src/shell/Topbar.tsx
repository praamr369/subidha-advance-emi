import { Search, Bell, User } from "lucide-react";
import { useCurrentUser } from "@/shared/auth/useCurrentUser";

export function Topbar() {
  const { data: user } = useCurrentUser();

  return (
    <header className="flex h-14 items-center justify-between border-b border-stone-200 bg-white px-6">
      <div className="flex items-center gap-4">
        <span className="text-sm text-stone-400">Main Branch</span>
      </div>

      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm text-stone-500 transition-colors hover:bg-stone-100">
          <Search size={14} />
          <span>Search...</span>
          <kbd className="ml-4 rounded border border-stone-300 bg-white px-1.5 py-0.5 text-xs text-stone-400">
            ⌘K
          </kbd>
        </button>

        <button className="relative rounded-md p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600">
          <Bell size={18} />
        </button>

        <div className="flex items-center gap-2 rounded-md px-2 py-1 text-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <User size={16} />
          </div>
          <span className="text-stone-700">
            {user?.username ?? "Admin"}
          </span>
        </div>
      </div>
    </header>
  );
}
