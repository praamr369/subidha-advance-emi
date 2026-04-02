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
        Showing {startRow}-{endRow} of {count} results · Page {safePage} of {safeNumPages}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onPrevious}
          disabled={disabled || !hasPrevious}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={disabled || !hasNext}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          Next
        </button>
      </div>
    </div>
  );
}
