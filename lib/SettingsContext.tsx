import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import { useUser } from "@clerk/expo";
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
  const { user } = useUser();
  const userId = user?.id ?? "";

  const [language, setLangState] = useState<Language>("en");
  const [themePreference, setThemePrefState] = useState<ThemePreference>("system");

  // Reload settings whenever the signed-in user changes
  useEffect(() => {
    if (!userId) return;
    Promise.all([loadLanguagePref(userId), loadThemePref(userId)]).then(
      ([lang, theme]) => {
        if (lang === "en" || lang === "bn") setLangState(lang as Language);
        if (theme === "system" || theme === "dark" || theme === "light")
          setThemePrefState(theme as ThemePreference);
      }
    );
  }, [userId]);

  const isDark =
    themePreference === "dark"
      ? true
      : themePreference === "light"
      ? false
      : systemScheme === "dark";

  const t = translations[language];

  const setLanguage = useCallback(async (lang: Language) => {
    setLangState(lang);
    if (userId) await saveLanguagePref(userId, lang);
  }, [userId]);

  const setThemePreference = useCallback(async (pref: ThemePreference) => {
    setThemePrefState(pref);
    if (userId) await saveThemePref(userId, pref);
  }, [userId]);

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
