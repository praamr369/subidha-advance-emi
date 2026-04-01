import { memo } from "react";
import { AlertTriangle } from "lucide-react";

type ErrorStateProps = {
  title?: string;
  description?: string;
  message?: string;
  onRetry?: () => void;
};

function ErrorState({
  title = "Something went wrong",
  description,
  message,
  onRetry,
}: ErrorStateProps) {
  const resolvedMessage = description ?? message ?? "Please retry the request.";

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-full border border-red-200 bg-white p-2 text-red-700">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-red-800">{title}</p>
          <p className="mt-1 text-sm text-red-700">{resolvedMessage}</p>
          {onRetry ? (
            <button
              className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-800 transition hover:bg-red-100"
              onClick={onRetry}
              type="button"
            >
              Retry
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default memo(ErrorState);
