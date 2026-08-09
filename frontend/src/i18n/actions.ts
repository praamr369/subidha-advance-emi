'use server';

import { cookies } from 'next/headers';
import { cookieName, Locale } from './settings';

export async function setLocale(locale: Locale) {
  (await cookies()).set(cookieName, locale, { path: '/' });
}
