"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import ErrorState from "@/components/feedback/ErrorState";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("Auth error", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-4xl p-6">
      <ErrorState
        title="Authentication error"
        description={
          process.env.NODE_ENV === "production"
            ? "Something went wrong. Please try again."
            : error.message || "Unknown auth error"
        }
        onRetry={reset}
      />
      <div className="mt-4 text-center">
        <button
          onClick={() => router.push("/login")}
          className="text-sm text-muted-foreground underline hover:text-foreground"
        >
          Go to Login
        </button>
      </div>
    </main>
  );
}
