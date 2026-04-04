import { API_BASE_URL } from "@/lib/constants";

export type LoginRequest = {
  username: string;
  password: string;
};

export type LoginResponse = {
  access: string;
  refresh: string;
  role?: string;
  user_role?: string;
  user?: {
    id?: number;
    username?: string;
    name?: string;
    role?: string;
  };
};

export type RefreshTokenRequest =
  | string
  | {
      refresh: string;
    }
  | null
  | undefined;

export type RefreshTokenResponse = {
  access: string;
  refresh?: string;
};

export type LogoutResponse = {
  detail: string;
};

export type ForgotPasswordRequest = {
  identifier: string;
};

export type ForgotPasswordResponse = {
  detail: string;
};

export type ResetPasswordRequest = {
  identifier: string;
  otp: string;
  new_password: string;
  confirm_password: string;
};

export type ResetPasswordResponse = {
  detail: string;
};

export type ResendResetOtpRequest = {
  identifier: string;
};

export type ResendResetOtpResponse = {
  detail: string;
};

function buildApiUrl(path: string): string {
  const apiRoot = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
  return `${apiRoot}/api/v1${path}`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    if (typeof payload === "string") {
      throw new Error(payload || "Request failed.");
    }

    if (payload && typeof payload === "object") {
      const record = payload as Record<string, unknown>;

      if (typeof record.detail === "string" && record.detail.trim()) {
        throw new Error(record.detail);
      }

      const firstValue = Object.values(record)[0];
      if (Array.isArray(firstValue) && typeof firstValue[0] === "string") {
        throw new Error(firstValue[0]);
      }
      if (typeof firstValue === "string") {
        throw new Error(firstValue);
      }
    }

    throw new Error("Request failed.");
  }

  return payload as T;
}

export async function loginRequest(
  payload: LoginRequest
): Promise<LoginResponse> {
  const response = await fetch(buildApiUrl("/auth/login/"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseResponse<LoginResponse>(response);
}

export async function refreshTokenRequest(
  payload: RefreshTokenRequest
): Promise<RefreshTokenResponse> {
  const refresh = typeof payload === "string" ? payload : payload?.refresh ?? "";

  const response = await fetch(buildApiUrl("/auth/refresh/"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh }),
  });

  return parseResponse<RefreshTokenResponse>(response);
}

export async function logoutRequest(
  refreshToken?: string | null
): Promise<LogoutResponse> {
  const response = await fetch(buildApiUrl("/auth/logout/"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      refresh: refreshToken || "",
    }),
  });

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as LogoutResponse;
  }

  return { detail: "Logout completed." };
}

export async function requestPasswordReset(
  payload: ForgotPasswordRequest
): Promise<ForgotPasswordResponse> {
  const response = await fetch(buildApiUrl("/auth/forgot-password/"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      identifier: payload.identifier.trim(),
    }),
  });

  return parseResponse<ForgotPasswordResponse>(response);
}

export async function confirmPasswordReset(
  payload: ResetPasswordRequest
): Promise<ResetPasswordResponse> {
  const response = await fetch(buildApiUrl("/auth/reset-password/"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      identifier: payload.identifier.trim(),
      otp: payload.otp.trim(),
      new_password: payload.new_password,
      confirm_password: payload.confirm_password,
    }),
  });

  return parseResponse<ResetPasswordResponse>(response);
}

export async function resendPasswordResetOtp(
  payload: ResendResetOtpRequest
): Promise<ResendResetOtpResponse> {
  const response = await fetch(buildApiUrl("/auth/resend-reset-otp/"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      identifier: payload.identifier.trim(),
    }),
  });

  return parseResponse<ResendResetOtpResponse>(response);
}
