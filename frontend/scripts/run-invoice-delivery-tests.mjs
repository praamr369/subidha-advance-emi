import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";

// Node-based unit tests for the billing invoice -> delivery rail UI wiring
// (InvoiceDeliveryCell + InvoiceDeliveryPanel + billing service helpers).
// Source-assertion style, mirrors scripts/run-kyc-frontend-tests.mjs.

const cwd = process.cwd();
const outDir = join(cwd, ".tmp-invoice-delivery-tests");

function run(label, command, args) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });

  if (result.signal) {
    console.error(`[invoice-delivery-tests] ${label} failed via signal ${result.signal}`);
    process.exit(1);
  }

  if ((result.status ?? 1) !== 0) {
    console.error(`[invoice-delivery-tests] ${label} failed with exit code ${result.status ?? 1}`);
    process.exit(result.status ?? 1);
  }
}

rmSync(outDir, { recursive: true, force: true });

run("tsc emit", process.execPath, [
  "./node_modules/typescript/bin/tsc",
  "-p",
  "tsconfig.invoice-delivery-tests.json",
  "--pretty",
  "false",
]);

run("node test", process.execPath, [
  "--test",
  "./.tmp-invoice-delivery-tests/tests/unit/billing-invoice-delivery-ui.test.js",
]);

rmSync(outDir, { recursive: true, force: true });
console.log("[invoice-delivery-tests] passed with exit code 0");
