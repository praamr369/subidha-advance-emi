import { FormSkeleton } from "@/components/feedback/Skeleton";

export default function AuthLoading() {
  return (
    <div className="mx-auto w-full max-w-xl py-6">
      <FormSkeleton fields={4} className="surface-panel-elevated" />
    </div>
  );
}
