// frontend/src/app/loading.tsx
import { Loader2 } from "lucide-react";

export default function GlobalLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/20">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card/80 p-8 shadow-xl backdrop-blur-sm">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl" />
          <Loader2 className="relative h-12 w-12 animate-spin text-primary" />
        </div>
        <div className="space-y-2 text-center">
          <h2 className="text-lg font-semibold text-foreground">Loading</h2>
          <p className="text-sm text-muted-foreground">Please wait while we prepare your dashboard...</p>
        </div>
        <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/2 animate-[pulse_1s_ease-in-out_infinite] rounded-full bg-primary" />
        </div>
      </div>
    </div>
  );
}