import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";

// Node-based unit tests for the unified KYC frontend UI wiring
// (KycDocumentPanel + admin/self page integration). Source-assertion style,
// mirrors scripts/run-production-fix-tests.mjs.

const cwd = process.cwd();
const outDir = join(cwd, ".tmp-kyc-tests");

function run(label, command, args) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });

  if (result.signal) {
    console.error(`[kyc-frontend-tests] ${label} failed via signal ${result.signal}`);
    process.exit(1);
  }

  if ((result.status ?? 1) !== 0) {
    console.error(`[kyc-frontend-tests] ${label} failed with exit code ${result.status ?? 1}`);
    process.exit(result.status ?? 1);
  }
}

rmSync(outDir, { recursive: true, force: true });

run("tsc emit", process.execPath, [
  "./node_modules/typescript/bin/tsc",
  "-p",
  "tsconfig.kyc-tests.json",
  "--pretty",
  "false",
]);

run("node test", process.execPath, [
  "--test",
  "./.tmp-kyc-tests/tests/unit/kyc-frontend-ui.test.js",
]);

rmSync(outDir, { recursive: true, force: true });
console.log("[kyc-frontend-tests] passed with exit code 0");
