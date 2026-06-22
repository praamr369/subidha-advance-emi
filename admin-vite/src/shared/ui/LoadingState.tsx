import { Loader2 } from "lucide-react";

type Props = {
  message?: string;
};

export function LoadingState({ message = "Loading..." }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Loader2 size={32} className="mb-3 animate-spin text-brand-500" />
      <span className="text-sm text-stone-500">{message}</span>
    </div>
  );
}
