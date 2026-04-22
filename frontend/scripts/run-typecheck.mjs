import { spawnSync } from "node:child_process";

function runStep(label, command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });

  if (result.signal) {
    console.error(`[typecheck] ${label} failed via signal ${result.signal}`);
    process.exit(1);
  }

  if ((result.status ?? 1) !== 0) {
    console.error(
      `[typecheck] ${label} failed with exit code ${result.status ?? 1}`
    );
    process.exit(result.status ?? 1);
  }
}

runStep("next typegen", process.execPath, ["./node_modules/next/dist/bin/next", "typegen"]);
runStep("app tsconfig", process.execPath, [
  "./node_modules/typescript/bin/tsc",
  "-p",
  "tsconfig.typecheck.json",
  "--pretty",
  "false",
]);
runStep("tools tsconfig", process.execPath, [
  "./node_modules/typescript/bin/tsc",
  "-p",
  "tsconfig.tools.json",
  "--pretty",
  "false",
]);

console.log("[typecheck] passed with exit code 0");
