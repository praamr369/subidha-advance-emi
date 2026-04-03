import fs from "node:fs";
import path from "node:path";

export type RoleKey = "admin" | "cashier" | "customer" | "partner";

export type RoleCredentials = {
  user_id: number;
  name: string;
  username: string;
  password: string;
  role: string;
  dashboard: string;
  access_token: string;
  refresh_token: string;
};

export type SmokeManifest = {
  credentials: Record<RoleKey, RoleCredentials>;
  entities: {
    admin: {
      customer_id: number;
      customer_name: string;
      subscription_id: number;
      subscription_number: string;
      pending_emi_id: number;
      search_query: string;
      product_id: number;
    };
    cashier: {
      customer_id: number;
      customer_name: string;
      customer_phone: string;
      subscription_id: number;
      subscription_number: string;
      lucky_number: number;
      collectible_emi_id: number;
      history_payment_id: number;
    };
    customer: {
      subscription_id: number;
      subscription_number: string;
      own_payment_id: number;
      other_payment_id: number;
    };
    partner: {
      customer_id: number;
      subscription_id: number;
      subscription_number: string;
      collection_request_id: number;
    };
    public: {
      product_id: number;
      product_name: string;
      winner_draw_id: number;
    };
  };
};

export const FRONTEND_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";
export const API_BASE_URL =
  process.env.PLAYWRIGHT_API_URL || "http://127.0.0.1:8100/api/v1";
export const FRONTEND_HOST = new URL(FRONTEND_BASE_URL).hostname;

const E2E_ROOT = path.resolve(__dirname, "..");
export const AUTH_DIR = path.join(E2E_ROOT, ".auth");
export const GENERATED_DIR = path.join(E2E_ROOT, ".generated");
export const MANIFEST_PATH = path.join(GENERATED_DIR, "smoke-manifest.json");

export function ensureSmokeDirectories(): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
}

export function authStatePath(role: RoleKey): string {
  ensureSmokeDirectories();
  return path.join(AUTH_DIR, `${role}.json`);
}

export function readSmokeManifest(): SmokeManifest {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(
      `Missing Playwright smoke manifest at ${MANIFEST_PATH}. Run the setup project first.`
    );
  }

  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as SmokeManifest;
}

export function writeSmokeManifest(manifest: SmokeManifest): void {
  ensureSmokeDirectories();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function resolvePythonExecutable(): string {
  const envConfigured =
    process.env.PLAYWRIGHT_PYTHON || process.env.PYTHON_BIN || "";

  if (envConfigured.trim()) {
    return envConfigured;
  }

  const candidates = [
    path.resolve(E2E_ROOT, "../../.venv/bin/python"),
    path.resolve(E2E_ROOT, "../../backend/.venv/bin/python"),
    path.resolve(E2E_ROOT, "../../../.venv/bin/python"),
    "/home/subidha-furniture/subidha-lucky-plan/.venv/bin/python",
  ];

  const localMatch = candidates.find((candidate) => fs.existsSync(candidate));
  return localMatch || "python3";
}
