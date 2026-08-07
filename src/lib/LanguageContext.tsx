import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Language, supportedLanguages, translations, TranslationKey } from './i18n';

const STORAGE_KEY = 'ornix_language';

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  availableLanguages: Record<Language, string>;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => {},
  t: (key) => key,
  availableLanguages: supportedLanguages,
});

function interpolate(value: string, vars?: Record<string, string | number>) {
  if (!vars) return value;
  return Object.entries(vars).reduce((result, [key, replacement]) => {
    return result.replace(new RegExp(`{{\s*${key}\s*}}`, 'g'), String(replacement));
  }, value);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('bn');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Language | null;
    if (stored === 'bn' || stored === 'en') {
      setLanguageState(stored);
    }
  }, []);

  const setLanguage = (nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    window.localStorage.setItem(STORAGE_KEY, nextLanguage);
  };

  const t = useMemo(
    () => (key: TranslationKey, vars?: Record<string, string | number>) => {
      const translation = translations[language][key] ?? key;
      return interpolate(translation, vars);
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, availableLanguages: supportedLanguages }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
