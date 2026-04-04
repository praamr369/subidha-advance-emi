type PasswordResetIdentity = {
  phone?: string | null;
  email?: string | null;
  username?: string | null;
};

function normalizeValue(value: string | null | undefined): string {
  return (value || "").trim();
}

export function resolvePasswordResetIdentifier(
  identity: PasswordResetIdentity
): string | null {
  const phone = normalizeValue(identity.phone);
  if (phone) return phone;

  const email = normalizeValue(identity.email);
  if (email) return email;

  const username = normalizeValue(identity.username);
  if (username) return username;

  return null;
}

export function buildForgotPasswordHref(identifier?: string | null): string {
  const normalized = normalizeValue(identifier);
  if (!normalized) return "/forgot-password";

  const params = new URLSearchParams();
  params.set("identifier", normalized);
  return `/forgot-password?${params.toString()}`;
}

export function buildResetPasswordHref(identifier?: string | null): string {
  const normalized = normalizeValue(identifier);
  if (!normalized) return "/reset-password";

  const params = new URLSearchParams();
  params.set("identifier", normalized);
  return `/reset-password?${params.toString()}`;
}
