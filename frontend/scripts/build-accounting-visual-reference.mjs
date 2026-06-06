import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(frontendRoot, "..");
const docsDir = path.join(repoRoot, "docs", "accounting");
const screenshotsDir = path.join(docsDir, "screenshots");
const markdownPath = path.join(docsDir, "accounting-finance-setup-visual-reference.md");
const htmlPath = path.join(docsDir, "accounting-finance-setup-visual-reference.html");
const pdfPath = path.join(docsDir, "accounting-finance-setup-visual-reference.pdf");

const screenshots = [
  ["02-accounting-bridge-readiness-summary.png", "Bridge readiness summary"],
  ["03-accounting-bridge-readiness-groups.png", "Grouped bridge readiness rows"],
  ["03a-accounting-bridge-staff-advance-unsupported.png", "Staff advance unsupported source"],
  ["03b-accounting-bridge-approval-gated.png", "Approval-gated bridge rows"],
  ["03c-accounting-bridge-reconciliation-pending.png", "Postable rows with reconciliation pending"],
  ["03d-accounting-bridge-advanced-raw-readiness.png", "Advanced raw readiness"],
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function paragraphize(markdown) {
  const lines = markdown.split(/\r?\n/);
  const out = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("# ")) out.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
    else if (line.startsWith("## ")) out.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    else if (line.startsWith("### ")) out.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    else if (line.startsWith("- ")) out.push(`<li>${escapeHtml(line.slice(2))}</li>`);
    else if (/^\d+\.\s/.test(line)) out.push(`<li>${escapeHtml(line.replace(/^\d+\.\s/, ""))}</li>`);
    else if (line.startsWith("```")) continue;
    else out.push(`<p>${escapeHtml(line)}</p>`);
  }
  return out.join("\n");
}

function imageBlock(fileName, caption) {
  const source = path.join(screenshotsDir, fileName);
  if (!existsSync(source)) {
    return `<section class="missing"><h3>${escapeHtml(caption)}</h3><p>Screenshot missing: ${escapeHtml(fileName)}. Run <code>npm run test:e2e:accounting-visual</code> first.</p></section>`;
  }
  const src = `file://${source}`;
  return `<figure><img src="${src}" alt="${escapeHtml(caption)}" /><figcaption>${escapeHtml(caption)} · ${escapeHtml(fileName)}</figcaption></figure>`;
}

async function main() {
  mkdirSync(docsDir, { recursive: true });
  const markdown = existsSync(markdownPath)
    ? readFileSync(markdownPath, "utf8")
    : "# Accounting Finance Setup Visual Reference\n\nBridge Readiness chapter missing.";

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Subidha Core Accounting Finance Setup Visual Reference</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1f2937; margin: 40px; line-height: 1.5; }
    h1 { color: #3b2416; font-size: 28px; margin-bottom: 8px; }
    h2 { color: #4b2e1f; border-top: 1px solid #e5e7eb; padding-top: 18px; margin-top: 28px; }
    h3 { color: #5b3826; margin-top: 18px; }
    p, li { font-size: 12px; }
    code { background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 4px; padding: 1px 4px; }
    figure { page-break-inside: avoid; margin: 22px 0; border: 1px solid #e5e7eb; padding: 10px; border-radius: 10px; }
    img { width: 100%; max-height: 720px; object-fit: contain; border: 1px solid #e5e7eb; border-radius: 8px; }
    figcaption { margin-top: 8px; font-size: 11px; color: #6b7280; }
    .notice { border: 1px solid #f59e0b; background: #fffbeb; padding: 12px; border-radius: 10px; margin: 12px 0; }
    .missing { border: 1px solid #ef4444; background: #fef2f2; padding: 12px; border-radius: 10px; margin: 12px 0; }
  </style>
</head>
<body>
  <h1>Subidha Core Accounting Finance Setup Visual Reference</h1>
  <div class="notice">This PDF is generated from the Markdown guide and Playwright screenshots. Bridge readiness remains read-only: no posting, reconciliation, mapping mutation, or document numbering allocation happens here.</div>
  ${paragraphize(markdown)}
  <h2>Bridge Readiness Screenshots</h2>
  ${screenshots.map(([fileName, caption]) => imageBlock(fileName, caption)).join("\n")}
</body>
</html>`;

  writeFileSync(htmlPath, html, "utf8");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  await page.goto(`file://${htmlPath}`, { waitUntil: "load" });
  await page.pdf({ path: pdfPath, format: "A4", printBackground: true, margin: { top: "14mm", right: "12mm", bottom: "14mm", left: "12mm" } });
  await browser.close();
  console.log(`Generated ${path.relative(repoRoot, htmlPath)}`);
  console.log(`Generated ${path.relative(repoRoot, pdfPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
