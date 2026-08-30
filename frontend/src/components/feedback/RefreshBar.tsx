"use client";

/**
 * Thin animated progress bar shown at the top of a list while a background
 * refresh is in progress. The table stays visible — no scroll reset, no flash.
 */
export default function RefreshBar({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      className="h-0.5 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label="Refreshing…"
    >
      <div className="h-full w-1/3 animate-[slide_1.2s_ease-in-out_infinite] bg-primary" />
      <style>{`
        @keyframes slide {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}
