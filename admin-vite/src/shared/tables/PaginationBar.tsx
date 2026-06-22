import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function PaginationBar({ page, pageSize, total, onPageChange }: Props) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  return (
    <div className="mt-4 flex items-center justify-between text-sm text-stone-600">
      <span>
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}{" "}
        of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-md p-1.5 hover:bg-stone-100 disabled:opacity-40"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="px-3">
          Page {page} of {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-md p-1.5 hover:bg-stone-100 disabled:opacity-40"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
