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
  const isProduction = process.env.NODE_ENV === "production";
  const supportRef = error.digest ? `Ref: ${error.digest}` : null;

  useEffect(() => {
    console.error("Unhandled application error", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-4xl p-6">
      <ErrorState
        title="Unexpected application error"
        description={
          isProduction
            ? `Something went wrong. Please retry.${supportRef ? ` (${supportRef})` : ""}`
            : error.message || "Unknown application failure"
        }
        onRetry={reset}
      />
    </main>
  );
}
