import LoadingBlock from "@/components/feedback/LoadingBlock";

export default function LoadingState({ label = "Loading workbench..." }: { label?: string }) {
  return <LoadingBlock label={label} />;
}
