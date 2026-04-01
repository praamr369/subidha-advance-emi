"use client";

import { useEffect } from "react";

import ErrorState from "@/components/feedback/ErrorState";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled dashboard error", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-4xl p-6">
      <ErrorState
        title="Unexpected application error"
        description={error.message || "Unknown application failure"}
        onRetry={reset}
      />
    </main>
  );
}
