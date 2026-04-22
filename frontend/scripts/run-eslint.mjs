import { spawn } from "node:child_process";

const lintTargets = [
  "src",
  "tests",
  "scripts",
  "playwright.config.ts",
  "eslint.config.mjs",
  "next.config.ts",
];

const child = spawn(
  process.execPath,
  [
    "./node_modules/eslint/bin/eslint.js",
    "--max-warnings=0",
    ...lintTargets,
  ],
  {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[lint] failed via signal ${signal}`);
    process.exit(1);
  }

  if (code === 0) {
    console.log("[lint] passed with exit code 0");
    process.exit(0);
  }

  console.error(`[lint] failed with exit code ${code ?? 1}`);
  process.exit(code ?? 1);
});

