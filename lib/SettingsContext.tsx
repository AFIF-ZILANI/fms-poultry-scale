import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import { translations, type Language, type Translations } from "./i18n";
import { loadLanguagePref, loadThemePref, saveLanguagePref, saveThemePref } from "./storage";

export type ThemePreference = "system" | "dark" | "light";

interface SettingsContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  themePreference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => Promise<void>;
  isDark: boolean;
  t: Translations;
}

const defaultCtx: SettingsContextType = {
  language: "en",
  setLanguage: async () => {},
  themePreference: "system",
  setThemePreference: async () => {},
  isDark: false,
  t: translations.en,
};

const SettingsContext = createContext<SettingsContextType>(defaultCtx);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [language, setLangState] = useState<Language>("en");
  const [themePreference, setThemePrefState] =
    useState<ThemePreference>("system");

  useEffect(() => {
    Promise.all([loadLanguagePref(), loadThemePref()]).then(
      ([lang, theme]) => {
        if (lang === "en" || lang === "bn") setLangState(lang as Language);
        if (
          theme === "system" ||
          theme === "dark" ||
          theme === "light"
        )
          setThemePrefState(theme as ThemePreference);
      }
    );
  }, []);

  const isDark =
    themePreference === "dark"
      ? true
      : themePreference === "light"
      ? false
      : systemScheme === "dark";

  const t = translations[language];

  const setLanguage = useCallback(async (lang: Language) => {
    setLangState(lang);
    await saveLanguagePref(lang);
  }, []);

  const setThemePreference = useCallback(async (pref: ThemePreference) => {
    setThemePrefState(pref);
    await saveThemePref(pref);
  }, []);

  return (
    <SettingsContext.Provider
      value={{ language, setLanguage, themePreference, setThemePreference, isDark, t }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextType {
  return useContext(SettingsContext);
}
