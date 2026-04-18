"use client";

import ErrorState from "@/components/feedback/ErrorState";

export default function ProductsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-12 sm:px-6 lg:px-8">
      <section className="w-full rounded-[2rem] border border-white/75 bg-white/85 p-6 shadow-[0_26px_72px_-54px_rgba(15,23,42,0.74)]">
        <ErrorState
          title="Unable to load the public catalogue"
          description={error.message || "Please retry the request."}
          onRetry={reset}
        />
      </section>
    </div>
  );
}

