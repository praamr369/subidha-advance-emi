import { Fragment, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type PolicyMarkdownProps = {
  content: string;
  className?: string;
};

function isOrderedListItem(line: string): boolean {
  return /^\d+\.\s+/.test(line.trim());
}

function isBulletListItem(line: string): boolean {
  return /^[-*]\s+/.test(line.trim());
}

export default function PolicyMarkdown({ content, className }: PolicyMarkdownProps) {
  const lines = (content || "").split("\n");
  const blocks: ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed.startsWith("### ")) {
      blocks.push(
        <h3 key={`h3-${i}`} className="mt-6 text-lg font-semibold text-foreground">
          {trimmed.slice(4)}
        </h3>
      );
      i += 1;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      blocks.push(
        <h2 key={`h2-${i}`} className="mt-7 text-xl font-semibold text-foreground sm:text-2xl">
          {trimmed.slice(3)}
        </h2>
      );
      i += 1;
      continue;
    }

    if (trimmed.startsWith("# ")) {
      blocks.push(
        <h1 key={`h1-${i}`} className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">
          {trimmed.slice(2)}
        </h1>
      );
      i += 1;
      continue;
    }

    if (isBulletListItem(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && isBulletListItem(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="ml-5 mt-3 list-disc space-y-1.5 text-sm leading-7 text-muted-foreground sm:text-base">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (isOrderedListItem(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && isOrderedListItem(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ol key={`ol-${i}`} className="ml-5 mt-3 list-decimal space-y-1.5 text-sm leading-7 text-muted-foreground sm:text-base">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraphLines: string[] = [trimmed];
    i += 1;
    while (i < lines.length) {
      const candidate = lines[i].trim();
      if (!candidate) break;
      if (
        candidate.startsWith("# ") ||
        candidate.startsWith("## ") ||
        candidate.startsWith("### ") ||
        isBulletListItem(candidate) ||
        isOrderedListItem(candidate)
      ) {
        break;
      }
      paragraphLines.push(candidate);
      i += 1;
    }

    blocks.push(
      <p key={`p-${i}`} className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
        {paragraphLines.join(" ")}
      </p>
    );
  }

  return (
    <div className={cn("max-w-none", className)}>
      {blocks.map((block, index) => (
        <Fragment key={`block-${index}`}>{block}</Fragment>
      ))}
    </div>
  );
}
