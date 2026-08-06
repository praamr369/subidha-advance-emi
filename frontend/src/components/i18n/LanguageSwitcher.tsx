'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Globe } from 'lucide-react';

import { setLocale } from '@/i18n/actions';
import { type Locale, languages } from '@/i18n/settings';
import { useI18n } from './I18nProvider';

const languageNames: Record<Locale, string> = {
  en: 'English',
  hi: 'हिंदी (Hindi)',
  bn: 'বাংলা (Bengali)',
};

export function LanguageSwitcher() {
  const router = useRouter();
  const { locale: currentLocale } = useI18n();
  const [isOpen, setIsOpen] = React.useState(false);
  const [isPending, setIsPending] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLanguageChange = async (locale: Locale) => {
    if (locale === currentLocale) {
      setIsOpen(false);
      return;
    }
    setIsPending(true);
    await setLocale(locale);
    router.refresh(); // Tell Next.js Server Components to re-render with the new cookie
    setIsOpen(false);
    setIsPending(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isPending}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
      >
        <Globe className="h-4 w-4 text-muted-foreground" />
        <span className="hidden sm:inline-block">{languageNames[currentLocale]}</span>
        <span className="sm:hidden">{currentLocale.toUpperCase()}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-xl border border-border bg-[var(--surface-card-elevated)] p-1 text-foreground shadow-[var(--surface-shadow-lg)]">
          {languages.map((locale) => (
            <button
              key={locale}
              onClick={() => handleLanguageChange(locale)}
              className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors hover:bg-muted hover:text-foreground focus:bg-muted focus:text-foreground"
            >
              <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                {currentLocale === locale && <Check className="h-4 w-4" />}
              </span>
              {languageNames[locale]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
