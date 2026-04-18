export default function ProductDetailLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <div className="h-5 w-40 animate-pulse rounded-full bg-slate-200/80" />
      <section className="grid gap-6 rounded-[2.5rem] border border-white/75 bg-white/70 p-6 lg:grid-cols-2 lg:p-8">
        <div className="aspect-[5/4] animate-pulse rounded-[2rem] bg-slate-200/80" />
        <div className="space-y-4">
          <div className="h-5 w-44 animate-pulse rounded-full bg-slate-200/80" />
          <div className="h-12 w-3/4 animate-pulse rounded-2xl bg-slate-200/80" />
          <div className="h-24 animate-pulse rounded-[1.6rem] bg-slate-200/80" />
          <div className="h-56 animate-pulse rounded-[1.8rem] bg-slate-200/80" />
        </div>
      </section>
    </div>
  );
}

