import { AlertTriangle } from "lucide-react";

type Props = {
  title?: string;
  message?: string;
  onRetry?: () => void;
};

export function ErrorState({
  title = "Something went wrong",
  message = "An unexpected error occurred.",
  onRetry,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertTriangle size={48} className="mb-4 text-red-300" />
      <h3 className="text-lg font-medium text-red-700">{title}</h3>
      <p className="mt-1 text-sm text-stone-500">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded-md bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-200"
        >
          Try again
        </button>
      )}
    </div>
  );
}
