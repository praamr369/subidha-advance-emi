#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const FRONTEND_ROOT = process.cwd();
const REPO_ROOT = path.resolve(FRONTEND_ROOT, "..");
const BACKEND_META_PATH = path.resolve(REPO_ROOT, "backend/playwright-smoke-meta.json");
const AUTH_DIR = path.resolve(FRONTEND_ROOT, "tests/e2e/.auth");

function run(cmd) {
  try {
    execSync(cmd, { stdio: "pipe", cwd: FRONTEND_ROOT, encoding: "utf8" });
    return { ok: true, output: "" };
  } catch (error) {
    return {
      ok: false,
      output: String(error?.stdout || "") + String(error?.stderr || ""),
    };
  }
}

function checkTracked(pattern) {
  const result = run(`git ls-files "${pattern}"`);
  if (!result.ok) return [];
  return result.output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const findings = [];

const browserProbe = run("npx playwright install --dry-run chromium");
if (!browserProbe.ok) {
  findings.push(
    "Playwright chromium is not installed in this environment. Run: npx playwright install chromium"
  );
}

if (!existsSync(BACKEND_META_PATH)) {
  findings.push(
    "Smoke metadata is currently missing (expected before setup). This is OK; setup will generate backend/playwright-smoke-meta.json."
  );
}

const vendorStatePath = path.join(AUTH_DIR, "vendor.json");
if (!existsSync(vendorStatePath)) {
  findings.push(
    "Vendor auth-state is missing. Vendor-only suites should skip explicitly; generate state only when testing vendor flows."
  );
}

const trackedSensitive = [
  ...checkTracked("frontend/tests/e2e/.auth/*.json"),
  ...checkTracked("frontend/tests/e2e/.generated/*.json"),
  ...checkTracked("playwright-report/**"),
  ...checkTracked("test-results/**"),
];
if (trackedSensitive.length > 0) {
  findings.push(
    `Sensitive/generated Playwright artifacts are tracked: ${trackedSensitive.join(", ")}`
  );
}

if (findings.length === 0) {
  console.log("[playwright-check] OK");
  process.exit(0);
}

console.log("[playwright-check] findings:");
for (const finding of findings) {
  console.log(`- ${finding}`);
}

if (
  findings.some((entry) => entry.includes("not installed")) ||
  findings.some((entry) => entry.includes("tracked:"))
) {
  process.exit(1);
}

process.exit(0);
