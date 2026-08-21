"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import ErrorState from "@/components/feedback/ErrorState";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const isProduction = process.env.NODE_ENV === "production";
  const supportRef = error.digest ? `Ref: ${error.digest}` : null;

  useEffect(() => {
    console.error("Admin section error", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-4xl p-6">
      <ErrorState
        title="Something went wrong"
        description={
          isProduction
            ? `An error occurred in the admin section. Please retry or return to the dashboard.${supportRef ? ` (${supportRef})` : ""}`
            : error.message || "Unknown admin error"
        }
        onRetry={reset}
      />
      <div className="mt-4 text-center">
        <button
          onClick={() => router.push("/admin")}
          className="text-sm text-muted-foreground underline hover:text-foreground"
        >
          Go to Dashboard
        </button>
      </div>
    </main>
  );
}
