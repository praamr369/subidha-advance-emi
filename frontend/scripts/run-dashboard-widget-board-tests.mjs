import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";

const cwd = process.cwd();
const outDir = join(cwd, ".tmp-dashboard-tests");

function run(label, command, args) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });

  if (result.signal) {
    console.error(`[dashboard-preset-tests] ${label} failed via signal ${result.signal}`);
    process.exit(1);
  }

  if ((result.status ?? 1) !== 0) {
    console.error(
      `[dashboard-preset-tests] ${label} failed with exit code ${result.status ?? 1}`
    );
    process.exit(result.status ?? 1);
  }
}

rmSync(outDir, { recursive: true, force: true });

run("tsc emit", process.execPath, [
  "./node_modules/typescript/bin/tsc",
  "-p",
  "tsconfig.dashboard-tests.json",
  "--pretty",
  "false",
]);

run("node test", process.execPath, [
  "--test",
  "./.tmp-dashboard-tests/tests/unit/dashboard-widget-board.test.js",
  "./.tmp-dashboard-tests/tests/unit/dashboard-preset-catalogs.test.js",
]);

rmSync(outDir, { recursive: true, force: true });
console.log("[dashboard-preset-tests] passed with exit code 0");
