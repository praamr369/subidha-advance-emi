"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import ErrorState from "@/components/feedback/ErrorState";

export default function StaffError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("Staff section error", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-4xl p-6">
      <ErrorState
        title="Something went wrong"
        description={
          process.env.NODE_ENV === "production"
            ? "An error occurred. Please retry or return to your dashboard."
            : error.message || "Unknown error"
        }
        onRetry={reset}
      />
      <div className="mt-4 text-center">
        <button
          onClick={() => router.push("/staff")}
          className="text-sm text-muted-foreground underline hover:text-foreground"
        >
          Go to Dashboard
        </button>
      </div>
    </main>
  );
}
