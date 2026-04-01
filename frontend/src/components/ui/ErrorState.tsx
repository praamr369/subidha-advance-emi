// frontend/src/components/ui/ErrorState.tsx
import { AlertCircle } from "lucide-react";

type ErrorStateProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
};

export default function ErrorState({
  title = "Error",
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center">
      <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
      <h3 className="text-sm font-semibold text-destructive">{title}</h3>
      {message && <p className="mt-1 text-sm text-destructive/80">{message}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded-lg border border-destructive/30 bg-background px-4 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/10"
        >
          Try again
        </button>
      )}
    </div>
  );
}