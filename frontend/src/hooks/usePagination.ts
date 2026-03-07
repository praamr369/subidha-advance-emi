import { useMemo, useState } from "react";

export function usePagination(totalItems: number, pageSize = 10) {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const offset = useMemo(() => (page - 1) * pageSize, [page, pageSize]);

  function goTo(nextPage: number) {
    setPage(Math.min(Math.max(1, nextPage), totalPages));
  }

  return {
    page,
    pageSize,
    offset,
    totalPages,
    goTo,
  };
}
