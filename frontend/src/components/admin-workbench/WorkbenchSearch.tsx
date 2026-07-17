import type { FormEvent, ReactNode } from "react";

type WorkbenchSearchProps = {
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  resultCount?: number;
};

export default function WorkbenchSearch({ onSubmit, children, resultCount }: WorkbenchSearchProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        {children}
        <button
          type="submit"
          className="h-9 rounded-xl border border-border bg-foreground px-4 text-sm font-semibold text-background hover:bg-foreground/90 transition-colors"
        >
          Search
        </button>
      </form>
      {resultCount !== undefined && (
        <div className="text-sm font-medium text-muted-foreground">
          {resultCount} {resultCount === 1 ? "record" : "records"}
        </div>
      )}
    </div>
  );
}
