export default function VendorLoading() {
  return (
    <div className="min-h-screen bg-background p-6 space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 rounded-lg bg-muted" />
        <div className="flex gap-2">
          <div className="h-9 w-9 rounded-lg bg-muted" />
          <div className="h-9 w-9 rounded-lg bg-muted" />
        </div>
      </div>
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-7 w-16 rounded bg-muted" />
          </div>
        ))}
      </div>
      {/* Outstanding strip */}
      <div className="h-16 rounded-xl bg-muted" />
      {/* Products grid */}
      <div className="h-5 w-32 rounded bg-muted" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="h-36 bg-muted" />
            <div className="p-3 space-y-1">
              <div className="h-4 w-full rounded bg-muted" />
              <div className="h-3 w-20 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
      {/* PO table */}
      <div className="rounded-xl border border-border">
        <div className="h-12 border-b border-border bg-muted/40 rounded-t-xl" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-4 p-3 border-b border-border last:border-0">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="h-4 w-20 rounded bg-muted ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
