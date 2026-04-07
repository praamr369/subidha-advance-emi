"use client";

import ErrorState from "@/components/feedback/ErrorState";
import PublicFooter from "@/components/ui/public-footer";
import PublicNav from "@/components/ui/public-nav";

export default function ProductDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)]">
      <PublicNav />
      <main className="mx-auto flex w-full max-w-[1320px] flex-1 px-4 py-12 sm:px-6 lg:px-8">
        <section className="w-full rounded-[2rem] border border-white/75 bg-white/85 p-6 shadow-[0_26px_72px_-54px_rgba(15,23,42,0.74)]">
          <ErrorState
            title="Unable to load this product"
            description={error.message || "Please retry the request."}
            onRetry={reset}
          />
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
