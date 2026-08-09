'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import type { Locale } from '@/i18n/settings';

type Dictionary = Record<string, string | Record<string, string | any>>;

interface I18nContextProps {
  locale: Locale;
  dictionary: Dictionary;
}

const I18nContext = createContext<I18nContextProps | undefined>(undefined);

export function I18nProvider({
  children,
  locale,
  dictionary,
}: {
  children: ReactNode;
  locale: Locale;
  dictionary: Dictionary;
}) {
  return (
    <I18nContext.Provider value={{ locale, dictionary }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  
  // A simple translation function that supports nested keys (e.g. "auth.login.title")
  const t = (key: string, variables?: Record<string, string | number>) => {
    const keys = key.split('.');
    let value: any = context.dictionary;
    
    for (const k of keys) {
      if (value === undefined || value === null) break;
      value = value[k];
    }
    
    if (typeof value === 'string' && variables) {
      return Object.entries(variables).reduce((str, [k, v]) => {
        return str.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
      }, value);
    }
    
    if (typeof value === 'string') {
      return value;
    }
    
    return key; // Fallback to key if not found
  };
  
  return { t, locale: context.locale };
}
