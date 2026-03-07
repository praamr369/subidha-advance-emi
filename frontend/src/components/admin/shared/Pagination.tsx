type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export default function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  return (
    <div className="flex items-center gap-2">
      <button className="rounded border px-2 py-1" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        Prev
      </button>
      <span>{page} / {totalPages}</span>
      <button className="rounded border px-2 py-1" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        Next
      </button>
    </div>
  );
}
