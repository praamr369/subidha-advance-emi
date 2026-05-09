"use client";

import Link from "next/link";

type RelatedLink = { label: string; href: string };

type Props = {
  title: string;
  context?: string;
  state: string;
  blockers?: string[];
  nextActions?: string[];
  relatedLinks?: RelatedLink[];
};

export default function OperationalNextStepsPanel({
  title,
  context,
  state,
  blockers = [],
  nextActions = [],
  relatedLinks = [],
}: Props) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {context ? <p className="mt-1 text-xs text-muted-foreground">{context}</p> : null}
      <div className="mt-3 grid gap-2 text-sm">
        <p>
          <span className="font-medium text-foreground">Current state:</span> {state || "UNKNOWN"}
        </p>
        <p>
          <span className="font-medium text-foreground">Next best action:</span>{" "}
          {nextActions.length ? nextActions[0] : "Review details"}
        </p>
      </div>
      {blockers.length ? (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-medium">Blocked because</p>
          <ul className="mt-1 list-disc pl-4">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {nextActions.length > 1 ? (
        <div className="mt-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Secondary actions:</span> {nextActions.slice(1).join(", ")}
        </div>
      ) : null}
      {relatedLinks.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {relatedLinks.map((link) => (
            <Link
              key={`${link.label}-${link.href}`}
              href={link.href}
              className="inline-flex h-8 items-center rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
