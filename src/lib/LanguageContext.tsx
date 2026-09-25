import { createContext, useContext, useMemo } from 'react';
import { translations, TranslationKey } from './i18n';

// Single-language site (English). The provider is kept so components can keep
// calling `t('key', vars)` without any other code changes.

interface LanguageContextValue {
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
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
    <LanguageContext.Provider value={{ t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
