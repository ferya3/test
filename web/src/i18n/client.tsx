'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { dirOf, localePath, type Locale } from './config';
import type { Dictionary } from './dictionaries';

type LocaleContext = { locale: Locale; t: Dictionary };

const Context = createContext<LocaleContext | null>(null);

/** Makes the page's language and its strings available to client components. */
export function LocaleProvider({ locale, t, children }: LocaleContext & { children: ReactNode }) {
  // The server sets <html lang dir> on every full load. This keeps them right
  // if a navigation ever crosses languages without one (history, a stray link).
  useEffect(() => {
    const html = document.documentElement;
    if (html.lang !== locale) html.lang = locale;
    if (html.dir !== dirOf(locale)) html.dir = dirOf(locale);
  }, [locale]);

  return <Context.Provider value={{ locale, t }}>{children}</Context.Provider>;
}

export function useLocale() {
  const value = useContext(Context);
  if (!value) throw new Error('useLocale() outside <LocaleProvider>');
  return { ...value, path: (p: string) => localePath(value.locale, p) };
}
