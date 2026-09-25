import { createContext, useContext, useMemo } from 'react';
import { translations, bnTranslations, TranslationKey, LanguageScope } from './i18n';

// English site, with one exception: the checkout flow renders in Bengali.
// A `LanguageScopeProvider` high in the checkout route subtree swaps the
// translation table for every `t()` call beneath it — no per-component work.
// The rest of the site keeps the default English map.

const MAPS: Record<LanguageScope, Record<string, string>> = {
  default: translations,
  checkout: bnTranslations,
};

interface LanguageContextValue {
  lang: 'en' | 'bn';
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  t: (key) => key,
});

function interpolate(value: string, vars?: Record<string, string | number>) {
  if (!vars) return value;
  return Object.entries(vars).reduce((result, [key, replacement]) => {
    return result.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), String(replacement));
  }, value);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const t = useMemo(
    () => (key: TranslationKey, vars?: Record<string, string | number>) => {
      const translation = translations[key] ?? key;
      return interpolate(translation, vars);
    },
    []
  );

  return (
    <LanguageContext.Provider value={{ lang: 'en', t }}>
      {children}
    </LanguageContext.Provider>
  );
}

/** Swap the translation table for this subtree (e.g. Bengali checkout). */
export function LanguageScopeProvider({
  scope,
  children,
}: {
  scope: LanguageScope;
  children: React.ReactNode;
}) {
  const t = useMemo(
    () => (key: TranslationKey, vars?: Record<string, string | number>) => {
      const translation = MAPS[scope][key] ?? translations[key] ?? key;
      return interpolate(translation, vars);
    },
    [scope]
  );

  return (
    <LanguageContext.Provider value={{ lang: scope === 'checkout' ? 'bn' : 'en', t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
