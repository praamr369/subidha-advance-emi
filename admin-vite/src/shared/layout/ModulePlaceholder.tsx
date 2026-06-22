import { Construction } from "lucide-react";
import { PageHeader } from "@/shared/ui/PageHeader";

type Props = {
  title: string;
  description?: string;
};

export function ModulePlaceholder({ title, description }: Props) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 bg-white py-20">
        <Construction size={48} className="mb-4 text-stone-300" />
        <h3 className="text-lg font-medium text-stone-500">
          Module Under Construction
        </h3>
        <p className="mt-1 text-sm text-stone-400">
          {title} will be available after migration.
        </p>
      </div>
    </div>
  );
}
