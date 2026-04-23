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

