import { memo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

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
    <div className="rounded-[1.4rem] border border-red-200/90 bg-[linear-gradient(180deg,rgba(254,242,242,0.98),rgba(254,226,226,0.9))] p-4 shadow-[0_16px_36px_-28px_rgba(127,29,29,0.42)]">
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-red-200/90 bg-[color-mix(in_oklab,var(--surface-card-elevated)_90%,white_10%)] p-2 text-red-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-[0.01em] text-red-900">{title}</p>
          <p className="mt-1 text-sm leading-6 text-red-800">{resolvedMessage}</p>
          {onRetry ? (
            <button
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-[color-mix(in_oklab,var(--surface-card-elevated)_90%,white_10%)] px-3 py-1.5 text-sm font-semibold text-red-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] motion-safe:transition motion-safe:duration-150 motion-safe:hover:-translate-y-0.5 hover:bg-red-100"
              onClick={onRetry}
              type="button"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default memo(ErrorState);
