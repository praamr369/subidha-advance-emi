type EmptyStateProps = {
  title?: string;
  description?: string;
};

export default function EmptyState({
  title = "No data",
  description,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/40 px-6 py-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-xl text-xs text-muted-foreground sm:text-sm">
          {description}
        </p>
      ) : null}
    </div>
  );
}
