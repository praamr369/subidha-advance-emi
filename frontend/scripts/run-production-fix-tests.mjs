import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";

// Node-based unit tests for the SUBIDHA CORE production-fix bundle
// (EMI installment labelling + inventory adjustment readiness display logic).
// Mirrors scripts/run-dashboard-widget-board-tests.mjs.

const cwd = process.cwd();
const outDir = join(cwd, ".tmp-production-fix-tests");

function run(label, command, args) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });

  if (result.signal) {
    console.error(`[production-fix-tests] ${label} failed via signal ${result.signal}`);
    process.exit(1);
  }

  if ((result.status ?? 1) !== 0) {
    console.error(
      `[production-fix-tests] ${label} failed with exit code ${result.status ?? 1}`
    );
    process.exit(result.status ?? 1);
  }
}

rmSync(outDir, { recursive: true, force: true });

run("tsc emit", process.execPath, [
  "./node_modules/typescript/bin/tsc",
  "-p",
  "tsconfig.production-fix-tests.json",
  "--pretty",
  "false",
]);

run("node test", process.execPath, [
  "--test",
  "./.tmp-production-fix-tests/tests/unit/emi-installment.test.js",
  "./.tmp-production-fix-tests/tests/unit/inventory-adjustment.test.js",
  "./.tmp-production-fix-tests/tests/unit/production-fix-page-wiring.test.js",
]);

rmSync(outDir, { recursive: true, force: true });
console.log("[production-fix-tests] passed with exit code 0");
