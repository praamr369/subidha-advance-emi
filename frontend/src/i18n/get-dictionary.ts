import 'server-only';
import type { Locale } from './settings';

const dictionaries = {
  en: () => import('./locales/en.json').then((module) => module.default),
  hi: () => import('./locales/hi.json').then((module) => module.default),
  bn: () => import('./locales/bn.json').then((module) => module.default),
};

export const getDictionary = async (locale: Locale) => {
  return dictionaries[locale]?.() ?? dictionaries.en();
};
