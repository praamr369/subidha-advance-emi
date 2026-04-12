type PaginationControlsProps = {
  count: number;
  page: number;
  pageSize: number;
  numPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
  disabled?: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

export default function PaginationControls({
  count,
  page,
  pageSize,
  numPages,
  hasNext,
  hasPrevious,
  disabled = false,
  onPrevious,
  onNext,
}: PaginationControlsProps) {
  const safePage = page > 0 ? page : 1;
  const safeNumPages = numPages > 0 ? numPages : 1;
  const startRow = count === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endRow = count === 0 ? 0 : Math.min(safePage * pageSize, count);

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-muted-foreground">
        Showing <span className="font-semibold text-foreground">{startRow}-{endRow}</span> of{" "}
        <span className="font-semibold text-foreground">{count}</span> results
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border bg-[var(--surface-card-elevated)] px-3 py-1 text-xs font-semibold text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
          Page {safePage} of {safeNumPages}
        </span>
        <button
          type="button"
          onClick={onPrevious}
          disabled={disabled || !hasPrevious}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] transition hover:-translate-y-0.5 hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={disabled || !hasNext}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] transition hover:-translate-y-0.5 hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Next
        </button>
      </div>
    </div>
  );
}
