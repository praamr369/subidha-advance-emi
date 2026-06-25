import { AlertTriangle } from "lucide-react";

type PublicDisclaimerBoxProps = {
  title?: string;
  points: readonly string[];
};

export default function PublicDisclaimerBox({
  title = "Important public disclaimer",
  points,
}: PublicDisclaimerBoxProps) {
  return (
    <section className="rounded-xl border border-amber-200/70 bg-amber-50/70 p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-amber-300/80 bg-amber-100 text-amber-700">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-900">{title}</h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-amber-900/90">
            {points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
