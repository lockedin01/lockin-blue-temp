'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { DEFAULT_LOCALE, type Locale } from './config';
import en from './messages/en.json';
import hi from './messages/hi.json';
import mr from './messages/mr.json';

type Messages = typeof en;

const MESSAGES: Record<Locale, Messages> = { en, hi: hi as Messages, mr: mr as Messages };

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (path: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

const resolve = (messages: Messages, path: string): string => {
  const value = path
    .split('.')
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], messages);
  return typeof value === 'string' ? value : path;
};

export function I18nProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  const value: I18nValue = {
    locale,
    setLocale,
    t: (path) => resolve(MESSAGES[locale], path),
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}
