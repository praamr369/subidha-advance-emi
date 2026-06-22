import { X } from "lucide-react";
import { type ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
};

export function EntityDrawer({
  open,
  title,
  onClose,
  children,
  width = "w-[480px]",
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20">
      <div className={`${width} flex h-full flex-col bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-stone-800">{title}</h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}
