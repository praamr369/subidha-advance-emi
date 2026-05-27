type FinanceAccountReadinessBadgeProps = {
  ready?: boolean | null;
  blocker?: string | null;
};

export default function FinanceAccountReadinessBadge({
  ready,
  blocker,
}: FinanceAccountReadinessBadgeProps) {
  if (ready) {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
        Posting ready
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800"
      title={blocker || "Finance account is not posting-ready."}
    >
      Blocked
    </span>
  );
}
