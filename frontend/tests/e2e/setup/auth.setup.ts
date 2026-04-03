import { execFileSync } from "node:child_process";

import {
  test,
  expect,
  type BrowserContext,
} from "@playwright/test";
import {
  FRONTEND_BASE_URL,
  authStatePath,
  ensureSmokeDirectories,
  resolvePythonExecutable,
  writeSmokeManifest,
  type RoleKey,
  type RoleCredentials,
  type SmokeManifest,
} from "../helpers/smoke-data";

const djangoEnv = {
  ...process.env,
  DJANGO_SETTINGS_MODULE: "core.settings.playwright",
};

const ACCESS_TOKEN_KEY = "subidha_access_token";
const REFRESH_TOKEN_KEY = "subidha_refresh_token";
const SESSION_KEY = "subidha_session";
const PYTHON_EXECUTABLE = resolvePythonExecutable();

test("seed deterministic smoke data and capture role sessions", async ({
  browser,
}) => {
  ensureSmokeDirectories();

  execFileSync(
    PYTHON_EXECUTABLE,
    ["../backend/manage.py", "migrate", "--noinput"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: djangoEnv,
    }
  );

  let raw: string;
  try {
    raw = execFileSync(
      PYTHON_EXECUTABLE,
      ["../backend/manage.py", "seed_playwright_smoke", "--json"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: djangoEnv,
      }
    );
  } catch (error) {
    throw new Error(
      "seed_playwright_smoke failed while preparing the Playwright SQLite dataset.",
      { cause: error }
    );
  }

  const manifest = JSON.parse(raw) as SmokeManifest;
  writeSmokeManifest(manifest);

  const roles: RoleKey[] = ["admin", "cashier", "customer", "partner"];

  for (const role of roles) {
    const context = await browser.newContext();
    await installRoleSession(context, manifest.credentials[role]);
    const page = await context.newPage();

    await page.goto(manifest.credentials[role].dashboard);
    await expect(page).toHaveURL(
      new RegExp(`${manifest.credentials[role].dashboard.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\?.*)?$`)
    );
    await context.storageState({ path: authStatePath(role) });
    await context.close();
  }
});

async function installRoleSession(
  context: BrowserContext,
  credentials: RoleCredentials
): Promise<void> {
  const session = {
    id: credentials.user_id,
    name: credentials.name,
    role: credentials.role,
    accessToken: credentials.access_token,
    refreshToken: credentials.refresh_token,
  };

  await context.addCookies([
    {
      name: "subidha_role",
      value: String(credentials.role).toUpperCase(),
      url: FRONTEND_BASE_URL,
    },
    {
      name: "subidha_auth",
      value: "1",
      url: FRONTEND_BASE_URL,
    },
  ]);

  const page = await context.newPage();
  await page.goto("/login");
  await page.evaluate(
    ({ session, accessTokenKey, refreshTokenKey, sessionKey }) => {
      window.localStorage.setItem(accessTokenKey, session.accessToken);
      window.localStorage.setItem(refreshTokenKey, session.refreshToken);
      window.localStorage.setItem(sessionKey, JSON.stringify(session));
    },
    {
      session,
      accessTokenKey: ACCESS_TOKEN_KEY,
      refreshTokenKey: REFRESH_TOKEN_KEY,
      sessionKey: SESSION_KEY,
    }
  );
  await page.close();
}
