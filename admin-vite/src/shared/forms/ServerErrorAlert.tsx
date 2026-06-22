import { AlertTriangle } from "lucide-react";

type Props = {
  error?: string | null;
};

export function ServerErrorAlert({ error }: Props) {
  if (!error) return null;

  return (
    <div className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <AlertTriangle size={16} className="shrink-0" />
      <span>{error}</span>
    </div>
  );
}
