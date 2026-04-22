import fs from "node:fs";
import path from "node:path";

export type SmokeRole = "admin" | "cashier" | "partner" | "customer";
export type RealLoginRole = "admin" | "cashier";

export type SmokeMeta = {
  roles: Record<
    SmokeRole,
    {
      id: number;
      name: string;
      role: string;
      dashboard_path: string;
    }
  >;
  real_login: {
    secret: string;
    invalid_secret: string;
    roles: Record<
      RealLoginRole,
      {
        username: string;
        dashboard_path: string;
      }
    >;
  };
  entities: {
    admin_collection: {
      subscription_id: number;
      emi_id: number;
      customer_name: string;
    };
    cashier_collection: {
      subscription_id: number;
      emi_id: number;
      customer_phone: string;
      customer_name: string;
    };
    preseed_payment: {
      payment_id: number;
      reference_no: string;
      subscription_id: number;
      customer_name: string;
    };
    batch_create: {
      status: string;
      total_slots: number;
      duration_months: number;
      draw_day: number;
    };
  };
};

const SMOKE_META_PATH = process.env.PLAYWRIGHT_SMOKE_META_PATH
  ? path.resolve(process.cwd(), process.env.PLAYWRIGHT_SMOKE_META_PATH)
  : path.resolve(process.cwd(), "../backend/playwright-smoke-meta.json");

export const AUTH_STATE_DIR = path.resolve(process.cwd(), "tests/e2e/.auth");

let cachedMeta: SmokeMeta | null = null;

export function roleStorageStatePath(role: SmokeRole): string {
  return path.join(AUTH_STATE_DIR, `${role}.json`);
}

export function readSmokeMeta(): SmokeMeta {
  if (cachedMeta) return cachedMeta;

  if (!fs.existsSync(SMOKE_META_PATH)) {
    throw new Error(
      `Smoke metadata file not found at ${SMOKE_META_PATH}. Ensure the Playwright backend seed command has run.`
    );
  }

  const raw = fs.readFileSync(SMOKE_META_PATH, "utf-8");
  cachedMeta = JSON.parse(raw) as SmokeMeta;
  return cachedMeta;
}
