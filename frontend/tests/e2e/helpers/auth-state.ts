import fs from "node:fs";
import path from "node:path";

import { AUTH_DIR, authStatePath, type RoleKey } from "./smoke-data";

export function hasStorageState(role: RoleKey | "vendor"): boolean {
  const statePath = role === "vendor" ? path.join(AUTH_DIR, "vendor.json") : authStatePath(role);
  return fs.existsSync(statePath);
}
