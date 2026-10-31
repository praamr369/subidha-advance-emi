import { apiFetch } from "@/lib/api";

export type HandoverSessionType = "SIGNATURE" | "CUSTOMER_ID";
export type HandoverSessionStatus = "WAITING" | "COMPLETED";

export type HandoverSession = {
  session_id: string;
  session_type: HandoverSessionType;
  title: string;
  customer_name?: string;
  customer_phone?: string;
  status: HandoverSessionStatus;
  handover_url?: string;
  data?: {
    signature_data?: string;
    customer_id?: number;
    phone?: string;
    name?: string;
    customer_code?: string;
    scanned_text?: string;
  };
};

export async function createHandoverSession(params: {
  session_type: HandoverSessionType;
  title?: string;
  customer_name?: string;
  customer_phone?: string;
}): Promise<HandoverSession> {
  return apiFetch<HandoverSession>("/public/mobile-handover/sessions/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

export async function getHandoverSession(sessionId: string): Promise<HandoverSession> {
  return apiFetch<HandoverSession>(`/public/mobile-handover/sessions/${sessionId}/`, {
    cache: "no-store",
  });
}

export async function submitHandoverSession(
  sessionId: string,
  data: Record<string, unknown>
): Promise<{ status: string; message: string }> {
  return apiFetch<{ status: string; message: string }>(
    `/public/mobile-handover/sessions/${sessionId}/submit/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }
  );
}

export function dataUrlToFile(dataUrl: string, filename = `signature_${Date.now()}.png`): File {
  const arr = dataUrl.split(",");
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const bstr = atob(arr[1] || "");
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

export function extractCustomerQuery(raw: string): { phone?: string; customer_code?: string; text: string } {
  const trimmed = raw.trim();
  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const url = new URL(trimmed);
      const phoneParam = url.searchParams.get("phone") || url.searchParams.get("mobile");
      const codeParam = url.searchParams.get("code") || url.searchParams.get("customer") || url.searchParams.get("id");
      if (phoneParam) return { phone: phoneParam.replace(/\D/g, ""), text: phoneParam };
      if (codeParam) return { customer_code: codeParam.toUpperCase(), text: codeParam };
      const pathParts = url.pathname.split("/").filter(Boolean);
      const last = pathParts[pathParts.length - 1];
      if (last) {
        if (/^\d{10}$/.test(last)) return { phone: last, text: last };
        if (last.startsWith("CUST-")) return { customer_code: last.toUpperCase(), text: last };
      }
    }
  } catch {
    // not a valid URL
  }

  const mobileMatch = trimmed.match(/mobile="(\d{10})"/i) || trimmed.match(/phone="(\d{10})"/i);
  if (mobileMatch) {
    return { phone: mobileMatch[1], text: mobileMatch[1] };
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) {
    return { phone: digits, text: digits };
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return { phone: digits.slice(2), text: digits.slice(2) };
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return { phone: digits.slice(1), text: digits.slice(1) };
  }

  const custCodeMatch = trimmed.match(/\b(CUST-[A-Z0-9-]+)\b/i);
  if (custCodeMatch) {
    return { customer_code: custCodeMatch[1].toUpperCase(), text: custCodeMatch[1].toUpperCase() };
  }

  return { text: trimmed };
}
