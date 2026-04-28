import type { Page } from "@playwright/test";

const DASHBOARD_STORAGE_PREFIXES = [
  "subidha:dashboard-widgets:admin:",
  "subidha:admin-dashboard-widgets:",
  "subidha:dashboard-sidebar-collapsed:",
];

const DASHBOARD_STORAGE_KEYS = [
  "subidha:dashboard-sidebar-collapsed:v1",
  "subidha:dashboard-sidebar-groups:v1",
  "subidha:operator-mode:v1",
];

export async function resetAdminDashboardClientState(page: Page): Promise<void> {
  await page.addInitScript(
    ({ prefixes, keys }) => {
      try {
        const localKeys: string[] = [];
        for (let index = 0; index < window.localStorage.length; index += 1) {
          const key = window.localStorage.key(index);
          if (key) localKeys.push(key);
        }

        for (const key of localKeys) {
          if (keys.includes(key) || prefixes.some((prefix) => key.startsWith(prefix))) {
            window.localStorage.removeItem(key);
          }
        }
      } catch {
        // Ignore client storage limitations for smoke runs.
      }
    },
    {
      prefixes: DASHBOARD_STORAGE_PREFIXES,
      keys: DASHBOARD_STORAGE_KEYS,
    }
  );
}
