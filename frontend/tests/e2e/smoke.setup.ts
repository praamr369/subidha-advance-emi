import fs from "node:fs";

import { expect, test } from "@playwright/test";

import {
  AUTH_STATE_DIR,
  readSmokeMeta,
  roleStorageStatePath,
  type SmokeRole,
} from "./helpers/smoke-meta";

const frontendOrigin = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";
const roles: SmokeRole[] = ["admin", "cashier", "partner", "customer"];

function buildState(meta: ReturnType<typeof readSmokeMeta>, role: SmokeRole) {
  const info = meta.roles[role];
  const session = {
    id: info.id,
    name: info.name,
    role: info.role,
    accessToken: `PLAYWRIGHT_ROLE:${info.role}`,
    refreshToken: `PLAYWRIGHT_REFRESH:${info.role}`,
  };

  return {
    cookies: [
      {
        name: "subidha_auth",
        value: "1",
        domain: "127.0.0.1",
        path: "/",
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      },
      {
        name: "subidha_role",
        value: info.role,
        domain: "127.0.0.1",
        path: "/",
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      },
    ],
    origins: [
      {
        origin: frontendOrigin,
        localStorage: [
          { name: "subidha_session", value: JSON.stringify(session) },
          { name: "subidha_access_token", value: session.accessToken },
          { name: "subidha_refresh_token", value: session.refreshToken },
        ],
      },
    ],
  };
}

test("seeded smoke state is ready", async () => {
  test.slow();
  fs.mkdirSync(AUTH_STATE_DIR, { recursive: true });
  const meta = readSmokeMeta();

  for (const role of roles) {
    const state = buildState(meta, role);
    fs.writeFileSync(
      roleStorageStatePath(role),
      JSON.stringify(state, null, 2),
      "utf-8"
    );
    expect(fs.existsSync(roleStorageStatePath(role))).toBeTruthy();
  }
});
