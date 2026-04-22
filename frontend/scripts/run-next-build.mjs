import fs from "node:fs";
import { spawnSync } from "node:child_process";

const isSmokeBuild = process.argv.includes("--smoke");
const buildDir = new URL("../.next", import.meta.url);
fs.rmSync(buildDir, { recursive: true, force: true });

const childEnv = { ...process.env };

if (isSmokeBuild && !childEnv.NEXT_PUBLIC_API_BASE_URL) {
  childEnv.NEXT_PUBLIC_API_BASE_URL =
    childEnv.PLAYWRIGHT_API_URL || "http://127.0.0.1:8100/api/v1";
  console.log(
    `[build] smoke API base URL ${childEnv.NEXT_PUBLIC_API_BASE_URL}`
  );
}

const result = spawnSync(
  process.execPath,
  ["./node_modules/next/dist/bin/next", "build", "--webpack"],
  {
    cwd: process.cwd(),
    stdio: "inherit",
    env: childEnv,
  }
);

if (result.signal) {
  console.error(`[build] failed via signal ${result.signal}`);
  process.exit(1);
}

if ((result.status ?? 1) !== 0) {
  console.error(`[build] failed with exit code ${result.status ?? 1}`);
  process.exit(result.status ?? 1);
}

console.log("[build] passed with exit code 0");
