import { expect, type Page } from "@playwright/test";

type RuntimeIssue = {
  kind: "console.error" | "pageerror";
  message: string;
  url: string;
};

export function attachRuntimeGuard(page: Page): {
  assertClean: () => Promise<void>;
} {
  const issues: RuntimeIssue[] = [];

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    issues.push({
      kind: "console.error",
      message: message.text(),
      url: page.url(),
    });
  });

  page.on("pageerror", (error) => {
    issues.push({
      kind: "pageerror",
      message: error.message,
      url: page.url(),
    });
  });

  return {
    async assertClean() {
      const hydrationOrMarkupIssues = issues.filter((issue) =>
        /hydration|did not match|markup|react error #418|rendered more hooks/i.test(
          issue.message
        )
      );
      const report = issues
        .map((issue) => `[${issue.kind}] ${issue.message} @ ${issue.url}`)
        .join("\n");

      await expect(
        issues,
        `Runtime guard captured console/page errors:\n${report}`
      ).toEqual([]);
      await expect(
        hydrationOrMarkupIssues,
        `Hydration/markup errors were captured:\n${report}`
      ).toEqual([]);
    },
  };
}

// Signatures of a genuine page CRASH (uncaught exception, React render error,
// hydration mismatch), as opposed to expected network noise (a failed fetch for
// an entity absent from the seed DB logs console.error but the page still
// renders). The bulk route-load sweep fails only on these.
const CRASH_SIGNATURE =
  /hydration|did not match|minified react error|react error #(?:418|423|425|310|300)|rendered (?:more|fewer) hooks|cannot read (?:property|properties) of (?:undefined|null)|is not a function|is not defined|maximum update depth exceeded|objects are not valid as a react child/i;

export type BulkRuntimeIssue = { kind: string; message: string; url: string };

/**
 * A crash-only guard for sweeping many routes. Every `pageerror` (an uncaught
 * exception / render crash) is a failure; `console.error` is a failure only when
 * it matches a crash signature — otherwise it is collected as a soft warning so
 * expected 4xx/network logs on a sparse seed DB don't drown the signal.
 */
export function attachBulkRuntimeGuard(page: Page): {
  crashes: () => BulkRuntimeIssue[];
  warnings: () => BulkRuntimeIssue[];
} {
  const crashes: BulkRuntimeIssue[] = [];
  const warnings: BulkRuntimeIssue[] = [];

  page.on("pageerror", (error) => {
    crashes.push({ kind: "pageerror", message: error.message, url: page.url() });
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const issue = { kind: "console.error", message: message.text(), url: page.url() };
    if (CRASH_SIGNATURE.test(issue.message)) crashes.push(issue);
    else warnings.push(issue);
  });

  return { crashes: () => crashes, warnings: () => warnings };
}

