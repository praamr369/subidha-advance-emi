export const fallbackLng = 'en';
export const languages = ['en', 'hi', 'bn'] as const;
export const cookieName = 'NEXT_LOCALE';

export type Locale = (typeof languages)[number];
