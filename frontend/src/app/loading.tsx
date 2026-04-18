import { LoadingSkeleton } from "@/components/ui/portal-primitives";

export default function GlobalLoading() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-10">
      <LoadingSkeleton label="Preparing workspace..." rows={5} className="surface-panel-elevated w-full rounded-3xl p-8" />
    </div>
  );
}
