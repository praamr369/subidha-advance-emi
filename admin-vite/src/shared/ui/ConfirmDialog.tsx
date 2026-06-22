import { X } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "default",
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-stone-800">{title}</h2>
          <button
            onClick={onCancel}
            className="text-stone-400 hover:text-stone-600"
          >
            <X size={18} />
          </button>
        </div>

        {description && (
          <p className="mb-6 text-sm text-stone-500">{description}</p>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
              variant === "danger"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-brand-700 hover:bg-brand-800"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
