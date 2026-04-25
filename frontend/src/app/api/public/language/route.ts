import { NextResponse } from "next/server";

import { PUBLIC_LANG_COOKIE, PUBLIC_LANGUAGES, type PublicLanguage } from "@/lib/public-i18n";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as { language?: string };
  const language = payload.language;

  if (!language || !PUBLIC_LANGUAGES.includes(language as PublicLanguage)) {
    return NextResponse.json({ error: "Invalid language" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(PUBLIC_LANG_COOKIE, language, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}
