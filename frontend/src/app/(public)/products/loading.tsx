export default function ProductsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <section className="h-72 animate-pulse rounded-[2.5rem] border border-white/75 bg-white/70" />
      <section className="h-40 animate-pulse rounded-[2rem] border border-white/75 bg-white/70" />
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-[26rem] animate-pulse rounded-[2rem] border border-white/75 bg-white/70"
          />
        ))}
      </div>
    </div>
  );
}

