import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const isSmokeBuild = process.argv.includes("--smoke");
const buildDir = fileURLToPath(new URL("../.next", import.meta.url));
if (fs.existsSync(buildDir)) {
  // Preserve .next/cache so CI/local incremental compiler caches survive across builds.
  for (const entry of fs.readdirSync(buildDir)) {
    if (entry === "cache") continue;
    fs.rmSync(path.join(buildDir, entry), { recursive: true, force: true });
  }
}

const nodeOptions = process.env.NODE_OPTIONS || "";
const memoryFlag = nodeOptions.includes("--max-old-space-size") ? "" : "--max-old-space-size=4096";
const childEnv = { ...process.env, NODE_OPTIONS: `${nodeOptions} ${memoryFlag}`.trim() };

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
