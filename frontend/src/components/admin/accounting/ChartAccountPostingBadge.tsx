type ChartAccountPostingBadgeProps = {
  isPosting?: boolean | null;
};

export default function ChartAccountPostingBadge({ isPosting }: ChartAccountPostingBadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
        isPosting
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-amber-200 bg-amber-50 text-amber-800",
      ].join(" ")}
    >
      {isPosting ? "Posting COA" : "Group/control COA"}
    </span>
  );
}
